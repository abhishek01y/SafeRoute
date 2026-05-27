# Delhi SafeRoute — Technical Handover Guide

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Vercel)                        │
│  Next.js + React + Leaflet + Tailwind CSS                      │
│  https://frontend-sand-zeta-57.vercel.app                      │
│                                                                │
│  index.js (state, dead-man timer, GPS)                         │
│    ├── Sidebar.js (route input, presets, travel profile)       │
│    ├── MapView.js (Leaflet, SOS FAB, GPSTracker, POIs)         │
│    ├── RouteInfo.js (route comparison cards)                   │
│    ├── XAIPanel.js (XAI explanations + safety mode badge)      │
│    ├── SafetyModal.js (dead-man confirmation modal)            │
│    └── api.js (axios client, cache layer)                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (HF Spaces)                         │
│  FastAPI + Uvicorn + NetworkX + Shapely + BERT                 │
│  https://abhisheky01-delhi-safe-route-api.hf.space             │
│                                                                │
│  main.py (FastAPI app, endpoints, startup)                     │
│  routing_engine.py (graph, edge cost, compare, profiles)       │
│  data_loader.py (pickle load, OSM download fallback)           │
│  news_based_safety.py (GDELT news + BERT analysis)             │
│  demand_based_pricing_model.py (road pricing model)            │
│  requirements.txt / Dockerfile                                 │
└──────────────────────┬──────────────────────────────────────────┘
                       │ Pickle (71 MB)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Data Pipeline (local)                          │
│  OSM PBF files (northern-zone + central-zone, ~550 MB total)   │
│    → Pyrosm filter (1.17M nodes / 2.51M edges)                 │
│    → Node merge (tolerance 0.0003deg ≈ 33m)                    │
│    → 602K nodes / 1.47M edges                                  │
│    → delhi_graph.pkl.gz (71 MB compressed)                     │
│    → Uploaded to HF Space + committed to GitHub                │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Data Dictionary

### Graph Node Attributes
| Attribute | Type | Description |
|-----------|------|-------------|
| `lat` | float | Latitude (WGS84) |
| `lon` | float | Longitude (WGS84) |
| `osm_id` | int | OSM node ID |
| `node_id` | int | Internal graph node ID |

### Graph Edge Attributes
| Attribute | Type | Description |
|-----------|------|-------------|
| `start_node` | int | Source node ID |
| `end_node` | int | Target node ID |
| `length_km` | float | Edge length (km) from geometry |
| `safety_score` | float | Base safety 0-100 (default 70) |
| `type` | str | OSM highway tag (primary, secondary, residential, etc.) |
| `maxspeed` | str | Speed limit from OSM (km/h) |
| `is_lit` | int | 1 if street_lit=yes, else 0 |
| `name` | str | Street name |
| `geometry` | LineString | WKT geometry (WGS84) |
| `oneway` | str | "yes" if one-way |

### Edge Safety Modifiers
| Condition | Penalty/Bonus |
|-----------|---------------|
| Highway=residential/service | -4 base safety |
| Highway=primary/trunk | +6 base safety |
| is_lit=0 | -15 (night mode only) |
| is_lit=1 | +15 (night mode only) |
| Women Safety: unlit edges | -25 additional |
| Women Safety: residential | +4.0 distance-equivalent cost |
| Women Safety: primary/trunk | +10 safety bonus |
| Women Safety: crime risk weight | 1.5× |
| Tourist: transit scam zone (500m) | -20 safety |
| Tourist: metro station (200m) | +15 safety |

### Travel Profile Modes
| Mode | Value | Description |
|------|-------|-------------|
| Standard | `standard` | Default routing, no special weights |
| Women Safety | `women_safety` | 1.5× crime weight, penalties on dark/residential, bonuses on lit/main roads |
| Domestic Tourist | `domestic_tourist` | Penalty near transit scam zones, bonus near metro stations |

