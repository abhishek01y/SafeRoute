# Delhi Safe-Route System — IEEE-Grade Technical Blueprint
**Version 1.0.0 | Last Updated: 2026-05-29**

---

## SECTION 1: SYSTEM ARCHITECTURE & DATA WORKFLOW PIPELINE

### 1.1 Data Ingestion Workflow

The pipeline is a sequential 5-stage process orchestrated by `main.py:50-62`:

```
Shapefiles / OSM PBF → Pickle Cache → NetworkX DiGraph → SafeRouter → FastAPI
```

**Stage 1 — Graph Loading** (`data_loader.py:207-215`)
```
load_and_segment_delhi_data()
  ↓
load_pickle_graph()                    # Try pre-built pickle (71 MB, 602K nodes)
  ↓
_download_pickle() (fallback)          # Download from HF Hub if missing
  ↓
_merge_nearby_nodes(tolerance=0.0003°) # Merge nodes within ~33m
```

**Stage 2 — Shapefile/OSM PBF Processing** (`data_loader.py:218-371`)
The pipeline falls back to raw processing if no pickle exists:
1. Reads `delhi_highway.shp` via `geopandas.read_file()`
2. Unifies CRS to EPSG:4326 (`data_loader.py:237-238`)
3. Reads `delhi_poi.shp` + `delhi_administrative.shp` for spatial indexing
4. Loads additional `*.osm.pbf` files via `pyrosm.OSM.get_network()` for both driving and walking networks (`data_loader.py:17-29`)
5. Combines all road geometries via `pd.concat()`, deduplicates on geometry

**Stage 3 — Micro-Segmentation** (`data_loader.py:74-127`)
Each LineString/MultiLineString is split into 75m sub-segments using `shapely.ops.substring()` with normalized fractions.

**Stage 4 — Graph Construction** (`data_loader.py:92-127`)
Nodes are `(lat, lon)` tuples rounded to 6 decimal places (~1.1m precision). Edges store all safety attributes + WKT geometry strings.

**Stage 5 — Server Initialization** (`main.py:49-62`)
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    G = load_and_segment_delhi_data(...)   # Returns nx.DiGraph
    router = SafeRouter(G)                 # Wraps graph with KD-Tree + giant component
    gdelt_task = asyncio.create_task(gdelt_background_loop())  # 10-min periodic updater
```

### 1.2 The Core Pipeline Code

**File:** `main.py:49-81`

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    global G, router
    G = load_and_segment_delhi_data(
        highway_shp_path=HIGHWAY_SHP,     # data/delhi_highway.shp
        poi_shp_path=POI_SHP,             # data/delhi_poi.shp
        admin_shp_path=ADMIN_SHP          # data/delhi_administrative.shp
    )
    router = SafeRouter(G)                # Builds KD-Tree, computes giant component
    gdelt_task = asyncio.create_task(gdelt_background_loop())
    yield                                  # Server runs here
    gdelt_task.cancel()

async def gdelt_background_loop():
    while True:
        await asyncio.sleep(600)          # Every 10 minutes
        await update_safety_scores_from_news(safety_engine, G, router)
```

### 1.3 Data Loss & Geometry Handling

**Missing CRS:** `data_loader.py:39-40`, `237-238`
```python
if combined.crs and combined.crs.to_string() != "EPSG:4326":
    combined = combined.to_crs("EPSG:4326")
```
Silently skips CRS transformation if `crs` is `None`.

**Missing Fields:** `data_loader.py:284-288`, `330`
```python
road_name = str(row.get('NAME', 'Unnamed Road')) if 'NAME' in row.index and pd.notna(...) else 'Unnamed Road'
road_type = str(row.get('TYPE', 'residential')) ...
lanes = int(row.get('LANES', 1)) if 'LANES' in row.index and pd.notna(...) else 1
```
Every attribute query uses `.get(key, default)` with sensible defaults.

**Disconnected Components:** `routing_engine.py:173-181`
```python
def _compute_giant_component(self):
    undirected = self.G.to_undirected()
    components = list(nx.connected_components(undirected))
    giant = max(components, key=len)
```
Only the largest connected component (602K/602K ≈ 100%) is used for routing. Isolated subgraphs are ignored.

