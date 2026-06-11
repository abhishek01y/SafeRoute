import networkx as nx
import heapq
import math
import numpy as np
from shapely.geometry import LineString, Point
from shapely import wkt

# KD-Tree for O(log N) node lookup
try:
    from scipy.spatial import KDTree
    _HAS_SCIPY = True
except ImportError:
    _HAS_SCIPY = False

# Interstate transit hubs for Domestic Tourist mode avoidance (lat, lon)
TRANSIT_SCAM_ZONES = [
    (28.6615, 77.2270),  # Delhi Junction
    (28.6420, 77.2210),  # New Delhi Railway Station
    (28.6720, 77.2320),  # Kashmere Gate ISBT
    (28.6450, 77.2130),  # Paharganj area
]

# Verified metro corridor nodes (approximate centerline points)
METRO_STATIONS = [
    (28.6315, 77.2167),  # CP
    (28.6260, 77.2170),  # Barakhamba
    (28.6340, 77.2200),  # Rajiv Chowk
    (28.6129, 77.2295),  # India Gate
    (28.5670, 77.2100),  # AIIMS
    (28.5280, 77.2150),  # Saket
    (28.5490, 77.2050),  # Hauz Khas
    (28.6120, 77.2750),  # Akshardham
    (28.6560, 77.2300),  # Chandni Chowk
    (28.6660, 77.2330),  # Kashmere Gate
    (28.6350, 77.2850),  # Preet Vihar
    (28.6250, 77.2850),  # IP Extension
    (28.6480, 77.2950),  # Anand Vihar
    (28.5650, 77.2430),  # Lajpat Nagar
    (28.5570, 77.2400),  # Greater Kailash
    (28.5450, 77.2550),  # Kalkaji
    (28.5530, 77.2580),  # Lotus Temple
    (28.5600, 77.1200),  # Airport T3
    (28.6510, 77.1900),  # Karol Bagh
    (28.6480, 77.1700),  # Patel Nagar
    (28.6420, 77.1800),  # Rajendra Nagar
    (28.7350, 77.1150),  # Rohini
    (28.7010, 77.1400),  # Pitampura
    (28.6470, 77.1200),  # Rajouri Garden
    (28.6210, 77.0900),  # Janakpuri
    (28.6330, 77.0950),  # Tilak Nagar
    (28.6670, 77.0950),  # Paschim Vihar
    (28.7100, 77.1600),  # Shalimar Bagh
    (28.6900, 77.2100),  # Delhi University
    (28.5650, 77.2800),  # Jamia
]


def compute_haversine_km(lat1, lon1, lat2, lon2):
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def _get_edge_centroid(u, v, data):
    """Compute approximate edge centroid from node coords or WKT geometry."""
    try:
        geom_str = data.get('geometry')
        if geom_str and geom_str.startswith('LINESTRING'):
            geom = wkt.loads(geom_str)
            c = geom.centroid
            return (c.y, c.x)
    except Exception:
        pass
    return ((u[0] + v[0]) / 2.0, (u[1] + v[1]) / 2.0)


# Base safety by road type — widened spread for better differentiation
TYPE_SAFETY_BASE = {
    'motorway': 95, 'motorway_link': 92,
    'trunk': 92, 'trunk_link': 88,
    'primary': 88, 'primary_link': 84,
    'secondary': 82, 'secondary_link': 76,
    'tertiary': 75, 'tertiary_link': 68,
    'residential': 48, 'service': 35,
    'living_street': 42, 'unclassified': 40,
    'footway': 30, 'path': 20, 'pedestrian': 60,
    'cycleway': 55, 'steps': 25,
}


def _sigmoid_stretch(score, midpoint=50):
    """Non-linear stretch to widen safety score distribution.
    Amplifies deviation from midpoint with quadratic factor.
    A score of 40 -> ~36, 60 -> ~64, 30 -> ~22, 70 -> ~78, 20 -> ~10.
    Clamped to [10, 98]."""
    deviation = score - midpoint
    factor = 1.0 + 0.04 * abs(deviation)
    stretched = midpoint + deviation * factor
    return max(10.0, min(98.0, stretched))