### Transit Scam Zones (4 hubs)
- Delhi Junction (28.6611, 77.2275)
- New Delhi Railway Station (28.6421, 77.2206)
- Kashmere Gate (28.6680, 77.2280)
- Paharganj (28.6450, 77.2150)

### Metro Stations (30+ stations)
Includes all major Delhi Metro corridors: Red Line, Yellow Line, Blue Line, Violet Line, Pink Line, Magenta Line, Airport Express.

## 3. Algorithm Specifications

### Edge Cost Calculation
```
cost = length_km * weight(mode)
      + safety_penalty(mode)
      + night_penalty (if night mode)
      + tourist_penalty (if domestic_tourist)
      + women_safety_penalty (if women_safety)
```

### Routing Modes
- **shortest**: weight=1.0, safety_weight=0 (pure distance)
- **safest**: weight=0.3, safety_weight=0.7 (safety priority)
- **balanced**: weight=0.6, safety_weight=0.4 (balanced)

### Safety Score (0-100)
```
safety_score = base(70)
             + type_bonus (residential: -4, primary: +6)
             + night_bonus (lit: +15, unlit: -15)
             + women_safety_bonus (if applicable)
             + tourist_bonus (if applicable)
             - crime_penalty (risk_penalty(0.01) × crime_incidents)
clamped: max(10, min(98, safety_score))
```

### Dead-Man Switch Flow
1. User clicks "Find Route" → `POST /navigation/session-start`
2. 300s (5-min) interval timer starts
3. On interval: SafetyModal appears → 60s countdown
4. If "I am Safe" clicked: grace timer clears, interval continues
5. If 60s expires: `navigator.geolocation.getCurrentPosition()` → `POST /safety/deadman-trigger` → backend logs alert + mock SMS dispatch
6. SMS payload: `ALERT: User {session_id} at ({lat},{lon}) may be in danger. Google Maps: https://www.google.com/maps?q={lat},{lon}`

### Route Deviation Detection
1. `POST /api/navigation/verify-trajectory`
2. Backend creates shapely `LineString` from assigned path
3. Buffers by 100 meters: `line.buffer(100/111320)` (convert meters to degrees)
4. Checks if current GPS `Point` is within buffer
5. Returns `{ on_track: bool, deviation_m: number }`
6. Frontend polls every 30s via `navigator.geolocation.watchPosition`

## 4. Backend API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check + graph stats |
| POST | `/route` | Single route (params: start/end lat/lon, mode, transport, safety_mode) |
| POST | `/compare` | Compare all 3 modes (shortest, balanced, safest) |
| POST | `/evaluate` | Evaluate safety of a route |
| POST | `/xai` | XAI explanations for a route |
| GET | `/edges` | Graph edges (major=true for simplified) |
| GET | `/pois` | Points of interest (filter by type) |
| POST | `/report` | Submit edge safety report |
| POST | `/incident` | Submit incident report |
| GET | `/system-report` | System status |
| POST | `/navigation/session-start` | Start navigation session |
| POST | `/navigation/verify-trajectory` | Check GPS against assigned path |
| POST | `/safety/deadman-trigger` | Trigger emergency alert |
| GET | `/safety/alerts` | Get active safety alerts |

## 5. Frontend Component Tree

```
pages/index.js
├── Sidebar
│   ├── Route Tab (location inputs, transport, travel profile, find route)
│   ├── Presets Tab (6 quick routes)
│   └── Recent Tab (localStorage recent routes)
├── MapView (MapContainer)
│   ├── MapClickHandler
│   ├── StartEndMarkers
│   ├── RouteLayer
│   ├── POILayer
│   ├── CompassControl
│   └── GPSTracker
├── SOSFab (absolute positioned, tel:112)
├── RouteInfo
└── XAIPanel
```

## 6. Deployment Guide