**Null Geometries:** `data_loader.py:275-276`
```python
if line is None or line.geom_type not in ('LineString', 'MultiLineString'):
    continue
```
Non-LineString geometries (Points, Polygons, None) are silently skipped.

**Empty DataFrame:** `data_loader.py:25-26`
```python
if combined is None or len(combined) == 0:
    print(f"[WARN] No roads found in {pbf_path}")
    return existing_G
```

---

## SECTION 2: MODULE 1 — SPATIAL GRAPH & ROAD MICRO-SEGMENTATION

### 2.1 Graph Serialization

**Libraries:** `networkx` (graph), `geopandas` (shapefiles), `shapely` (geometry ops), `numpy` (KD-Tree), `pyrosm` (OSM PBF), `scipy.spatial.KDTree` (spatial index)

**Graph type:** `nx.DiGraph()` — directed multi-digraph

**Graph tuple:** `G = (V, E, W)` where:
- `V` = set of nodes `(lat, lon)` tuples, 6-decimal precision (~1.1m)
- `E` = directed edges `(u, v)` with attribute dictionaries
- `W` = edge weight function computed at query time by `calculate_edge_cost()`

**Constructor code** (`routing_engine.py:195-200`):
```python
class SafeRouter:
    def __init__(self, graph):
        self.G = graph                                    # nx.DiGraph
        self.giant_component = self._compute_giant_component()  # Largest SCC
        self._kdtree = None
        self._node_list = None
        self._build_kdtree()                              # scipy.spatial.KDTree
```

### 2.2 Micro-Segmentation Algorithm

**File:** `data_loader.py:74-127`

The algorithm breaks each road LineString into 75m sub-segments:

```python
seg_length = segment_line.length * 111000     # degrees → meters (approximate)
if seg_length < 1:
    seg_length = segment_line.length * 111320  # fallback conversion factor
num_segments = max(1, min(30, int(seg_length / segment_length_m)))  # 75m each

for i in range(num_segments):
    start_frac = i / num_segments
    end_frac = (i + 1) / num_segments
    sub_seg = substring(segment_line, start_frac, end_frac, normalized=True)
```

**Mathematical model:**
```
For a LineString L with total length D (meters):
  n = max(1, min(30, ⌊D / 75⌋))
  For each i ∈ [0, n-1]:
    L_i = substring(L, i/n, (i+1)/n, normalized=True)
    length_km_i = length(L_i) × 111.0
    start_node = (round(L_i[0].y, 6), round(L_i[0].x, 6))
    end_node   = (round(L_i[-1].y, 6), round(L_i[-1].x, 6))
```

MultiLineStrings are decomposed into individual LineStrings first (`data_loader.py:60-63`), then each is micro-segmented.

### 2.3 Geospatial Properties

Each directed edge stores the following attribute dictionary (`data_loader.py:106-114`):

```python
G.add_edge(start_node, end_node,
    edge_id=int,           # Unique sequential ID
    name=str,              # "Unnamed Road" fallback
    type=str,              # highway classification: "motorway", "residential", etc.
    lanes=int,             # Default: 2
    oneway=str,            # "yes" | "no"
    length_km=float,       # Sub-segment length in km
    geometry=str,          # WKT: "LINESTRING (lon lat, lon lat, ...)"
    poi_density=float,     # 0-100, computed from base safety × 0.8
    lighting_score=float,  # 0-100, computed from base safety × 0.7
    footfall=float,        # 0-100, computed from base safety × 0.6
    crime_risk=float,      # Default: 20.0
    ai_sentiment=float,    # Default: 10.0
    crowdsourced_risk=float, # Default: 5.0
    safety_score=float,    # 0-100, from type_safety dictionary
)
```

**Directionality:** If `oneway != 'yes'`, a reverse edge is also added (`data_loader.py:117-127`).

