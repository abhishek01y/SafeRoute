import numpy as np


def evaluate_routes(shortest_path, safest_path, G):
    if not shortest_path or not safest_path:
        return {"error": "Empty path provided"}

    shortest_risk = 0.0
    for u, v in zip(shortest_path[:-1], shortest_path[1:]):
        if G.has_edge(u, v):
            shortest_risk += 100 - G[u][v].get('safety_score', 70)

    safest_risk = 0.0
    for u, v in zip(safest_path[:-1], safest_path[1:]):
        if G.has_edge(u, v):
            safest_risk += 100 - G[u][v].get('safety_score', 70)

    risk_reduction_pct = ((shortest_risk - safest_risk) / (shortest_risk + 1e-6)) * 100

    shortest_dist = sum(
        G[u][v].get('length_km', 0)
        for u, v in zip(shortest_path[:-1], shortest_path[1:])
        if G.has_edge(u, v)
    )
    safest_dist = sum(
        G[u][v].get('length_km', 0)
        for u, v in zip(safest_path[:-1], safest_path[1:])
        if G.has_edge(u, v)
    )

    return {
        "risk_reduction_pct": round(risk_reduction_pct, 2),
        "shortest_risk_score": round(shortest_risk, 2),
        "safest_risk_score": round(safest_risk, 2),
        "shortest_distance_km": round(shortest_dist, 2),
        "safest_distance_km": round(safest_dist, 2),
        "distance_tradeoff_km": round(safest_dist - shortest_dist, 2),
        "safety_improvement": f"{risk_reduction_pct:.2f}% lower risk exposure!"
    }


def generate_system_report(G):
    edges_data = list(G.edges(data=True))
    if not edges_data:
        return {"error": "No edges in graph"}

    safety_scores = [d.get('safety_score', 70) for _, _, d in edges_data]

    green = sum(1 for s in safety_scores if s > 75)
    yellow = sum(1 for s in safety_scores if 45 <= s <= 75)
    red = sum(1 for s in safety_scores if s < 45)

    return {
        "total_nodes": G.number_of_nodes(),
        "total_edges": G.number_of_edges(),
        "green_roads_safe": green,
        "yellow_roads_moderate": yellow,
        "red_roads_dangerous": red,
        "avg_safety_score": round(np.mean(safety_scores), 2) if safety_scores else 0,
        "min_safety_score": round(min(safety_scores), 2) if safety_scores else 0,
        "max_safety_score": round(max(safety_scores), 2) if safety_scores else 0,
        "std_safety_score": round(np.std(safety_scores), 2) if len(safety_scores) > 1 else 0,
    }
