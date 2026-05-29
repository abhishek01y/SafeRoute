"""
benchmark.py — Comprehensive accuracy & performance evaluation
for Delhi Safe Route against OSRM ground truth + internal metrics.
"""

import requests
import time
import math
import statistics
import sys
import json

# ── Configuration ──────────────────────────────────────────────────────────
OUR_API = "https://abhisheky01-delhi-safe-route-api.hf.space"
OSRM_URL = "https://router.project-osrm.org/route/v1/driving"

DELHI_BBOX = {"min_lat": 28.42, "max_lat": 28.88, "min_lon": 76.85, "max_lon": 77.32}

TEST_PAIRS = [
    (28.6560, 77.2410, 28.6315, 77.2167),   # Red Fort -> CP
    (28.6315, 77.2167, 28.6129, 77.2295),   # CP -> India Gate
    (28.5600, 77.1200, 28.6315, 77.2167),   # Airport -> CP
    (28.5245, 77.1850, 28.5530, 77.2580),   # Qutub -> Lotus Temple
    (28.5490, 77.2050, 28.5280, 77.2150),   # Hauz Khas -> Saket
    (28.6615, 77.2270, 28.6560, 77.2300),   # Delhi Jn -> Chandni Chowk
    (28.5650, 77.2430, 28.5670, 77.2100),   # Lajpat Nagar -> AIIMS
    (28.6510, 77.1900, 28.6129, 77.2295),   # Karol Bagh -> India Gate
    (28.5900, 77.0500, 28.6315, 77.2167),   # Dwarka -> CP
    (28.7350, 77.1150, 28.6315, 77.2167),   # Rohini -> CP
]

# ── Synthetic Ground-Truth (K-Means derived crime density clusters) ────────
# Known high-risk zones in Delhi — based on Delhi Police crime density / K-Means
HIGH_RISK_ZONES = [
    {"name": "Paharganj",       "lat": 28.6450, "lon": 77.2130, "radius_km": 0.6},
    {"name": "Chandni Chowk",   "lat": 28.6560, "lon": 77.2300, "radius_km": 0.5},
    {"name": "Kashmere Gate",   "lat": 28.6720, "lon": 77.2320, "radius_km": 0.5},
    {"name": "Delhi Jn Station","lat": 28.6615, "lon": 77.2270, "radius_km": 0.5},
    {"name": "Seelampur",       "lat": 28.6600, "lon": 77.2700, "radius_km": 0.5},
    {"name": "Tughlakabad",     "lat": 28.5000, "lon": 77.2800, "radius_km": 0.5},
    {"name": "Narela",          "lat": 28.8450, "lon": 77.0900, "radius_km": 0.5},
    {"name": "Bhalswa",         "lat": 28.7300, "lon": 77.1700, "radius_km": 0.4},
    {"name": "Sangam Vihar",    "lat": 28.4850, "lon": 77.2300, "radius_km": 0.5},
    {"name": "Mangolpuri",      "lat": 28.6900, "lon": 77.0800, "radius_km": 0.4},
]

# Known safe zones (high police presence / well-lit / tourist-heavy)
SAFE_ZONES = [
    {"name": "Connaught Place", "lat": 28.6315, "lon": 77.2167, "radius_km": 0.4},
    {"name": "India Gate",      "lat": 28.6129, "lon": 77.2295, "radius_km": 0.4},
    {"name": "Lutyens Delhi",   "lat": 28.6140, "lon": 77.2000, "radius_km": 0.6},
    {"name": "Saket",           "lat": 28.5280, "lon": 77.2150, "radius_km": 0.4},
    {"name": "Hauz Khas",       "lat": 28.5490, "lon": 77.2050, "radius_km": 0.3},
    {"name": "Dwarka Sector 7", "lat": 28.5900, "lon": 77.0500, "radius_km": 0.4},
    {"name": "Rohini Sector 3", "lat": 28.7350, "lon": 77.1150, "radius_km": 0.3},
]


def haversine_km(lat1, lon1, lat2, lon2):
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


# ── Helpers ────────────────────────────────────────────────────────────────

def our_route(slat, slon, elat, elon, mode="shortest"):
    try:
        t0 = time.perf_counter()
        r = requests.post(f"{OUR_API}/route", json={
            "start_lat": slat, "start_lon": slon,
            "end_lat": elat, "end_lon": elon,
            "mode": mode, "transport": "car"
        }, timeout=30)
        dt = time.perf_counter() - t0
        if r.status_code == 200:
            d = r.json()
            return d.get("total_distance_km", None), dt, d.get("avg_safety_score", None), d.get("path", [])
        return None, dt, None, []
    except Exception as e:
        return None, None, None, []