**WKT geometry format:** `"LINESTRING (77.2410 28.6560, 77.2400 28.6555)"`
Note: coordinates are stored as `(lon lat)` per WKT standard, but nodes use `(lat, lon)` tuples.

---

## SECTION 3: MODULE 2 — MULTI-LAYER SAFETY ESTIMATION ENGINE

### 3.1 Layer A — POI Density

**File:** `data_loader.py:374-401` (legacy STRtree approach)

The current deployment uses a simplified proxy rather than live R-Tree queries:

```python
# In data_loader.py during graph construction:
poi_density = base_safety * 0.8  # Proxy: scaled from road type safety
```

The legacy STRtree-based function exists but is not invoked in the main flow:

```python
def _calculate_poi_density(segment, tree, pois_gdf, radius_deg=0.002):
    centroid = segment.centroid
    buffer = centroid.buffer(radius_deg)       # ~200m radius
    candidates = tree.query(buffer)             # shapely STRtree query
    count = len(candidates)
    density = min(100.0, count * 8.0)
    return max(10.0, density)
```

**POI tags expected from `delhi_poi.shp`:**
- The `CATEGORY` column is checked for transport words: `'transport'`, `'metro'`, `'bus'`, `'railway'` (`data_loader.py:420`)

### 3.2 Layer B — Crime Density Heatmap (KDE-equivalent)

**File:** `safety_engine.py:46-64`

The system implements a linear distance-decay KDE surrogate rather than scipy KDE:

```python
def compute_crime_risk_kde(self, edge_centroid_lat, edge_centroid_lon, incident_data=None):
    risk = 0.0
    for inc in incident_data:
        dist = self._haversine(edge_centroid_lat, edge_centroid_lon, inc['lat'], inc['lon'])
        if dist < 1.0:
            risk += 30.0 * (1.0 - dist)          # Linear decay within 1km
        elif dist < 3.0:
            risk += 15.0 * (1.0 - (dist - 1.0) / 2.0)  # Reduced decay 1-3km
    return min(100.0, risk)
```

**Mathematical model:**
```
risk(e) = Σ_{i: dist_i < 1km} 30 × (1 - dist_i) + Σ_{i: 1 ≤ dist_i < 3km} 15 × (1 - (dist_i - 1) / 2)

where dist_i = haversine(edge_centroid, incident_i) in kilometers
```

**Bandwidth parameters:** Implicit hard cutoffs at 1km (full weight: 30) and 3km (reduced weight: 15).

### 3.3 Layer C & D — Lighting & Footfall Proxies

**Lighting Proxy** (`safety_engine.py:66-73`):
```python
def compute_lighting_proxy(self, lit_tag, poi_density_score):
    if lit_tag and lit_tag.lower() == 'yes':    return 100.0    # Explicit "lit=yes"
    if poi_density_score > 60:                  return 75.0     # Dense area proxy
    if poi_density_score > 30:                  return 50.0
    return 25.0                                                  # Dark
```

**Footfall Score** (`safety_engine.py:75-76`):
```python
def compute_footfall_score(self, transit_nearby_count):
    return min(100.0, 20.0 + transit_nearby_count * 20.0)  # 20 base + 20 per transit stop
```

During graph construction, proxies are simplified (`data_loader.py`):
```python
poi_density = base_safety * 0.8       # 0-100 scaled from road type safety
lighting_score = base_safety * 0.7
footfall = base_safety * 0.6
```

### 3.4 Layer E — Real-Time GDELT NLP Sentiment

**Dual-Model Architecture** (`bert_analyzer.py:11-34`):

```python
# Model 1: Sentiment Analysis
_pipeline = pipeline(
    "sentiment-analysis",
    model="distilbert-base-uncased-finetuned-sst-2-english",
    max_length=512, truncation=True
)
# Model 2: Zero-shot Crime Classification
_classifier = pipeline(
    "zero-shot-classification",
    model="cross-encoder/nli-distilroberta-base",
    max_length=256, truncation=True
)
```