def _compute_effective_safety(u, v, edge_data, safety_mode="standard", is_night=False):
    """Compute the effective runtime safety score for reporting,
    matching what A* uses in calculate_edge_cost (without the distance cost)."""
    stored_safety = edge_data.get('safety_score', None)
    lighting_score = edge_data.get('lighting_score', 50.0)
    crime_risk = edge_data.get('crime_risk', 20.0)
    road_type = str(edge_data.get('type', 'residential')).lower() if edge_data.get('type') else 'residential'

    if stored_safety is not None and stored_safety >= 10:
        score = float(stored_safety)
    else:
        score = float(TYPE_SAFETY_BASE.get(road_type, 50))

    road_type_variance = TYPE_SAFETY_BASE.get(road_type, 50)
    score = (score * 0.3) + (road_type_variance * 0.7)

    score = _sigmoid_stretch(score)

    if safety_mode == "women_safety":
        if lighting_score < 40:
            score = max(0, score - 30)
        if any(t in road_type for t in ['residential', 'service', 'living_street', 'unclassified', 'path', 'footway']):
            score = max(0, score - 8)
        if any(t in road_type for t in ['primary', 'trunk', 'motorway']) and lighting_score >= 60:
            score = min(100, score + 12)
    elif safety_mode == "domestic_tourist":
        centroid = _get_edge_centroid(u, v, edge_data)
        for tlat, tlon in TRANSIT_SCAM_ZONES:
            d = compute_haversine_km(centroid[0], centroid[1], tlat, tlon)
            if d < 0.5:
                score = max(0, score - 30)
                break
        for mlat, mlon in METRO_STATIONS:
            d = compute_haversine_km(centroid[0], centroid[1], mlat, mlon)
            if d < 0.2:
                score = min(100, score + 20)
                break

    if is_night:
        if lighting_score >= 60:
            score = min(100, score + 12)
        elif lighting_score <= 30:
            score = max(0, score - 25)
        else:
            score = max(0, score - 10)

    return max(0.0, min(100.0, score))


def calculate_edge_cost(u, v, edge_data, lambda_factor=5.0, user_weight=None,
                        transport="car", is_night=False, safety_mode="standard"):
    distance = edge_data.get('length_km', 1.0)
    stored_safety = edge_data.get('safety_score', None)
    lighting_score = edge_data.get('lighting_score', 50.0)
    crime_risk = edge_data.get('crime_risk', 20.0)
    ai_sentiment = edge_data.get('ai_sentiment', 10.0)
    road_type = str(edge_data.get('type', 'residential')).lower() if edge_data.get('type') else 'residential'

    # Dynamic safety: use stored score if varied, otherwise derive from road type
    if stored_safety is not None and stored_safety >= 10:
        safety_score = float(stored_safety)
    else:
        safety_score = float(TYPE_SAFETY_BASE.get(road_type, 50))

    # Add road-type variance to differentiate paths
    road_type_variance = TYPE_SAFETY_BASE.get(road_type, 50)
    safety_score = (safety_score * 0.3) + (road_type_variance * 0.7)

    # Non-linear sigmoid stretch to widen distribution
    safety_score = _sigmoid_stretch(safety_score)

    # --- Safety mode modifiers ---
    extra_penalty = 0.0
    w2_scale = 1.0  # crime risk weight multiplier

    if safety_mode == "women_safety":
        w2_scale = 2.0
        # Heavy penalty on dark, narrow roads
        if lighting_score < 40:
            safety_score = max(0, safety_score - 30)
        if any(t in road_type for t in ['residential', 'service', 'living_street', 'unclassified', 'path', 'footway']):
            extra_penalty += 8.0
        if any(t in road_type for t in ['primary', 'trunk', 'motorway']) and lighting_score >= 60:
            safety_score = min(100, safety_score + 12)
        # Amplify crime risk penalty
        extra_penalty += w2_scale * (crime_risk / 100.0) * 5.0

    elif safety_mode == "domestic_tourist":
        centroid = _get_edge_centroid(u, v, edge_data)
        for tlat, tlon in TRANSIT_SCAM_ZONES:
            d_km = compute_haversine_km(centroid[0], centroid[1], tlat, tlon)
            if d_km < 0.5:
                safety_score = max(0, safety_score - 30)
                break
        for mlat, mlon in METRO_STATIONS:
            d_km = compute_haversine_km(centroid[0], centroid[1], mlat, mlon)
            if d_km < 0.2:
                safety_score = min(100, safety_score + 20)
                break

    # --- Night mode ---
    if is_night:
        if lighting_score >= 60:
            safety_score = min(100, safety_score + 12)
        elif lighting_score <= 30:
            safety_score = max(0, safety_score - 25)
        else:
            safety_score = max(0, safety_score - 10)

    # --- User preference weight ---
    if user_weight is not None:
        safety_score = safety_score * (1 - user_weight) + 100 * user_weight

    # --- Risk penalty indexed by safety deficit ---
    risk_penalty = lambda_factor * (100.0 - safety_score) * 0.01

    # --- Transport time multiplier ---
    time_multiplier = 1.0
    if transport == "walk":
        time_multiplier = 12.0
        walk_friendly = ['residential', 'service', 'living_street', 'footway', 'path', 'pedestrian', 'unclassified']
        if any(t in road_type for t in walk_friendly):
            time_multiplier = 8.0
    elif transport == "motorcycle":
        time_multiplier = 1.5
        if 'motorway' in road_type:
            time_multiplier = 2.5
    else:
        time_multiplier = 1.0
        if 'path' in road_type or 'footway' in road_type or 'pedestrian' in road_type:
            time_multiplier = 10.0
        elif 'residential' in road_type or 'service' in road_type:
            time_multiplier = 1.5
        elif 'motorway' in road_type or 'trunk' in road_type:
            time_multiplier = 0.8

    # --- Composite cost ---
    cost = (distance * time_multiplier) + risk_penalty + extra_penalty
    return cost