def osrm_route(slat, slon, elat, elon):
    try:
        r = requests.get(
            f"{OSRM_URL}/{slon},{slat};{elon},{elat}",
            params={"overview": "false", "alternatives": "false"},
            timeout=15
        )
        if r.status_code == 200:
            d = r.json()
            if d.get("code") == "Ok" and d.get("routes"):
                return d["routes"][0]["distance"] / 1000.0  # m -> km
        return None
    except Exception:
        return None

def our_compare(slat, slon, elat, elon):
    """Get all 3 modes + timing."""
    modes = {"shortest": None, "balanced": None, "safest": None}
    timings = {}
    for m in modes:
        t0 = time.perf_counter()
        try:
            r = requests.post(f"{OUR_API}/route", json={
                "start_lat": slat, "start_lon": slon,
                "end_lat": elat, "end_lon": elon,
                "mode": m, "transport": "car"
            }, timeout=30)
            dt = time.perf_counter() - t0
            timings[m] = dt
            if r.status_code == 200:
                d = r.json()
                modes[m] = {
                    "dist": d.get("total_distance_km"),
                    "safety": d.get("avg_safety_score"),
                    "risk": d.get("risk_exposure"),
                    "path": d.get("path", []),
                }
        except:
            timings[m] = None
    return modes, timings

def health_check():
    try:
        r = requests.get(f"{OUR_API}/health", timeout=30)
        return r.json() if r.status_code == 200 else None
    except:
        return None


def classify_edge_ground_truth(edge_lat, edge_lon):
    """Classify an edge as 'risky' (True) or 'safe' (False) based on
    proximity to known high-risk / safe zones."""
    for zone in HIGH_RISK_ZONES:
        if haversine_km(edge_lat, edge_lon, zone["lat"], zone["lon"]) < zone["radius_km"]:
            return True   # truly risky
    for zone in SAFE_ZONES:
        if haversine_km(edge_lat, edge_lon, zone["lat"], zone["lon"]) < zone["radius_km"]:
            return False  # truly safe
    return None  # unknown — skip


def compute_validation_metrics(path_edges_geojson):
    """Compute Precision, Recall, F1 against synthetic ground-truth.
    Our system classifies an edge as 'dangerous' if safety_score < 45.
    Ground truth is 'risky' if within a HIGH_RISK_ZONE."""
    tp = fp = tn = fn = 0
    for feat in path_edges_geojson:
        props = feat.get("properties", {})
        geom = feat.get("geometry", {}).get("coordinates", [])
        if not geom or len(geom) < 1:
            continue
        # Edge centroid from geometry midpoint
        mid = len(geom) // 2
        edge_lon, edge_lat = geom[mid]

        gt = classify_edge_ground_truth(edge_lat, edge_lon)
        if gt is None:
            continue  # unknown zone — skip

        safety = props.get("safety_score", 70)
        our_prediction = safety < 45  # our "dangerous" threshold

        if gt and our_prediction:
            tp += 1
        elif gt and not our_prediction:
            fn += 1  # FALSE NEGATIVE — most dangerous!
        elif not gt and our_prediction:
            fp += 1
        else:
            tn += 1

    total = tp + fp + tn + fn
    if total == 0:
        return {"error": "no ground-truth overlap"}

    precision = tp / max(1, tp + fp)
    recall = tp / max(1, tp + fn)
    f1 = 2 * precision * recall / max(1e-6, precision + recall)
    fnr = fn / max(1, fn + tp)  # False Negative Rate

    return {
        "true_positives": tp,
        "false_positives": fp,
        "true_negatives": tn,
        "false_negatives": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_score": round(f1, 4),
        "false_negative_rate": round(fnr, 4),
        "total_classified": total,
    }


# ── Main Benchmark ─────────────────────────────────────────────────────────

