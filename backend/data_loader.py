import geopandas as gpd
import networkx as nx
import numpy as np
import pandas as pd
from shapely.geometry import LineString, Point
from shapely.ops import substring
import os
import glob


def load_osm_pbf_highways(pbf_path, existing_G, segment_length_m=75):
    try:
        from pyrosm import OSM
    except ImportError:
        print("[WARN] pyrosm not installed. Skipping OSM PBF loading.")
        return existing_G

    print(f"[INFO] Loading OSM PBF: {os.path.basename(pbf_path)}")
    try:
        osm = OSM(pbf_path)
        driving = osm.get_network(network_type="driving")
        walking = osm.get_network(network_type="walking")
        combined = pd.concat([driving, walking]).drop_duplicates(subset=['geometry']).reset_index(drop=True) if driving is not None and walking is not None else (driving if driving is not None else walking)
        if combined is None or len(combined) == 0:
            print(f"[WARN] No roads found in {pbf_path}")
            return existing_G
    except Exception as e:
        print(f"[WARN] Failed to load OSM PBF {pbf_path}: {e}")
        return existing_G

    G = existing_G
    edge_id_counter = max([d.get('edge_id', 0) for _, _, d in G.edges(data=True)] + [0]) + 1

    print(f"[INFO] OSM: {len(combined)} road features from {os.path.basename(pbf_path)}")

    if 'highway' in combined.columns:
        combined = combined[combined['highway'].notna()].copy()

    if combined.crs and combined.crs.to_string() != "EPSG:4326":
        combined = combined.to_crs("EPSG:4326")

    type_safety = {
        'motorway': 88, 'trunk': 85, 'primary': 82,
        'secondary': 78, 'tertiary': 75,
        'primary_link': 80, 'secondary_link': 76, 'tertiary_link': 72,
        'residential': 70, 'service': 65, 'living_street': 68,
        'unclassified': 55, 'path': 40, 'footway': 35,
    }

    for idx, row in combined.iterrows():
        if idx % 5000 == 0 and idx > 0:
            pct = idx / len(combined) * 100
            print(f"[INFO] OSM PBF: {pct:.0f}% ({idx}/{len(combined)}) ΓÇö {G.number_of_edges()} edges")
            import sys; sys.stdout.flush()

        line = row.geometry
        if line is None or line.geom_type not in ('LineString', 'MultiLineString'):
            continue

        if line.geom_type == 'MultiLineString':
            lines = list(line.geoms)
        else:
            lines = [line]

        for segment_line in lines:
            road_name = str(row.get('name', 'Unnamed Road')) if pd.notna(row.get('name')) else 'Unnamed Road'
            hw = str(row.get('highway', 'unclassified')) if pd.notna(row.get('highway')) else 'unclassified'
            oneway_val = str(row.get('oneway', 'no')) if pd.notna(row.get('oneway')) else 'no'

            seg_length = segment_line.length * 111000
            if seg_length < 1:
                seg_length = segment_line.length * 111320

            num_segments = max(1, min(30, int(seg_length / segment_length_m)))

            for i in range(num_segments):
                start_frac = i / num_segments
                end_frac = (i + 1) / num_segments

                try:
                    sub_seg = substring(segment_line, start_frac, end_frac, normalized=True)
                except Exception:
                    continue

                if sub_seg is None or sub_seg.length < 1e-8:
                    continue

                coords = list(sub_seg.coords)
                if len(coords) < 2:
                    continue

                start_node = (round(coords[0][1], 6), round(coords[0][0], 6))
                end_node = (round(coords[-1][1], 6), round(coords[-1][0], 6))

                sub_length_km = sub_seg.length * 111.0

                base_type = hw.lower().split(';')[0].strip() if isinstance(hw, str) else 'unclassified'
                base_safety = type_safety.get(base_type, 60)
                poi_density = base_safety * 0.8
                lighting_score = base_safety * 0.7
                footfall = base_safety * 0.6

                if G.has_edge(start_node, end_node):
                    continue

                G.add_edge(
                    start_node, end_node,
                    edge_id=edge_id_counter,
                    name=road_name, type=hw, lanes=2, oneway=oneway_val,
                    length_km=sub_length_km, poi_density=poi_density,
                    lighting_score=lighting_score, footfall=footfall,
                    crime_risk=20.0, ai_sentiment=10.0, crowdsourced_risk=5.0,
                    safety_score=base_safety, geometry=sub_seg.wkt
                )
                edge_id_counter += 1

                if oneway_val != 'yes':
                    G.add_edge(
                        end_node, start_node,
                        edge_id=edge_id_counter,
                        name=road_name, type=hw, lanes=2, oneway=oneway_val,
                        length_km=sub_length_km, poi_density=poi_density,
                        lighting_score=lighting_score, footfall=footfall,
                        crime_risk=20.0, ai_sentiment=10.0, crowdsourced_risk=5.0,
                        safety_score=base_safety, geometry=sub_seg.wkt
                    )
                    edge_id_counter += 1

    print(f"[INFO] OSM PBF done. Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    return G


def load_and_segment_delhi_data(
    highway_shp_path="data/delhi_highway.shp",
    poi_shp_path="data/delhi_poi.shp",
    admin_shp_path="data/delhi_administrative.shp",
    segment_length_m=75
):
    G = nx.DiGraph()

    data_dir = os.path.dirname(highway_shp_path)

    if not os.path.exists(highway_shp_path):
        pbf_files = sorted(glob.glob(os.path.join(data_dir, "*.osm.pbf")))
        if pbf_files:
            print(f"[WARN] Shapefile not found. Loading OSM PBF files instead...")
            G = nx.DiGraph()
            for pbf_path in pbf_files:
                G = load_osm_pbf_highways(pbf_path, G, segment_length_m)
            if G.number_of_edges() > 0:
                print(f"[INFO] Graph from OSM PBF: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
                G = _merge_nearby_nodes(G, tolerance=0.0003)
                print(f"[INFO] After merge: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
                return G
        print(f"[WARN] Highway shapefile not found. Using synthetic Delhi roads.")
        return _create_synthetic_graph()

    highways = gpd.read_file(highway_shp_path)
    if highways.crs and highways.crs.to_string() != "EPSG:4326":
        highways = highways.to_crs("EPSG:4326")

    pois = None
    if os.path.exists(poi_shp_path):
        pois = gpd.read_file(poi_shp_path)
        if pois.crs and pois.crs.to_string() != "EPSG:4326":
            pois = pois.to_crs("EPSG:4326")

    admin = None
    if os.path.exists(admin_shp_path):
        admin = gpd.read_file(admin_shp_path)
        if admin.crs and admin.crs.to_string() != "EPSG:4326":
            admin = admin.to_crs("EPSG:4326")

    poi_tree, _ = build_poi_spatial_index(pois)

    edge_id_counter = 0

    if 'TYPE' in highways.columns:
        major_types = ['primary', 'secondary', 'tertiary', 'trunk', 'motorway', 'primary_link', 'secondary_link', 'tertiary_link']
        major_mask = highways['TYPE'].isin(major_types)
        print(f"[INFO] Major roads: {major_mask.sum()}, Total: {len(highways)}")
    else:
        print(f"[INFO] Total roads: {len(highways)}")

    total = len(highways)
    print(f"[INFO] Processing all {total} road features...")
    import sys
    sys.stdout.flush()

    for idx, row in highways.iterrows():
        if idx % 2000 == 0 and idx > 0:
            pct = idx / total * 100
            print(f"[INFO] {pct:.0f}% complete ({idx}/{total})... ({G.number_of_edges()} edges)")
            sys.stdout.flush()

        line = row.geometry
        if line is None or line.geom_type not in ('LineString', 'MultiLineString'):
            continue

        if line.geom_type == 'MultiLineString':
            lines = list(line.geoms)
        else:
            lines = [line]

        for segment_line in lines:
            road_name = str(row.get('NAME', 'Unnamed Road')) if 'NAME' in row.index and pd.notna(row.get('NAME')) else 'Unnamed Road'
            road_type = str(row.get('TYPE', 'residential')) if 'TYPE' in row.index and pd.notna(row.get('TYPE')) else 'residential'
            lanes_val = row.get('LANES', 1) if 'LANES' in row.index else 1
            lanes = int(lanes_val) if pd.notna(lanes_val) else 1
            oneway = str(row.get('ONEWAY', 'no')) if 'ONEWAY' in row.index and pd.notna(row.get('ONEWAY')) else 'no'

            seg_length = segment_line.length * 111000
            if seg_length < 1:
                seg_length = segment_line.length * 111320

            num_segments = max(1, int(seg_length / segment_length_m))
            if num_segments > 50:
                num_segments = 50

            for i in range(num_segments):
                start_frac = i / num_segments
                end_frac = (i + 1) / num_segments

                try:
                    sub_seg = substring(segment_line, start_frac, end_frac, normalized=True)
                except Exception:
                    continue

                if sub_seg is None or sub_seg.length < 1e-8:
                    continue

                coords = list(sub_seg.coords)
                if len(coords) < 2:
                    continue

                start_node = (round(coords[0][1], 6), round(coords[0][0], 6))
                end_node = (round(coords[-1][1], 6), round(coords[-1][0], 6))

                sub_length_km = sub_seg.length * 111.0

                type_safety = {
                    'motorway': 88, 'trunk': 85, 'primary': 82,
                    'secondary': 78, 'tertiary': 75,
                    'primary_link': 80, 'secondary_link': 76, 'tertiary_link': 72,
                    'residential': 70, 'service': 65, 'living_street': 68,
                    'unclassified': 55, 'path': 40, 'footway': 35,
                }
                base_type = road_type.lower() if isinstance(road_type, str) else 'unclassified'
                base_safety = type_safety.get(base_type, 60)

                poi_density = base_safety * 0.8
                lighting_score = base_safety * 0.7
                footfall = base_safety * 0.6

                G.add_edge(
                    start_node, end_node,
                    edge_id=edge_id_counter,
                    name=road_name, type=road_type, lanes=lanes, oneway=oneway,
                    length_km=sub_length_km, poi_density=poi_density,
                    lighting_score=lighting_score, footfall=footfall,
                    crime_risk=20.0, ai_sentiment=10.0, crowdsourced_risk=5.0,
                    safety_score=base_safety, geometry=sub_seg.wkt
                )
                edge_id_counter += 1

                if oneway != 'yes':
                    G.add_edge(
                        end_node, start_node,
                        edge_id=edge_id_counter,
                        name=road_name, type=road_type, lanes=lanes, oneway=oneway,
                        length_km=sub_length_km, poi_density=poi_density,
                        lighting_score=lighting_score, footfall=footfall,
                        crime_risk=20.0, ai_sentiment=10.0, crowdsourced_risk=5.0,
                        safety_score=base_safety, geometry=sub_seg.wkt
                    )
                    edge_id_counter += 1

    print(f"[INFO] Graph built from shapefile: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

    data_dir = os.path.dirname(highway_shp_path)
    pbf_files = sorted(glob.glob(os.path.join(data_dir, "*.osm.pbf")))
    if pbf_files:
        print(f"[INFO] Found {len(pbf_files)} OSM PBF files. Loading drivable roads...")
        for pbf_path in pbf_files:
            G = load_osm_pbf_highways(pbf_path, G, segment_length_m)
    else:
        print(f"[INFO] No .osm.pbf files found in {data_dir}")

    print(f"[INFO] Total graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    print(f"[INFO] Merging nearby nodes to create intersections...")
    G = _merge_nearby_nodes(G, tolerance=0.0003)
    print(f"[INFO] After merge: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    return G


def build_poi_spatial_index(pois_gdf):
    if pois_gdf is None or len(pois_gdf) == 0:
        return None, None
    try:
        from shapely.strtree import STRtree
        tree = STRtree(list(pois_gdf.geometry))
        return tree, pois_gdf
    except Exception as e:
        print(f"[WARN] Could not build spatial index: {e}")
        return None, pois_gdf


def _calculate_poi_density(segment, tree, pois_gdf, radius_deg=0.002):
    if tree is None or pois_gdf is None:
        return 50.0

    try:
        centroid = segment.centroid if hasattr(segment, 'centroid') else segment
        if centroid is None:
            return 50.0
        buffer = centroid.buffer(radius_deg)
        candidates = tree.query(buffer)
        count = len(candidates)
    except Exception:
        count = 0

    density = min(100.0, count * 8.0)
    return max(10.0, density)


def _calculate_footfall(segment, tree, pois_gdf, radius_deg=0.003):
    if tree is None or pois_gdf is None:
        return 40.0

    try:
        centroid = segment.centroid if hasattr(segment, 'centroid') else segment
        if centroid is None:
            return 40.0
        buffer = centroid.buffer(radius_deg)
        candidates = tree.query(buffer)
        transit_count = 0
        if 'CATEGORY' in pois_gdf.columns:
            for geom in candidates:
                mask = pois_gdf.geometry == geom
                if mask.any():
                    cat = pois_gdf.loc[mask, 'CATEGORY'].values[0]
                    if isinstance(cat, str) and any(kw in cat.lower() for kw in ['transport', 'metro', 'bus', 'railway']):
                        transit_count += 1
    except Exception:
        transit_count = 0

    footfall = min(100.0, 30.0 + transit_count * 12.0)
    return footfall


def _merge_nearby_nodes(G, tolerance=0.0003):
    from collections import defaultdict
    grid = defaultdict(list)
    for node in G.nodes():
        lat, lon = node
        grid[(round(lat / tolerance), round(lon / tolerance))].append(node)

    node_map = {}
    merged_count = 0
    for cell_key, nodes in grid.items():
        if len(nodes) < 2:
            node_map[nodes[0]] = nodes[0]
            continue
        sorted_nodes = sorted(nodes, key=lambda n: (n[0], n[1]))
        representative = sorted_nodes[0]
        for n in sorted_nodes[1:]:
            node_map[n] = representative
            merged_count += 1
        node_map[sorted_nodes[0]] = representative

    if merged_count == 0:
        return G

    new_G = nx.DiGraph()
    for u, v, data in G.edges(data=True):
        new_u = node_map.get(u, u)
        new_v = node_map.get(v, v)
        if new_u != new_v:
            if new_G.has_edge(new_u, new_v):
                existing = new_G[new_u][new_v]
                existing['safety_score'] = (existing['safety_score'] + data['safety_score']) / 2
            else:
                new_G.add_edge(new_u, new_v, **data)

    for node in G.nodes():
        mapped = node_map.get(node, node)
        if mapped not in new_G:
            new_G.add_node(mapped)

    print(f"[INFO] Merged {merged_count} nearby nodes into intersections")
    return new_G


def _compute_base_safety(P, C, L, F, S, U):
    w1, w2, w3, w4, w5, w6 = 0.15, 0.30, 0.20, 0.15, 0.15, 0.05
    score = (w1 * P) - (w2 * C) + (w3 * L) + (w4 * F) - (w5 * S) + (w6 * U)
    return max(0.0, min(100.0, score))


def _create_synthetic_graph():
    G = nx.DiGraph()

    synthetic_roads = [
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
        ("Mayur Vihar", 28.6100, 77.2900, 28.6120, 77.2920),
        ("Greater Kailash", 28.5570, 77.2400, 28.5590, 77.2420),
    ]

    edge_id_counter = 0
    for name, lat1, lon1, lat2, lon2 in synthetic_roads:
        import random
        poi_density = random.uniform(20, 95)
        lighting = random.uniform(20, 100)
        footfall = random.uniform(15, 90)
        crime = random.uniform(5, 60)
        sentiment = random.uniform(5, 40)
        crowd = random.uniform(0, 30)

        safety = _compute_base_safety(poi_density, crime, lighting, footfall, sentiment, crowd)

        G.add_edge(
            (round(lat1, 6), round(lon1, 6)),
            (round(lat2, 6), round(lon2, 6)),
            edge_id=edge_id_counter,
            name=name,
            type="synthetic",
            lanes=2,
            oneway="no",
            lit="yes" if lighting > 50 else "no",
            maxspeed="50",
            length_km=0.5,
            poi_density=poi_density,
            lighting_score=lighting,
            footfall=footfall,
            crime_risk=crime,
            ai_sentiment=sentiment,
            crowdsourced_risk=crowd,
            safety_score=safety
        )
        edge_id_counter += 1

        G.add_edge(
            (round(lat2, 6), round(lon2, 6)),
            (round(lat1, 6), round(lon1, 6)),
            edge_id=edge_id_counter,
            name=name,
            type="synthetic",
            lanes=2,
            oneway="no",
            lit="yes" if lighting > 50 else "no",
            maxspeed="50",
            length_km=0.5,
            poi_density=poi_density,
            lighting_score=lighting,
            footfall=footfall,
            crime_risk=crime,
            ai_sentiment=sentiment,
            crowdsourced_risk=crowd,
            safety_score=safety
        )
        edge_id_counter += 1

    print(f"[INFO] Synthetic graph built: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    return G
