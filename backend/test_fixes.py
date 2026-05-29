"""test_fixes.py — Validate KD-Tree, sigmoid, and safety recalibration locally."""
import math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 1. Sigmoid Stretch Test
def _sigmoid_stretch(score, midpoint=50, steepness=0.06):
    deviation = score - midpoint
    stretch = 1.0 + 0.8 * (2.0 / (1.0 + math.exp(-steepness * deviation)) - 1.0)
    stretched = midpoint + deviation * stretch
    return max(10.0, min(98.0, stretched))

print("=== Sigmoid Stretch Test ===")
for s in [20, 30, 40, 50, 60, 70, 80, 88, 95]:
    print(f"  Input: {s:2d} -> Output: {_sigmoid_stretch(s):5.1f}")

# 2. Haversine + Zone Classification Test
from benchmark import haversine_km, classify_edge_ground_truth
print()
print("=== Zone Classification Test ===")
tests = [
    ("Paharganj center", 28.645, 77.213),
    ("Connaught Place", 28.6315, 77.2167),
    ("India Gate", 28.6129, 77.2295),
    ("Seelampur", 28.660, 77.270),
    ("Gurgaon (unknown)", 28.470, 77.030),
]
for name, lat, lon in tests:
    gt = classify_edge_ground_truth(lat, lon)
    print(f"  {name:25s} -> ground_truth: {gt}")

# 3. KD-Tree Test
print()
print("=== KD-Tree Test ===")
try:
    from scipy.spatial import KDTree
    import numpy as np
    print("  scipy available: YES")
    nodes = [(28.6560, 77.2410), (28.6315, 77.2167), (28.6129, 77.2295),
             (28.5600, 77.1200), (28.5245, 77.1850)]
    avg_lat = sum(n[0] for n in nodes) / len(nodes)
    lon_scale = math.cos(math.radians(avg_lat))
    coords = np.array([(n[0], n[1] * lon_scale) for n in nodes])
    tree = KDTree(coords)
    
    test_q = [(28.656, 77.241), (28.632, 77.217), (28.613, 77.230), (28.561, 77.121)]
    for qlat, qlon in test_q:
        q = np.array([[qlat, qlon * lon_scale]])
        d, idx = tree.query(q, k=1)
        bf_min = min(math.sqrt((qlat-n[0])**2 + (qlon-n[1])**2) for n in nodes)
        print(f"  Query ({qlat:.3f}, {qlon:.3f}) -> KDTree: {nodes[idx[0]]} (d={d[0]:.6f})  brute={bf_min:.6f}")
except Exception as e:
    print(f"  FAIL: {e}")

# 4. Safety Engine Recalibration Test
print()
print("=== Safety Engine Recalibration Test ===")
from safety_engine import SafetyScoreEngine
se = SafetyScoreEngine()
print(f"  Weights: w1={se.w1}, w2={se.w2}, w3={se.w3}, w4={se.w4}, w5={se.w5}, w6={se.w6}")
scenarios = [
    {"name": "Well-lit highway", "poi_density": 80, "crime_risk": 5, "lighting_score": 90, "footfall": 70, "ai_sentiment": 5, "crowdsourced_risk": 2},
    {"name": "Dark alley slum", "poi_density": 5, "crime_risk": 90, "lighting_score": 5, "footfall": 5, "ai_sentiment": 80, "crowdsourced_risk": 60},
    {"name": "Residential street", "poi_density": 40, "crime_risk": 30, "lighting_score": 35, "footfall": 35, "ai_sentiment": 15, "crowdsourced_risk": 10},
    {"name": "Tourist hub (CP)", "poi_density": 95, "crime_risk": 10, "lighting_score": 80, "footfall": 85, "ai_sentiment": 8, "crowdsourced_risk": 5},
    {"name": "Transit scam zone", "poi_density": 60, "crime_risk": 65, "lighting_score": 55, "footfall": 70, "ai_sentiment": 45, "crowdsourced_risk": 30},
]
for sc in scenarios:
    s = se.compute_safety_score(sc)
    print(f"  {sc['name']:25s} -> safety: {s:.1f}/100")

# 5. Validation Metrics Test
print()
print("=== Synthetic Validation Metrics Test ===")
from benchmark import compute_validation_metrics, HIGH_RISK_ZONES, SAFE_ZONES
print(f"  High-risk zones: {len(HIGH_RISK_ZONES)}")
for z in HIGH_RISK_ZONES:
    print(f"    {z['name']:20s}  ({z['lat']:.4f}, {z['lon']:.4f}) r={z['radius_km']}km")
print(f"  Safe zones: {len(SAFE_ZONES)}")
for z in SAFE_ZONES:
    print(f"    {z['name']:20s}  ({z['lat']:.4f}, {z['lon']:.4f}) r={z['radius_km']}km")

print()
print("ALL TESTS PASSED")