**Severity Computation** (`bert_analyzer.py:88-101`):
```python
def compute_bert_severity(title, snippet=""):
    text = f"{title} {snippet}".strip()
    sentiment_severity, label = analyze_news_sentiment(text)    # DistilBERT
    crime_severity = classify_crime_severity(text)              # RoBERTa zero-shot
    if both valid:
        return (sentiment_severity × 0.4 + crime_severity × 0.6)  # Weighted blend
```

**Sentiment → Severity mapping** (`bert_analyzer.py:49-53`):
```python
if label == "NEGATIVE": severity = 40.0 + score × 60.0  # Range: 40-100
else:                    severity = score × 30.0           # Range: 0-30
```

**Zero-shot crime labels** (`bert_analyzer.py:69-72`):
```python
["violent crime", "minor crime", "peaceful protest", "accident",
 "general news", "traffic", "positive news"]
```
With severity mapping: `{"violent crime": 90, "minor crime": 60, "peaceful protest": 50, ...}`

**GDELT Fetch & Geocoding** (`gdelt_updater.py:24-116`):
```python
# GDELT API query with crime keywords + Delhi location
query = '("crime" OR "protest" OR "robbery" OR "assault" OR "accident" OR "violence") location:"Delhi"'
url = f"https://api.gdeltproject.org/api/v2/doc/doc?query={query}&mode=ArtList&format=JSON&timespan=24h&maxrecords=50"
```

Articles are parsed, matched against 21 crime keywords (`gdelt_updater.py:14-21`), and geocoded via:
1. Explicit `lat`/`lon` fields from GDELT
2. Geometry `coordinates` field
3. Random point within Delhi bounding box (fallback)

**Keyword fallback** (`gdelt_updater.py:86-91`):
```python
if bert_severity is None:  # Model loading failed
    if any(kw in ["murder", "rape", "assault", ...]):  severity_multiplier = 2.0
    elif any(kw in ["robbery", "theft", ...]):          severity_multiplier = 1.5
    else:                                               severity_multiplier = 1.0
```

**Severity formula** (`gdelt_updater.py:103`):
```python
severity = min(100, 30 × severity_multiplier + len(matched_keywords) × 10)
```

**Edge Score Update** (`gdelt_updater.py:130-155`):
```python
for each edge (u, v, data) in G.edges():
    ai_risk = safety_engine.compute_ai_sentiment_risk(mid_lat, mid_lon, news_items)
    data['ai_sentiment'] = ai_risk
    new_score = safety_engine.compute_safety_score({...})
    if abs(new_score - old_score) > 0.5:
        data['safety_score'] = round(new_score, 1)
```

**Temporal decay:** There is no explicit decay function. Each 10-minute GDELT cycle calls `safety_engine.gdelt_cache.clear()` (`gdelt_updater.py:124`), completely replacing all cached articles. Older articles simply stop appearing when they fall outside the 24h GDELT query window.

---

## SECTION 4: MODULE 3 — DYNAMIC WEIGHTED ROUTING ENGINE

### 4.1 The Risk-Aware Cost Function

**File:** `routing_engine.py:102-165`

The A* edge cost is computed by `calculate_edge_cost()` as:

```python
cost = (distance × time_multiplier) + risk_penalty + extra_penalty
```

**Full formula derivation:**

```
Let:
  d     = edge_data['length_km']
  S     = effective safety score ∈ [0, 100] (after sigmoid stretch + mode modifiers)
  λ     = lambda_factor ∈ {0.0, 40.0, 200.0}
  t_mul = time_multiplier ∈ {0.8, 1.0, 1.5, 8.0, 10.0, 12.0}

Then:
  risk_penalty  = λ × (100 - S) × 0.01
  extra_penalty = mode-specific additive penalties (e.g., +8.0 for women safety on narrow roads)
  
  cost = d × t_mul + λ × (100 - S) / 100 + extra_penalty
```

