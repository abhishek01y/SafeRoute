import os
import pickle
import gzip
import networkx as nx


def load_and_segment_delhi_data(
    highway_shp_path="data/delhi_highway.shp",
    poi_shp_path="data/delhi_poi.shp",
    admin_shp_path="data/delhi_administrative.shp",
    segment_length_m=500
):
    data_dir = os.path.join(os.path.dirname(highway_shp_path) or "data")

    for pkl in ["delhi_graph.pkl.gz", "delhi_graph.pkl"]:
        pkl_path = os.path.join(data_dir, pkl)
        if os.path.exists(pkl_path):
            print(f"[INFO] Loading pre-processed graph from {pkl_path}...")
            open_fn = gzip.open if pkl.endswith('.gz') else open
            with open_fn(pkl_path, 'rb') as f:
                G = pickle.load(f)
            print(f"[INFO] Loaded: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
            return G

    pbf_files = sorted([f for f in os.listdir(data_dir) if f.endswith('.osm.pbf')])
    if pbf_files:
        print(f"[INFO] Found {len(pbf_files)} OSM PBF file(s): {pbf_files}")
        return _load_from_pbf(data_dir, pbf_files, segment_length_m)

    if not os.path.exists(highway_shp_path):
        print(f"[WARN] No pickle, PBF, or shapefile found. Using synthetic graph.")
        return _create_synthetic_graph()

    return _load_from_shapefile(highway_shp_path, poi_shp_path, admin_shp_path, segment_length_m)


def _load_from_pbf(pbf_dir, pbf_files, segment_length_m=500):
    import osmium
    from shapely.geometry import LineString
    from shapely.ops import substring
    from collections import defaultdict

    drivable = {
        'motorway', 'motorway_link', 'trunk', 'trunk_link',
        'primary', 'primary_link', 'secondary', 'secondary_link',
        'tertiary', 'tertiary_link', 'residential', 'living_street',
        'service', 'unclassified',
    }

    type_safety = {
        'motorway': 75, 'motorway_link': 70,
        'trunk': 70, 'trunk_link': 65,
        'primary': 65, 'primary_link': 60,
        'secondary': 55, 'secondary_link': 50,
        'tertiary': 45, 'tertiary_link': 40,
        'residential': 35, 'living_street': 40,
        'service': 30, 'unclassified': 30,
    }

    all_roads = []
    needed_nodes = set()

    for fpath in pbf_files:
        fname = os.path.basename(fpath)

        class WayCollector(osmium.SimpleHandler):
            def __init__(self):
                super().__init__()
                self.roads = []
            def way(self, w):
                hw = w.tags.get('highway')
                if hw and hw in drivable:
                    self.roads.append({
                        'id': w.id,
                        'nodes': [nd.ref for nd in w.nodes if nd.ref != 0],
                        'name': w.tags.get('name', 'Unnamed Road'),
                        'highway': hw,
                        'lanes': w.tags.get('lanes', '1'),
                        'oneway': w.tags.get('oneway', 'no'),
                        'maxspeed': w.tags.get('maxspeed', '50'),
                    })

        wc = WayCollector()
        print(f"[PBF] Reading {fname} (pass 1: ways)...", flush=True)
        wc.apply_file(fpath)
        print(f"  {len(wc.roads)} drivable roads", flush=True)
        all_roads.extend(wc.roads)

    for road in all_roads:
        for ref in road['nodes']:
            needed_nodes.add(ref)
    print(f"[PBF] {len(all_roads)} ways, {len(needed_nodes)} unique nodes", flush=True)

    node_coords = {}
    for fpath in pbf_files:
        fname = os.path.basename(fpath)

        class NodeCollector(osmium.SimpleHandler):
            def __init__(self, needed):
                super().__init__()
                self.needed = needed
                self.coords = {}
                self.found = 0
            def node(self, n):
                if n.id in self.needed:
                    self.coords[n.id] = (n.location.lat, n.location.lon)
                    self.found += 1

        nc = NodeCollector(needed_nodes)
        print(f"[PBF] Reading {fname} (pass 2: nodes)...", flush=True)
        nc.apply_file(fpath)
        print(f"  {nc.found} node coordinates", flush=True)
        node_coords.update(nc.coords)
        needed_nodes -= nc.coords.keys()

    print(f"[PBF] Building graph...", flush=True)
    G = nx.DiGraph()
    skipped = 0

    for road in all_roads:
        coords = []
        for ref in road['nodes']:
            if ref in node_coords:
                lat, lon = node_coords[ref]
                coords.append((lon, lat))
        if len(coords) < 2:
            skipped += 1
            continue

        try:
            line = LineString(coords)
        except Exception:
            skipped += 1
            continue

        seg_length = line.length * 111.0 * 1000
        num_segments = max(1, int(seg_length / segment_length_m))
        base_safety = type_safety.get(road['highway'].lower(), 40)
        lanes = int(road['lanes']) if road['lanes'].isdigit() else 1

        for i in range(num_segments):
            try:
                sub_seg = substring(line, i / num_segments, (i + 1) / num_segments, normalized=True)
            except Exception:
                continue
            if sub_seg is None or sub_seg.length < 1e-8:
                continue
            sc = list(sub_seg.coords)
            if len(sc) < 2:
                continue

            u = (round(sc[0][1], 6), round(sc[0][0], 6))
            v = (round(sc[-1][1], 6), round(sc[-1][0], 6))
            length_km = sub_seg.length * 111.0

            G.add_edge(u, v,
                name=road['name'], type=road['highway'], lanes=lanes,
                oneway=road['oneway'], maxspeed=road['maxspeed'],
                length_km=length_km, safety_score=base_safety,
                lighting_score=base_safety * 0.7, poi_density=base_safety * 0.8,
                footfall=base_safety * 0.6, crime_risk=20.0,
                ai_sentiment=10.0, crowdsourced_risk=5.0)

            if road['oneway'] != 'yes':
                G.add_edge(v, u,
                    name=road['name'], type=road['highway'], lanes=lanes,
                    oneway=road['oneway'], maxspeed=road['maxspeed'],
                    length_km=length_km, safety_score=base_safety,
                    lighting_score=base_safety * 0.7, poi_density=base_safety * 0.8,
                    footfall=base_safety * 0.6, crime_risk=20.0,
                    ai_sentiment=10.0, crowdsourced_risk=5.0)

    print(f"[PBF] Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges ({skipped} ways skipped)")
    G = _merge_nearby_nodes(G, tolerance=0.0003)
    return G


def _load_from_shapefile(highway_shp_path, poi_shp_path, admin_shp_path, segment_length_m=75):
    import geopandas as gpd
    import networkx as nx
    import pandas as pd
    import numpy as np
    from shapely.geometry import LineString, Point
    from shapely.ops import substring

    G = nx.DiGraph()

    highways = gpd.read_file(highway_shp_path)
    if highways.crs and highways.crs.to_string() != "EPSG:4326":
        highways = highways.to_crs("EPSG:4326")

    edge_id_counter = 0
    total = len(highways)

    type_safety = {
        'motorway': 75, 'trunk': 70, 'primary': 65,
        'secondary': 55, 'tertiary': 45,
        'primary_link': 60, 'secondary_link': 50, 'tertiary_link': 40,
        'residential': 35, 'service': 30, 'living_street': 40,
        'unclassified': 30, 'path': 15, 'footway': 10,
    }

    for idx, row in highways.iterrows():
        if idx % 2000 == 0 and idx > 0:
            print(f"[SHP] {100*idx//total}% ({G.number_of_edges()} edges)", flush=True)

        line = row.geometry
        if line is None or line.geom_type not in ('LineString', 'MultiLineString'):
            continue

        lines = list(line.geoms) if line.geom_type == 'MultiLineString' else [line]
        for segment_line in lines:
            road_name = str(row.get('NAME', 'Unnamed Road')) if 'NAME' in row.index and pd.notna(row.get('NAME')) else 'Unnamed Road'
            road_type = str(row.get('TYPE', 'residential')) if 'TYPE' in row.index and pd.notna(row.get('TYPE')) else 'residential'
            lanes = int(row.get('LANES', 1)) if 'LANES' in row.index and pd.notna(row.get('LANES')) else 1
            oneway = str(row.get('ONEWAY', 'no')) if 'ONEWAY' in row.index and pd.notna(row.get('ONEWAY')) else 'no'

            seg_length = segment_line.length * 111000
            num_segments = max(1, min(50, int(seg_length / segment_length_m)))
            base_safety = type_safety.get(road_type.lower(), 40)

            for i in range(num_segments):
                try:
                    sub_seg = substring(segment_line, i / num_segments, (i + 1) / num_segments, normalized=True)
                except Exception:
                    continue
                if sub_seg is None or sub_seg.length < 1e-8:
                    continue
                coords = list(sub_seg.coords)
                if len(coords) < 2:
                    continue

                u = (round(coords[0][1], 6), round(coords[0][0], 6))
                v = (round(coords[-1][1], 6), round(coords[-1][0], 6))
                length_km = sub_seg.length * 111.0

                G.add_edge(u, v,
                    edge_id=edge_id_counter, name=road_name, type=road_type,
                    lanes=lanes, oneway=oneway, length_km=length_km,
                    safety_score=base_safety, lighting_score=base_safety * 0.7,
                    poi_density=base_safety * 0.8, footfall=base_safety * 0.6,
                    crime_risk=20.0, ai_sentiment=10.0, crowdsourced_risk=5.0)
                edge_id_counter += 1

                if oneway != 'yes':
                    G.add_edge(v, u,
                        edge_id=edge_id_counter, name=road_name, type=road_type,
                        lanes=lanes, oneway=oneway, length_km=length_km,
                        safety_score=base_safety, lighting_score=base_safety * 0.7,
                        poi_density=base_safety * 0.8, footfall=base_safety * 0.6,
                        crime_risk=20.0, ai_sentiment=10.0, crowdsourced_risk=5.0)
                    edge_id_counter += 1

    print(f"[SHP] Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    G = _merge_nearby_nodes(G, tolerance=0.0003)
    return G


def _merge_nearby_nodes(G, tolerance=0.0003):
    from collections import defaultdict
    grid = defaultdict(list)
    for node in G.nodes():
        lat, lon = node
        grid[(round(lat / tolerance), round(lon / tolerance))].append(node)

    node_map = {}
    merged_count = 0
    for nodes in grid.values():
        if len(nodes) < 2:
            node_map[nodes[0]] = nodes[0]
            continue
        sorted_nodes = sorted(nodes, key=lambda n: (n[0], n[1]))
        rep = sorted_nodes[0]
        for n in sorted_nodes[1:]:
            node_map[n] = rep
            merged_count += 1
        node_map[sorted_nodes[0]] = rep

    if merged_count == 0:
        return G

    new_G = nx.DiGraph()
    for u, v, data in G.edges(data=True):
        nu, nv = node_map.get(u, u), node_map.get(v, v)
        if nu != nv:
            if new_G.has_edge(nu, nv):
                new_G[nu][nv]['safety_score'] = (new_G[nu][nv]['safety_score'] + data['safety_score']) / 2
            else:
                new_G.add_edge(nu, nv, **data)

    print(f"[INFO] Merged {merged_count} nearby nodes")
    return new_G


def _create_synthetic_graph():
    import random
    G = nx.DiGraph()
    roads_data = [
        ("Connaught Place", 28.6315, 77.2167, 28.6325, 77.2180),
        ("India Gate", 28.6129, 77.2295, 28.6145, 77.2310),
        ("Lajpat Nagar", 28.5650, 77.2430, 28.5670, 77.2450),
        ("Karol Bagh", 28.6510, 77.1900, 28.6530, 77.1920),
        ("Dwarka", 28.5900, 77.0500, 28.5920, 77.0520),
        ("Rohini", 28.7350, 77.1150, 28.7370, 77.1170),
        ("Saket", 28.5280, 77.2150, 28.5300, 77.2170),
        ("Vasant Kunj", 28.5100, 77.1600, 28.5120, 77.1620),
        ("Chandni Chowk", 28.6560, 77.2300, 28.6580, 77.2320),
        ("Hauz Khas", 28.5490, 77.2050, 28.5510, 77.2070),
        ("Nehru Place", 28.5480, 77.2510, 28.5500, 77.2530),
        ("Pitampura", 28.7010, 77.1400, 28.7030, 77.1420),
        ("Janakpuri", 28.6210, 77.0900, 28.6230, 77.0920),
    ]
    for name, lat1, lon1, lat2, lon2 in roads_data:
        s = random.uniform(20, 90)
        u, v = (round(lat1, 6), round(lon1, 6)), (round(lat2, 6), round(lon2, 6))
        G.add_edge(u, v, name=name, type="synthetic", lanes=2, oneway="no",
            maxspeed="50", length_km=0.5, safety_score=s,
            lighting_score=s*0.7, poi_density=s*0.8, footfall=s*0.6,
            crime_risk=20.0, ai_sentiment=10.0, crowdsourced_risk=5.0)
        G.add_edge(v, u, name=name, type="synthetic", lanes=2, oneway="no",
            maxspeed="50", length_km=0.5, safety_score=s,
            lighting_score=s*0.7, poi_density=s*0.8, footfall=s*0.6,
            crime_risk=20.0, ai_sentiment=10.0, crowdsourced_risk=5.0)
    print(f"[INFO] Synthetic graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    return G