def run_benchmark():
    print("=" * 72)
    print("  DELHI SAFE ROUTE - COMPREHENSIVE BENCHMARK")
    print("=" * 72)

    # 0. Health
    h = health_check()
    if not h:
        print("\n  [FAIL] Backend not reachable. Aborting.")
        sys.exit(1)
    print(f"\n  [OK] Backend healthy: {h.get('nodes', '?')} nodes, {h.get('edges', '?')} edges\n")

    print("-" * 72)
    print("  1. ROUTE DISTANCE ACCURACY (vs OSRM)")
    print("-" * 72)

    our_dists = []
    ref_dists = []
    errors_pct = []
    a_star_times = []
    all_paths = []

    for i, (slat, slon, elat, elon) in enumerate(TEST_PAIRS):
        our_d, t, _, path = our_route(slat, slon, elat, elon, "shortest")
        ref_d = osrm_route(slat, slon, elat, elon)

        if our_d and t is not None:
            a_star_times.append(t)
            all_paths.append(path)

        if our_d and ref_d:
            err = abs(our_d - ref_d) / ref_d * 100
            errors_pct.append(err)
            our_dists.append(our_d)
            ref_dists.append(ref_d)
            print(f"  [{i+1:2d}] Our: {our_d:5.2f} km  OSRM: {ref_d:5.2f} km  Error: {err:5.1f}%")

    if errors_pct:
        rmse = math.sqrt(sum((o - r)**2 for o, r in zip(our_dists, ref_dists)) / len(errors_pct))
        mae = sum(abs(o - r) for o, r in zip(our_dists, ref_dists)) / len(errors_pct)
        mape = sum(errors_pct) / len(errors_pct)
        print(f"\n  Results ({len(errors_pct)} valid pairs):")
        print(f"     RMSE:       {rmse:.3f} km")
        print(f"     MAE:        {mae:.3f} km")
        print(f"     MAPE:       {mape:.1f}%")
        print(f"     Min Error:  {min(errors_pct):.1f}%")
        print(f"     Max Error:  {max(errors_pct):.1f}%")
        print(f"     <=10% err:   {sum(1 for e in errors_pct if e <= 10)}/{len(errors_pct)} pairs")
        print(f"     <=20% err:   {sum(1 for e in errors_pct if e <= 20)}/{len(errors_pct)} pairs")
    else:
        print("  [FAIL] No valid comparisons")

    # 1. A* Performance
    print("\n" + "-" * 72)
    print("  2. A* SEARCH PERFORMANCE")
    print("-" * 72)
    if a_star_times:
        print(f"     Mean:   {statistics.mean(a_star_times)*1000:.1f} ms")
        print(f"     Median: {statistics.median(a_star_times)*1000:.1f} ms")
        print(f"     Min:    {min(a_star_times)*1000:.1f} ms")
        print(f"     Max:    {max(a_star_times)*1000:.1f} ms")
        print(f"     P95:    {sorted(a_star_times)[int(len(a_star_times)*0.95)]*1000:.1f} ms")

    # 2. Multi-Mode Differentiation
    print("\n" + "-" * 72)
    print("  3. MULTI-MODE DIFFERENTIATION")
    print("-" * 72)
    diff_count = 0
    safety_gains = []
    for slat, slon, elat, elon in TEST_PAIRS[:20]:
        modes, timings = our_compare(slat, slon, elat, elon)
        if modes["shortest"] and modes["safest"]:
            sd = modes["shortest"]["dist"]
            fd = modes["safest"]["dist"]
            ss = modes["shortest"]["safety"]
            fs = modes["safest"]["safety"]
            if abs(sd - fd) > 0.01:
                diff_count += 1
            if fs and ss:
                safety_gains.append(fs - ss)

    print(f"     Different paths: {diff_count}/{min(20, len(TEST_PAIRS))} OD pairs")
    if safety_gains:
        print(f"     Avg safety gain (safest vs shortest): {statistics.mean(safety_gains):.1f} pts")
        print(f"     Max safety gain: {max(safety_gains):.1f} pts")
        print(f"     Min safety gain: {min(safety_gains):.1f} pts")

    # 3. Safety Score Distribution
    print("\n" + "-" * 72)
    print("  4. SAFETY SCORE DISTRIBUTION")
    print("-" * 72)
    try:
        r = requests.get(f"{OUR_API}/system-report", timeout=15)
        if r.status_code == 200:
            sr = r.json()
            sc = sr.get("avg_safety_score", 0)
            print(f"     Avg score:  {sc}/100")
            print(f"     Min score:  {sr.get('min_safety_score', 0)}/100")
            print(f"     Max score:  {sr.get('max_safety_score', 0)}/100")
            print(f"     Std dev:    {sr.get('std_safety_score', 0)}")
            print(f"     Green >75:  {sr.get('green_roads_safe', 0)} edges")
            print(f"     Yellow 45-75: {sr.get('yellow_roads_moderate', 0)} edges")
            print(f"     Red <45:   {sr.get('red_roads_dangerous', 0)} edges")
    except:
        print("     [FAIL] Could not fetch system report")

    # 4. Known Route Verification
    print("\n" + "-" * 72)
    print("  5. KNOWN ROUTE VERIFICATION")
    print("-" * 72)
    known = [
        ("Red Fort -> CP", 28.6560, 77.2410, 28.6315, 77.2167, 4.6),
        ("CP -> India Gate", 28.6315, 77.2167, 28.6129, 77.2295, 2.5),
        ("Airport -> CP", 28.5600, 77.1200, 28.6315, 77.2167, 17.0),
    ]
    for name, slat, slon, elat, elon, expected in known:
        our_d, t, safety, _ = our_route(slat, slon, elat, elon, "shortest")
        ref_d = osrm_route(slat, slon, elat, elon)
        if our_d and ref_d:
            err_vs_google = abs(our_d - expected) / expected * 100
            err_vs_osrm = abs(our_d - ref_d) / ref_d * 100
            print(f"  {name:25s}  Our: {our_d:5.2f} km  OSRM: {ref_d:5.2f} km  "
                  f"vs Google: {err_vs_google:4.1f}%  vs OSRM: {err_vs_osrm:4.1f}%  "
                  f"Safety: {safety}/100")

    # 5. Synthetic Ground-Truth Validation (Fix 3)
    print("\n" + "-" * 72)
    print("  6. SYNTHETIC GROUND-TRUTH VALIDATION")
    print("-" * 72)
    print("     HIGH_RISK_ZONES:", len(HIGH_RISK_ZONES), "zones")
    print("     SAFE_ZONES:", len(SAFE_ZONES), "zones")
    try:
        # Fetch path_edges from compare endpoint for first test pair
        slat, slon, elat, elon = TEST_PAIRS[0]
        r = requests.post(f"{OUR_API}/route", json={
            "start_lat": slat, "start_lon": slon,
            "end_lat": elat, "end_lon": elon,
            "mode": "safest", "transport": "car", "safety_mode": "standard"
        }, timeout=30)
        if r.status_code == 200:
            d = r.json()
            path_edges = d.get("path_edges", [])
            # Build GeoJSON-like features from path_edges
            features = []
            for pe in path_edges:
                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[pe["to"][1], pe["to"][0]], [pe["from"][1], pe["from"][0]]],
                    },
                    "properties": {
                        "safety_score": pe.get("safety_score", 70),
                    }
                })
            metrics = compute_validation_metrics(features)
            if "error" in metrics:
                print(f"     {metrics['error']}")
            else:
                print(f"     Classified edges: {metrics['total_classified']}")
                print(f"     TP: {metrics['true_positives']}  FP: {metrics['false_positives']}")
                print(f"     TN: {metrics['true_negatives']}  FN: {metrics['false_negatives']}")
                print(f"     Precision:  {metrics['precision']:.3f}")
                print(f"     Recall:     {metrics['recall']:.3f}")
                print(f"     F1-Score:   {metrics['f1_score']:.3f}")
                print(f"     FNR (FN rate): {metrics['false_negative_rate']:.3f}")
                print(f"     Target: minimize FN -> keep FNR < 0.10")
                print(f"     [{'PASS' if metrics['false_negative_rate'] < 0.10 else 'WARN'}] "
                      f"FNR threshold {'met' if metrics['false_negative_rate'] < 0.10 else 'exceeded'}")
        else:
            print("     [FAIL] Could not fetch path edges")
    except Exception as e:
        print(f"     [FAIL] Validation error: {e}")

    # 6. Summary
    print("\n" + "=" * 72)
    print("  BENCHMARK SUMMARY")
    print("=" * 72)
    if errors_pct:
        print(f"  Route Distance - RMSE: {rmse:.3f} km, MAPE: {mape:.1f}% ({len(errors_pct)} OD pairs)")
    if a_star_times:
        print(f"  A* Latency    - Mean: {statistics.mean(a_star_times)*1000:.0f} ms, P95: {sorted(a_star_times)[int(len(a_star_times)*0.95)]*1000:.0f} ms")
    print(f"  Multi-Mode    - {diff_count}/{min(20, len(TEST_PAIRS))} OD pairs show different paths")
    if safety_gains:
        print(f"  Safety Gain   - Avg {statistics.mean(safety_gains):.1f} pts when choosing safest over shortest")
    print("=" * 72)


if __name__ == "__main__":
    run_benchmark()