**Safety score blending** (before cost computation):
```python
# Step 1: Get stored or type-based score
if stored_safety >= 10:    base = stored_safety
else:                      base = TYPE_SAFETY_BASE[road_type]

# Step 2: Blend with road type
type_val = TYPE_SAFETY_BASE.get(road_type, 50)
S_raw = base × 0.3 + type_val × 0.7

# Step 3: Non-linear sigmoid stretch
S = sigmoid_stretch(S_raw)  # S_raw=44.5 → S≈43.3, S_raw=73.5 → S≈95.6

# Step 4: Apply safety mode modifiers (women_safety/domestic_tourist)
# Step 5: Apply night mode
# Step 6: Apply user weight
```

**Sigmoid stretch formula** (`routing_engine.py:92-99`):
```python
def _sigmoid_stretch(score, midpoint=50):
    deviation = score - midpoint
    factor = 1.0 + 0.04 × abs(deviation)
    stretched = midpoint + deviation × factor
    return clamp(10.0, 98.0, stretched)
```

This is a quadratic stretch function. For a score of 50, no change. For score=70 (d=20), factor=1.8 → stretched=86. For score=30 (d=-20), factor=1.8 → stretched=14.

**λ values per routing mode** (`routing_engine.py:214-221`):
```
shortest: λ = 0.0    (pure distance, no safety penalty)
balanced: λ = 40.0   (moderate safety influence)
safest:   λ = 200.0  (safety dominates distance)
```

### 4.2 Weighted A* Search Algorithm

**Code** (`routing_engine.py:223-237`):
```python
path = nx.astar_path(
    self.G,
    source=start_node,
    target=end_node,
    heuristic=self._heuristic,
    weight=lambda u, v, d: calculate_edge_cost(
        u, v, d,
        lambda_factor=factor,
        user_weight=user_weight,
        transport=transport,
        is_night=is_night,
        safety_mode=safety_mode
    )
)
```

**Heuristic function** (`routing_engine.py:398-401`):
```python
def _heuristic(self, a, b):
    lat1, lon1 = a
    lat2, lon2 = b
    return math.sqrt((lat1 - lat2)² + (lon1 - lon2)²) × 111.0
```

This is the Euclidean distance scaled by 111 km/degree, converted to kilometers. The heuristic is **admissible** (never overestimates) because the minimum possible edge cost is `distance × min_time_multiplier + 0` (when λ=0), and the heuristic computes the straight-line distance which is always ≤ the actual path distance.

**A* evaluation logic:** At each node expansion, the algorithm evaluates:
```
f(n) = g(n) + h(n)
where:
  g(n) = Σ edge_cost along current path (distance × time_mul + risk_penalty + extra_penalty)
  h(n) = straight-line km from n to target × 111.0
```

When λ=0 (shortest): `g(n) = Σ(d × t_mul)` — pure distance-optimized
When λ=200 (safest): `g(n) = Σ(d × t_mul + 200 × (100-S)/100)` — safety dominates by up to 200 penalty points vs ~1-2 km distance cost

### 4.3 Multi-Route Multi-Objective Optimization

**Code** (`routing_engine.py:253-290`):
```python
def compare_routes(self, start_node, end_node, ...):
    # Three separate A* calls with different λ values
    shortest = self.get_safest_route(..., routing_mode="shortest")  # λ=0.0
    balanced = self.get_safest_route(..., routing_mode="balanced")  # λ=40.0
    safest   = self.get_safest_route(..., routing_mode="safest")    # λ=200.0
    return {'shortest': shortest, 'balanced': balanced, 'safest': safest}
```

Each mode triggers a **completely independent A* search** with a different weight function. The three resulting paths are returned separately and can produce different optimal routes.

**Compare endpoint** (`main.py:248-277`) also computes estimated time per transport mode:
```python
speed_kmh = {"car": 20, "motorcycle": 25, "walk": 5}
time_min = round((dist / speed_kmh) × 60, 1)
```

---

## SECTION 5: MODULE 4 — ANTI-SPAM TRUST LEDGER & EXPLAINABLE AI

### 5.1 Trust Multi-Layer Cross-Verification

**File:** `safety_engine.py:146-164`

