import networkx as nx
import heapq
import math


def calculate_edge_cost(u, v, edge_data, lambda_factor=5.0, user_weight=None, transport="car"):
    distance = edge_data.get('length_km', 1.0)
    safety_score = edge_data.get('safety_score', 100.0)
    road_type = str(edge_data.get('type', 'residential')).lower() if edge_data.get('type') else 'residential'

    if user_weight is not None:
        safety_score = safety_score * (1 - user_weight) + 100 * user_weight

    risk_penalty = lambda_factor * (100.0 - safety_score) * 0.1

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

    cost = (distance * time_multiplier) + risk_penalty
    return cost


class SafeRouter:
    def __init__(self, graph):
        self.G = graph
        self.giant_component = self._compute_giant_component()

    def _compute_giant_component(self):
        undirected = self.G.to_undirected()
        components = list(nx.connected_components(undirected))
        if not components:
            return set()
        giant = max(components, key=len)
        print(f"[INFO] Giant component: {len(giant)}/{self.G.number_of_nodes()} nodes ({len(giant)/max(1,self.G.number_of_nodes())*100:.1f}%)")
        return giant

    def get_safest_route(self, start_node, end_node, routing_mode="balanced", user_weight=None, transport="car"):
        if routing_mode == "shortest":
            factor = 0.0
        elif routing_mode == "safest":
            factor = 15.0
        elif routing_mode == "balanced":
            factor = 5.0
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
                    transport=transport
                )
            )

            path_edges = []
            total_distance = 0.0
            total_risk = 0.0
            for u, v in zip(path[:-1], path[1:]):
                if self.G.has_edge(u, v):
                    edge_data = self.G[u][v]
                    path_edges.append({
                        'from': u,
                        'to': v,
                        'name': edge_data.get('name', 'Unknown'),
                        'length_km': edge_data.get('length_km', 0),
                        'safety_score': edge_data.get('safety_score', 70),
                    })
                    total_distance += edge_data.get('length_km', 0)
                    total_risk += 100 - edge_data.get('safety_score', 70)

            risk_exposure = total_risk / max(1, len(path_edges))

            return {
                'path': path,
                'path_edges': path_edges,
                'total_distance_km': round(total_distance, 2),
                'avg_safety_score': round(100 - risk_exposure, 1),
                'risk_exposure': round(risk_exposure, 1),
                'num_edges': len(path_edges),
                'routing_mode': routing_mode,
                'lambda_factor': factor
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
                'routing_mode': routing_mode
            }

    def compare_routes(self, start_node, end_node, user_weight=None, transport="car"):
        shortest = self.get_safest_route(start_node, end_node, "shortest", user_weight, transport)
        balanced = self.get_safest_route(start_node, end_node, "balanced", user_weight, transport)
        safest = self.get_safest_route(start_node, end_node, "safest", user_weight, transport)

        return {
            'shortest': shortest,
            'balanced': balanced,
            'safest': safest
        }

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

    def find_nearest_node(self, lat, lon):
        min_dist = float('inf')
        nearest = None

        nodes_to_search = self.giant_component if self.giant_component else self.G.nodes()

        for node in nodes_to_search:
            node_lat, node_lon = node
            dist = math.sqrt((lat - node_lat)**2 + (lon - node_lon)**2)
            if dist < min_dist:
                min_dist = dist
                nearest = node

        return nearest

    def _build_edge_feature(self, u, v, data):
        if 'geometry' not in data:
            return None
        try:
            coords_pairs = []
            wkt = data['geometry']
            wkt_clean = wkt.replace('LINESTRING (', '').replace(')', '').replace('(', '')
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
        return {
            'type': 'FeatureCollection',
            'features': features
        }

    def _heuristic(self, a, b):
        lat1, lon1 = a
        lat2, lon2 = b
        return math.sqrt((lat1 - lat2)**2 + (lon1 - lon2)**2) * 111.0