### Backend (Hugging Face Spaces)
- Docker-based Space with 2GB RAM / 2 vCPU
- Auto-deploys from `backend/` directory on push to `main` branch
- Graph pickle at `backend/data/delhi_graph.pkl.gz` (71 MB)
- BERT models cached at `~/.cache/huggingface/` (~500MB)
- Cold start: ~30s on first request after idle

### Frontend (Vercel)
- Next.js static site, deploys from `frontend/` directory
- Build env required: `NEXT_PUBLIC_API_URL=https://abhisheky01-delhi-safe-route-api.hf.space`
- Manual deploy:
  ```
  npx vercel --prod --token YOUR_VERCEL_TOKEN --build-env NEXT_PUBLIC_API_URL=https://abhisheky01-delhi-safe-route-api.hf.space --yes --force
  ```

### Environment Variables
| Variable | Location | Value |
|----------|----------|-------|
| `NEXT_PUBLIC_API_URL` | Vercel (build env) | Backend HF Space URL |
| `EMERGENCY_CONTACT` | Backend env | `+911121223344` |
| `HF_TOKEN` | Local only | HF API token for pickle upload |

## 7. Key Files

| File | Purpose |
|------|---------|
| `backend/main.py` | FastAPI app, all endpoints |
| `backend/routing_engine.py` | Graph loading, routing, edge cost, safety profiles |
| `backend/data_loader.py` | Pickle loading with download fallback |
| `backend/data/delhi_graph.pkl.gz` | Compressed OSM graph (71 MB) |
| `frontend/src/pages/index.js` | Main page, state management, dead-man timer |
| `frontend/src/components/Map.js` | Leaflet map, SOS FAB, GPS tracking, POI layers |
| `frontend/src/components/Sidebar.js` | Sidebar with route input, presets, travel profile |
| `frontend/src/components/SafetyModal.js` | Dead-man switch confirmation modal |
| `frontend/src/components/RouteInfo.js` | Route comparison cards |
| `frontend/src/components/XAIPanel.js` | XAI explanations panel |
| `frontend/src/utils/api.js` | Axios client with caching layer |
| `frontend/src/utils/locations.js` | Location categories and quick routes |
| `frontend/src/styles/globals.css` | Glassmorphism styles, animations |

## 8. Limitations

- **No persistence**: In-memory NetworkX graph + Python dicts for reports/alerts/sessions. All dynamic data lost on Spaces restart.
- **Cold start**: HF Spaces free tier sleeps after inactivity (~30s cold boot).
- **BERT memory**: DistilBERT + zero-shot classifier consume ~1GB RAM; may cause OOM under concurrent requests.
- **GDELT API rate limits**: 10-min refresh cycle; may miss short-duration events.
- **Graph coverage**: Delhi NCR only (28.35-28.90N, 76.80-77.35E). No multi-city support.
- **Deviation accuracy**: 100m buffer corridor is heuristic; may false-positive in dense parallel streets.
- **SMS dispatch**: Mock implementation (console.log only). Requires Twilio/WhatsApp API integration for production.
- **Emergency number**: Hardcoded to 112 (India). Should be geo-detected for international use.

## 9. Roadmap

### Phase 1 (Current) - Core Safety Routing
- OSM-based routing with safety scores
- 3 transport modes + 3 travel profiles
- XAI explanations with BERT analysis
- GDELT news integration for dynamic safety

### Phase 2 - Navigation Safety Suite
- Dead-man switch with SMS dispatch
- SOS emergency call FAB
- GPS trajectory deviation detection

### Phase 3 - Production Hardening
- PostgreSQL/Persistent storage
- Twilio WhatsApp API for real SMS
- Multi-city graph support
- WebSocket live tracking
- Progressive Web App (offline maps)
- iOS/Android app via Capacitor

### Phase 4 - Advanced Features
- Crowd-sourced safety reports with reputation
- ML-predicted crime hotspots (time-series)
- Voice navigation with Hindi/Tamil support
- Integration with Ola/Uber/auto-rickshaw APIs
- Real-time traffic + safety overlay