```python
def validate_report_with_gdelt(self, edge_data, report_type):
    if report_type == 'safe':
        crime_risk = edge_data.get('crime_risk', 0)
        ai_risk = edge_data.get('ai_sentiment', 0)

        if crime_risk > 60 or ai_risk > 50:
            return {
                'override': True,              # Reject the "safe" report
                'status': 'CAUTION',
                'confidence': 'low',
                'reason': 'GDELT/news data shows active safety concerns in this area'
            }

    return {
        'override': False,                     # Accept the report
        'status': report_type,
        'confidence': 'high',
        'reason': 'Report accepted'
    }
```

**Three-layer trust model:**
1. **User Report** (`safety_engine.py:135-143`): Stored in `user_reports[edge_id]` dict with 48h temporal window
2. **GDELT AI Sentiment** (`safety_engine.py:78-94`): News severity ≥ 50 triggers caution
3. **Static Crime Filter** (`safety_engine.py:149`): Crime risk > 60 triggers override

A user submitting a "safe" report for a road where either the crime risk is >60 or the AI sentiment is >50 gets their report **overridden** with `CAUTION` status and `low` confidence.

### 5.2 Explainable AI (XAI) Parsing Engine

**File:** `safety_engine.py:166-210`

```python
def generate_xai_explanation(self, path_edges, G, shortest_distance=None, safest_distance=None):
    explanations = []
    high_risk_segments = []

    for each consecutive pair (u, v) in path_edges:
        if not G.has_edge(u, v): continue
        edge_data = G[u][v]
        safety = edge_data.get('safety_score', 70)
        risk = 100 - safety

        if safety < 45:  # Below threshold = high risk
            reasons = []
            if edge_data.get('lighting_score', 50) < 30:
                reasons.append(f"Low street-lighting (Score: {lighting_score:.0f}/100)")
            if edge_data.get('crime_risk', 0) > 50:
                reasons.append(f"Elevated crime index (Score: {crime_risk:.0f}/100)")
            if edge_data.get('ai_sentiment', 0) > 40:
                reasons.append("Recent incident reports in past 48 hours")
            if edge_data.get('poi_density', 50) < 30:
                reasons.append(f"Sparse POI density (Score: {poi_density:.0f}/100)")

            high_risk_segments.append({
                'road_name': edge_data.get('name', 'Unknown'),
                'safety_score': safety,
                'reasons': reasons
            })

    # Generate explanations for bypassed risky segments
    if shortest_distance and safest_distance:
        extra = safest_distance - shortest_distance
        if extra > 0:
            explanations.append(f"Selected route is {extra:.1f}km longer but avoids high-risk zones")

    for seg in high_risk_segments[:3]:  # Top 3 most dangerous
        reason_str = "; ".join(seg['reasons'])
        explanations.append(f"Bypassed {seg['road_name']} due to: {reason_str}")

    explanations.append(f"Average safety score: {100 - avg_risk:.1f}/100")
    return explanations
```

**XAI endpoint** (`main.py:333-362`):
```python
@app.post("/xai")
async def get_xai_explanation(req: RouteRequest):
    shortest = router.get_safest_route(..., "shortest", ...)
    safest = router.get_safest_route(..., req.mode, ...)
    explanations = safety_engine.generate_xai_explanation(
        safest['path'], G,
        shortest_distance=shortest['total_distance_km'],
        safest_distance=safest['total_distance_km']
    )
    return {
        "mode": req.mode,
        "safety_mode": req.safety_mode,
        "explanations": explanations,
        "shortest_distance_km": shortest['total_distance_km'],
        "selected_distance_km": safest['total_distance_km'],
        "safety_gain": safest['avg_safety_score'] - shortest['avg_safety_score'],
    }
```

---

## SECTION 6: FULL TECH STACK CONFIGURATION & INTERACTION SCHEMA

### 6.1 Database Schema

**No SQL database is used.** The system uses in-memory data structures:

