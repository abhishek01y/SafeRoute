import osmium
import networkx as nx
import pickle
import gzip
import sys
import os
import time
from shapely.geometry import LineString
from shapely.ops import substring


DRIVABLE_HIGHWAYS = {
    'motorway', 'motorway_link',
    'trunk', 'trunk_link',
    'primary', 'primary_link',
    'secondary', 'secondary_link',
    'tertiary', 'tertiary_link',
}


TYPE_SAFETY = {
    'motorway': 75, 'motorway_link': 70,
    'trunk': 70, 'trunk_link': 65,
    'primary': 65, 'primary_link': 60,
    'secondary': 55, 'secondary_link': 50,
    'tertiary': 45, 'tertiary_link': 40,
}


def preprocess(pbf_files, output_pickle="data/delhi_graph.pkl", segment_length_m=500):
    all_roads = []
    needed_nodes = set()

    # --- Pass 1: collect drivable ways and needed node refs ---
    for fpath in pbf_files:
        fname = os.path.basename(fpath)
        size_mb = os.path.getsize(fpath) // 1024 // 1024
        t0 = time.time()

        class WayCollector(osmium.SimpleHandler):
            def __init__(self):
                super().__init__()
                self.roads = []
            def way(self, w):
                hw = w.tags.get('highway')
                if hw and hw in DRIVABLE_HIGHWAYS:
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
        print(f"[Pass 1] Reading {fname} ({size_mb} MB)...", flush=True)
        wc.apply_file(fpath)
        elapsed = time.time() - t0
        print(f"  {len(wc.roads)} roads collected in {elapsed:.0f}s", flush=True)
        all_roads.extend(wc.roads)

    for road in all_roads:
        for ref in road['nodes']:
            needed_nodes.add(ref)
    print(f"[INFO] Total drivable roads: {len(all_roads)}, unique nodes: {len(needed_nodes)}", flush=True)

    # --- Pass 2: read coordinates for needed nodes only ---
    node_coords = {}
    for fpath in pbf_files:
        fname = os.path.basename(fpath)
        t0 = time.time()

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
                    if self.found % 500000 == 0:
                        print(f'    Collected {self.found}/{len(self.needed)} node coords...', flush=True)

        nc = NodeCollector(needed_nodes)
        print(f"[Pass 2] Reading {fname}...", flush=True)
        nc.apply_file(fpath)
        elapsed = time.time() - t0
        print(f"  {nc.found} nodes collected in {elapsed:.0f}s", flush=True)
        node_coords.update(nc.coords)
        # update needed for next file to skip already-collected
        needed_nodes -= nc.coords.keys()

    missing = len(needed_nodes)
    if missing:
        print(f"[WARN] {missing} node refs had no coordinates — skipping those ways", flush=True)

    # --- Build graph ---
    print("[INFO] Building graph...", flush=True)
    G = nx.DiGraph()
    edge_id_counter = 0
    skipped_ways = 0
    t0 = time.time()

    for road in all_roads:
        coords = []
        for ref in road['nodes']:
            if ref in node_coords:
                lat, lon = node_coords[ref]
                coords.append((lon, lat))
        if len(coords) < 2:
            skipped_ways += 1
            continue

        try:
            line = LineString(coords)
        except Exception:
            skipped_ways += 1
            continue

        seg_length = line.length * 111.0 * 1000
        num_segments = max(1, int(seg_length / segment_length_m))
        base_type = road['highway'].lower()
        base_safety = TYPE_SAFETY.get(base_type, 40)
        try:
            lanes = int(road['lanes']) if road['lanes'].isdigit() else 1
        except ValueError:
            lanes = 1

        for i in range(num_segments):
            start_frac = i / num_segments
            end_frac = (i + 1) / num_segments
            try:
                sub_seg = substring(line, start_frac, end_frac, normalized=True)
            except Exception:
                continue
            if sub_seg is None or sub_seg.length < 1e-8:
                continue

            sub_coords = list(sub_seg.coords)
            if len(sub_coords) < 2:
                continue

            start_node = (round(sub_coords[0][1], 6), round(sub_coords[0][0], 6))
            end_node = (round(sub_coords[-1][1], 6), round(sub_coords[-1][0], 6))
            sub_length_km = sub_seg.length * 111.0

            attr = dict(name=road['name'], type=road['highway'],
                       lanes=lanes, oneway=road['oneway'],
                       length_km=sub_length_km, safety_score=base_safety,
                       lighting_score=base_safety * 0.7,
                       poi_density=base_safety * 0.8,
                       footfall=base_safety * 0.6,
                       crime_risk=20.0, ai_sentiment=10.0,
                       crowdsourced_risk=5.0)
            G.add_edge(start_node, end_node, **attr)
            edge_id_counter += 1

            if road['oneway'] != 'yes':
                G.add_edge(end_node, start_node, **attr)
                edge_id_counter += 1

        if edge_id_counter % 100000 == 0 and edge_id_counter > 0:
            pct = time.time() - t0
            print(f"  {edge_id_counter} edges built ({pct:.0f}s)...", flush=True)

    print(f"[INFO] Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges", flush=True)
    print(f"[INFO] Skipped ways (no valid coords): {skipped_ways}", flush=True)

    # --- Merge nearby nodes ---
    from collections import defaultdict
    tol = 0.0003
    grid = defaultdict(list)
    for node in G.nodes():
        lat, lon = node
        grid[(round(lat / tol), round(lon / tol))].append(node)

    node_map = {}
    merged = 0
    for cell_nodes in grid.values():
        if len(cell_nodes) < 2:
            node_map[cell_nodes[0]] = cell_nodes[0]
            continue
        rep = sorted(cell_nodes, key=lambda n: (n[0], n[1]))[0]
        for n in cell_nodes:
            node_map[n] = rep
            if n != rep:
                merged += 1

    # --- Save pre-merge (backup) ---
    pre_merge_pkl = output_pickle.replace('.pkl', '_pre_merge.pkl')
    print(f"[INFO] Saving pre-merge graph ({G.number_of_nodes()} nodes)...", flush=True)
    with open(pre_merge_pkl, 'wb') as f:
        pickle.dump(G, f, protocol=pickle.HIGHEST_PROTOCOL)

    if merged > 0:
        G2 = nx.DiGraph()
        for u, v, d in G.edges(data=True):
            nu, nv = node_map.get(u, u), node_map.get(v, v)
            if nu != nv:
                if G2.has_edge(nu, nv):
                    ex = G2[nu][nv]
                    ex['safety_score'] = (ex['safety_score'] + d['safety_score']) / 2
                else:
                    G2.add_edge(nu, nv, **d)
        G = G2
        print(f"[INFO] Merged {merged} nearby nodes -> {G.number_of_nodes()} nodes, {G.number_of_edges()} edges", flush=True)

    # --- Save final ---
    os.makedirs(os.path.dirname(output_pickle), exist_ok=True)
    print(f"[INFO] Saving to {output_pickle}...", flush=True)
    with open(output_pickle, 'wb') as f:
        pickle.dump(G, f, protocol=pickle.HIGHEST_PROTOCOL)
    mb = os.path.getsize(output_pickle) // 1024 // 1024
    print(f"[INFO] Saved: {mb} MB", flush=True)


if __name__ == '__main__':
    pbf_dir = r"C:\Users\Lenovo\Downloads\datset"
    pbfs = sorted([
        os.path.join(pbf_dir, f)
        for f in os.listdir(pbf_dir)
        if f.endswith('.osm.pbf')
    ])
    if not pbfs:
        print("No .osm.pbf files found!")
        sys.exit(1)
    out = os.path.join(os.path.dirname(__file__), "data", "delhi_graph.pkl")
    preprocess(pbfs, output_pickle=out)