class SafeRouter:
    def __init__(self, graph):
        self.G = graph
        self.giant_component = self._compute_giant_component()
        self._kdtree = None
        self._node_list = None
        self._build_kdtree()

    def _compute_giant_component(self):
        undirected = self.G.to_undirected()
        components = list(nx.connected_components(undirected))
        if not components:
            return set()
        giant = max(components, key=len)
        print(f"[INFO] Giant component: {len(giant)}/{self.G.number_of_nodes()} nodes "
              f"({len(giant)/max(1,self.G.number_of_nodes())*100:.1f}%)")
        return giant

    def get_safest_route(self, start_node, end_node, routing_mode="balanced",
                         user_weight=None, transport="car", is_night=False, safety_mode="standard"):
        if routing_mode == "shortest":
            factor = 0.0
        elif routing_mode == "safest":
            factor = 200.0
        elif routing_mode == "balanced":
            factor = 40.0
        else:
            factor = 5.0

        try:
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

            path_edges = []
            total_distance = 0.0
            total_risk = 0.0
            for u, v in zip(path[:-1], path[1:]):
                if self.G.has_edge(u, v):
                    edge_data = self.G[u][v]
                    # Compute effective safety score the same way A* does
                    effective_safety = _compute_effective_safety(
                        u, v, edge_data,
                        safety_mode=safety_mode, is_night=is_night
                    )
                    path_edges.append({
                        'from': u,
                        'to': v,
                        'name': edge_data.get('name', 'Unknown'),
                        'length_km': edge_data.get('length_km', 0),
                        'safety_score': round(effective_safety, 1),
                    })
                    total_distance += edge_data.get('length_km', 0)
                    total_risk += 100 - effective_safety

            risk_exposure = total_risk / max(1, len(path_edges))

            return {
                'path': path,
                'path_edges': path_edges,
                'total_distance_km': round(total_distance, 2),
                'avg_safety_score': round(100 - risk_exposure, 1),
                'risk_exposure': round(risk_exposure, 1),
                'num_edges': len(path_edges),
                'routing_mode': routing_mode,
                'lambda_factor': factor,
                'safety_mode': safety_mode,
            }

        except (nx.NodeNotFound, nx.NetworkXNoPath) as e:
            return {
                'error': str(e),
                'path': [],
                'path_edges': [],
                'total_distance_km': 0,
                'avg_safety_score': 0,
                'risk_exposure': 0,
                'num_edges': 0,
                'routing_mode': routing_mode,
                'safety_mode': safety_mode,
            }

    def compare_routes(self, start_node, end_node, user_weight=None,
                       transport="car", is_night=False, safety_mode="standard"):
        shortest = self.get_safest_route(start_node, end_node, "shortest",
                                         user_weight, transport, is_night, safety_mode)
        balanced = self.get_safest_route(start_node, end_node, "balanced",
                                         user_weight, transport, is_night, safety_mode)
        safest = self.get_safest_route(start_node, end_node, "safest",
                                       user_weight, transport, is_night, safety_mode)
        return {'shortest': shortest, 'balanced': balanced, 'safest': safest}

    def evaluate_route_comparison(self, start_node, end_node):
        shortest = self.get_safest_route(start_node, end_node, "shortest")
        safest = self.get_safest_route(start_node, end_node, "safest")
        if 'error' in shortest or 'error' in safest:
            return {'error': 'Could not compute one or both routes'}
        s_path = shortest['path']
        safe_path = safest['path']
        shortest_risk = 0
        for u, v in zip(s_path[:-1], s_path[1:]):
            if self.G.has_edge(u, v):
                shortest_risk += 100 - self.G[u][v].get('safety_score', 70)
        safest_risk = 0
        for u, v in zip(safe_path[:-1], safe_path[1:]):
            if self.G.has_edge(u, v):
                safest_risk += 100 - self.G[u][v].get('safety_score', 70)
        risk_reduction_pct = ((shortest_risk - safest_risk) / (shortest_risk + 1e-6)) * 100
        return {
            'shortest_distance_km': shortest['total_distance_km'],
            'safest_distance_km': safest['total_distance_km'],
            'shortest_risk_exposure': shortest['risk_exposure'],
            'safest_risk_exposure': safest['risk_exposure'],
            'risk_reduction_pct': round(risk_reduction_pct, 2),
            'distance_penalty_km': round(safest['total_distance_km'] - shortest['total_distance_km'], 2),
        }

    def _build_kdtree(self):
        """Build a KD-Tree from all nodes for O(log N) nearest-node lookup.
        Uses scaled coordinates to compensate for longitude distortion at Delhi's latitude."""
        nodes_to_search = list(self.giant_component if self.giant_component else self.G.nodes())
        if not nodes_to_search:
            self._kdtree = None
            self._node_list = []
            return
        self._node_list = nodes_to_search
        # Projection-aware scaling: cos(avg_lat) ≈ cos(28.65°) ≈ 0.877
        avg_lat = sum(n[0] for n in nodes_to_search) / len(nodes_to_search)
        self._lon_scale = math.cos(math.radians(avg_lat))
        coords = np.array([(n[0], n[1] * self._lon_scale) for n in nodes_to_search])
        self._kdtree = KDTree(coords)

    def find_nearest_node(self, lat, lon):
        if self._kdtree is not None and self._node_list:
            scaled_query = np.array([[lat, lon * self._lon_scale]])
            dist, idx = self._kdtree.query(scaled_query, k=1)
            return self._node_list[idx[0]]
        # Fallback: brute-force O(N) if KD-Tree unavailable
        min_dist = float('inf')
        nearest = None
        nodes_to_search = self.giant_component if self.giant_component else self.G.nodes()
        for node in nodes_to_search:
            node_lat, node_lon = node
            dist = math.sqrt((lat - node_lat) ** 2 + (lon - node_lon) ** 2)
            if dist < min_dist:
                min_dist = dist
                nearest = node
        return nearest

    def _build_edge_feature(self, u, v, data):
        if 'geometry' not in data:
            return None
        try:
            coords_pairs = []
            wkt_str = data['geometry']
            wkt_clean = wkt_str.replace('LINESTRING (', '').replace(')', '').replace('(', '')
            parts = wkt_clean.split(',')
            for part in parts:
                part = part.strip()
                if ' ' in part:
                    lon_str, lat_str = part.split(' ', 1)
                    try:
                        lon, lat = float(lon_str), float(lat_str)
                        coords_pairs.append([lon, lat])
                    except ValueError:
                        pass
            if len(coords_pairs) < 2:
                return None
            return {
                'type': 'Feature',
                'geometry': {'type': 'LineString', 'coordinates': coords_pairs},
                'properties': {
                    'edge_id': data.get('edge_id', 0),
                    'name': data.get('name', 'Unknown'),
                    'safety_score': data.get('safety_score', 70),
                    'type': data.get('type', 'unknown'),
                    'length_km': data.get('length_km', 0),
                    'lanes': data.get('lanes', 1),
                }
            }
        except Exception:
            return None

    def get_all_edges_geojson(self, major_only=False):
        major_types = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link'}
        features = []
        for u, v, data in self.G.edges(data=True):
            if major_only:
                rt = str(data.get('type', '')).lower()
                if rt not in major_types:
                    continue
            if data.get('safety_score', 0) < 70:
                continue
            feat = self._build_edge_feature(u, v, data)
            if feat:
                features.append(feat)
        return {'type': 'FeatureCollection', 'features': features}

    def _heuristic(self, a, b):
        lat1, lon1 = a
        lat2, lon2 = b
        return math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2) * 111.0