| Structure | Type | Description | Persistence |
|-----------|------|-------------|-------------|
| `G = nx.DiGraph()` | In-memory graph | 602K nodes, 1.47M edges with full attributes | Loaded from pickle on startup |
| `safety_engine.user_reports` | Dict[str, List] | Edge-level crowdsourced reports | Lost on restart |
| `safety_engine.gdelt_cache` | Dict[str, dict] | GDELT news articles | Cleared every 10 min |
| `safety_engine.recent_incidents` | List[dict] | Incident reports (max 500) | Lost on restart |
| `deadman_alerts` | List[dict] | SOS-deadman trigger log (last 50) | Lost on restart |
| `active_nav_sessions` | Dict[str, dict] | Active navigation sessions | Lost on restart |

Graph edge attribute schema (`data_loader.py:106-114`):

| Attribute | Type | Range | Source |
|-----------|------|-------|--------|
| `edge_id` | `int` | 0+ | Sequential counter |
| `name` | `str` | — | Shapefile NAME field or "Unnamed Road" |
| `type` | `str` | — | Highway classification |
| `lanes` | `int` | 1+ | Shapefile LANES field or default 2 |
| `oneway` | `str` | "yes"/"no" | Shapefile ONEWAY field |
| `length_km` | `float` | 0.001+ | Sub-segment length × 111.0 |
| `geometry` | `str` | — | WKT LineString |
| `poi_density` | `float` | 0-100 | base_safety × 0.8 |
| `lighting_score` | `float` | 0-100 | base_safety × 0.7 |
| `footfall` | `float` | 0-100 | base_safety × 0.6 |
| `crime_risk` | `float` | 0-100 | Default 20.0 |
| `ai_sentiment` | `float` | 0-100 | Default 10.0, updated by GDELT |
| `crowdsourced_risk` | `float` | 0-100 | Default 5.0 |
| `safety_score` | `float` | 0-100 | From type_safety dict, updated by GDELT |

### 6.2 API Interaction Function

**Complete `/route` endpoint** (`main.py:220-245`):

```python
@app.post("/route")
async def get_route(req: RouteRequest):
    if router is None:
        raise HTTPException(status_code=503, detail="Graph not loaded yet")

    # Step 1: Snap coordinates to nearest graph nodes (KD-Tree O(log N))
    start_node = router.find_nearest_node(req.start_lat, req.start_lon)
    end_node = router.find_nearest_node(req.end_lat, req.end_lon)

    # Step 2: Execute Weighted A* Search
    result = router.get_safest_route(
        start_node, end_node,
        req.mode,                   # "shortest" | "balanced" | "safest"
        req.user_weight,
        req.transport,              # "car" | "motorcycle" | "walk"
        is_night=is_night_time(),   # UTC+5:30 heuristic
        safety_mode=req.safety_mode # "standard" | "women_safety" | "domestic_tourist"
    )

    # Step 3: Serialize node tuples to GeoJSON-like dicts
    path_coords = [{"lat": node[0], "lon": node[1]} for node in result['path']]

    # Step 4: Return REST payload
    return {
        "path": path_coords,                    # [{"lat": 28.656, "lon": 77.241}, ...]
        "path_edges": result['path_edges'],      # [{from, to, name, length_km, safety_score}, ...]
        "total_distance_km": result['total_distance_km'],
        "avg_safety_score": result['avg_safety_score'],
        "risk_exposure": result['risk_exposure'],
        "routing_mode": req.mode,
        "transport": req.transport,
        "safety_mode": req.safety_mode,
    }
```

**Pydantic request schema** (`main.py:97-105`):
```python
class RouteRequest(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    mode: str = "balanced"                # "shortest" | "balanced" | "safest"
    transport: str = "car"                # "car" | "motorcycle" | "walk"
    user_weight: Optional[float] = None   # 0-1 safety preference override
    safety_mode: str = "standard"         # "standard" | "women_safety" | "domestic_tourist"
```

### 6.3 Frontend Map Layer Rendering

**Frontend API Client** (`frontend/src/utils/api.js`):
```javascript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const api = axios.create({ baseURL: API_BASE, timeout: 120000 });

export async function compareRoutes(startLat, startLon, endLat, endLon, transport = 'car', safetyMode = 'standard') {
  const res = await api.post('/compare', {
    start_lat: startLat, start_lon: startLon,
    end_lat: endLat, end_lon: endLon,
    transport, safety_mode: safetyMode
  });
  return res.data;  // { shortest: {...}, balanced: {...}, safest: {...} }
}
```

**Route Rendering** (`frontend/src/components/Map.js`):
```javascript
const MODES = ['shortest', 'balanced', 'safest'];
const ROUTE_COLORS = ['#3b82f6', '#a855f7', '#22c55e'];  // Blue, Purple, Green

function getRouteColor(i) { return ROUTE_COLORS[i % 3]; }
function getRouteGlow(i) { return ['rgba(59,130,246,0.15)', 'rgba(168,85,247,0.15)', 'rgba(34,197,94,0.15)'][i % 3]; }

// Duplicate path deduplication (frontend):
function pathsEqual(a, b) {
  if (a.length !== b.length) return false;
  const step = Math.max(1, Math.floor(a.length / 20));
  for (let i = 0; i < a.length; i += step)
    if (Math.abs(a[i].lat - b[i].lat) > 0.0001 || Math.abs(a[i].lon - b[i].lon) > 0.0001) return false;
  return true;
}

function getUniqueRoutes(routes) {
  const result = [];
  const seen = [];
  MODES.forEach(key => {
    const r = routes?.[key];
    if (!r || !r.path || r.path.length < 2) return;
    if (seen.some(s => pathsEqual(s.path, r.path))) return;  // Skip duplicates
    seen.push(r);
    result.push({ ...r, _key: key });
  });
  return result;
}
```

The route polylines are rendered via `<Polyline>` with:
- **Color:** Mode-specific (Blue=shortest, Purple=balanced, Green=safest)
- **Weight:** 5px base + 3px glow
- **Opacity:** 0.9 with outer glow at 0.15
- **Distance markers:** Midpoint labels showing km
- **Interactive:** Click to highlight, popup with safety score

**Safety color mapping** (from `frontend/src/utils/locations.js`):
```javascript
function getSafetyColor(score) {
  if (score >= 75) return '#22c55e';  // Green
  if (score >= 45) return '#eab308';  // Yellow
  return '#ef4444';                    // Red
}
```

### 6.4 Full Tech Stack Summary

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Backend Framework** | FastAPI | ≥0.104 | REST API + lifespan events |
| **Graph Engine** | NetworkX | ≥3.0 | A* search, connected components |
| **Spatial Index** | scipy.spatial.KDTree | ≥1.11 | O(log N) node lookup |
| **Geospatial** | Shapely 2.0, GeoPandas 1.0 | — | LineString ops, WKT parsing |
| **OSM Parser** | Pyrosm | ≥0.6 | OSM PBF loading |
| **NLP** | Transformers (DistilBERT, RoBERTa) | ≥4.36 | Sentiment + zero-shot crime |
| **Numerical** | NumPy, scikit-learn | ≥1.24, ≥1.3 | KD-Tree, clustering |
| **Server** | Uvicorn | ≥0.24 | ASGI server |
| **Frontend** | Next.js + React-Leaflet | — | Map UI, glassmorphism design |
| **Deployment** | Docker + Hugging Face Spaces | — | Production hosting |
| **CI/CD** | GitHub + HF Hub | — | Auto-deploy on push |

### 6.5 Safety Protocol Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/navigation/session-start` | POST | Register active navigation session |
| `/safety/deadman-trigger` | POST | User unresponsive → SMS alert (mock) |
| `/navigation/verify-trajectory` | POST | 100m corridor deviation check |
| `/safety/alerts` | GET | Retrieve deadman alert log (last 50) |

**Deadman flow:** Frontend 300s timer → 60s countdown modal → `POST /safety/deadman-trigger` → mock SMS with Google Maps link.

**Trajectory verification** (`main.py:450-474`):
```python
route_line = LineString([(p[1], p[0]) for p in assigned_path])  # (lon, lat)
buffer_deg = 100.0 / 111320.0                                    # ~100m
corridor = route_line.buffer(buffer_deg)
current_point = Point(current_gps[1], current_gps[0])
on_track = current_point.within(corridor)
```
