from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from contextlib import asynccontextmanager
from datetime import datetime
import uvicorn
import os
import asyncio


def is_night_time():
    h = (datetime.utcnow().hour + 5) % 24  # IST = UTC+5:30, approximate hour
    return h < 6 or h >= 19

from data_loader import load_and_segment_delhi_data
from routing_engine import SafeRouter
from safety_engine import SafetyScoreEngine
from evaluation import evaluate_routes, generate_system_report
from gdelt_updater import update_safety_scores_from_news

G = None
router = None
safety_engine = SafetyScoreEngine()

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
HIGHWAY_SHP = os.path.join(DATA_DIR, "delhi_highway.shp")
POI_SHP = os.path.join(DATA_DIR, "delhi_poi.shp")
ADMIN_SHP = os.path.join(DATA_DIR, "delhi_administrative.shp")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global G, router
    print("[INFO] Loading Delhi road network...")
    G = load_and_segment_delhi_data(
        highway_shp_path=HIGHWAY_SHP,
        poi_shp_path=POI_SHP,
        admin_shp_path=ADMIN_SHP
    )
    router = SafeRouter(G)
    print(f"[INFO] Server ready. {G.number_of_nodes()} nodes, {G.number_of_edges()} edges loaded.")

    gdelt_task = asyncio.create_task(gdelt_background_loop())
    print("[INFO] GDELT auto-updater started (every 10 min)")

    yield

    gdelt_task.cancel()
    print("[INFO] Shutting down...")


async def gdelt_background_loop():
    global G, router, safety_engine
    while True:
        try:
            await asyncio.sleep(600)
            print("[INFO] Running GDELT news update...")
            success = await update_safety_scores_from_news(safety_engine, G, router)
            if success:
                print("[INFO] GDELT update complete")
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[ERROR] GDELT update failed: {e}")


app = FastAPI(title="Delhi Safe Route API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RouteRequest(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    mode: str = "balanced"
    transport: str = "car"
    user_weight: Optional[float] = None


class ReportRequest(BaseModel):
    edge_id: int
    user_id: str
    report_type: str
    lat: Optional[float] = None
    lon: Optional[float] = None


class IncidentRequest(BaseModel):
    lat: float
    lon: float
    severity: int = 50
    incident_type: str = "general"


class GDELTUpdate(BaseModel):
    news_items: List[dict]





@app.get("/")
async def root():
    return {
        "app": "Delhi Safe Route API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": [
            "/route", "/compare", "/edges", "/evaluate",
            "/report", "/incident", "/gdelt", "/system-report",
            "/xai", "/health"
        ]
    }


@app.get("/edges")
async def get_edges(major: bool = False):
    if router is None:
        raise HTTPException(status_code=503, detail="Graph not loaded yet")
    return router.get_all_edges_geojson(major_only=major)


@app.post("/route")
async def get_route(req: RouteRequest):
    if router is None:
        raise HTTPException(status_code=503, detail="Graph not loaded yet")

    start_node = router.find_nearest_node(req.start_lat, req.start_lon)
    end_node = router.find_nearest_node(req.end_lat, req.end_lon)

    if start_node is None or end_node is None:
        raise HTTPException(status_code=404, detail="Could not find nearest nodes")

    result = router.get_safest_route(start_node, end_node, req.mode, req.user_weight, req.transport, is_night=is_night_time())

    if 'error' in result:
        raise HTTPException(status_code=404, detail=result['error'])

    path_coords = [
        {"lat": node[0], "lon": node[1]}
        for node in result['path']
    ]

    return {
        "path": path_coords,
        "path_edges": result['path_edges'],
        "total_distance_km": result['total_distance_km'],
        "avg_safety_score": result['avg_safety_score'],
        "risk_exposure": result['risk_exposure'],
        "routing_mode": req.mode,
        "transport": req.transport
    }


@app.post("/compare")
async def compare_routes(req: RouteRequest):
    if router is None:
        raise HTTPException(status_code=503, detail="Graph not loaded yet")

    start_node = router.find_nearest_node(req.start_lat, req.start_lon)
    end_node = router.find_nearest_node(req.end_lat, req.end_lon)

    if start_node is None or end_node is None:
        raise HTTPException(status_code=404, detail="Could not find nearest nodes")

    comparison = router.compare_routes(start_node, end_node, req.user_weight, req.transport, is_night=is_night_time())

    speed_kmh = {"car": 20, "motorcycle": 25, "walk": 5}.get(req.transport, 20)
    result = {}
    for mode_name, mode_result in comparison.items():
        if 'error' not in mode_result:
            dist = mode_result['total_distance_km']
            time_min = round((dist / speed_kmh) * 60, 1)
            result[mode_name] = {
                "path": [{"lat": n[0], "lon": n[1]} for n in mode_result['path']],
                "path_edges": mode_result['path_edges'],
                "total_distance_km": dist,
                "estimated_time_min": time_min,
                "avg_safety_score": mode_result['avg_safety_score'],
                "risk_exposure": mode_result['risk_exposure']
            }
        else:
            result[mode_name] = {"error": mode_result['error']}

    return result


@app.post("/evaluate")
async def evaluate(req: RouteRequest):
    if router is None:
        raise HTTPException(status_code=503, detail="Graph not loaded yet")

    start_node = router.find_nearest_node(req.start_lat, req.start_lon)
    end_node = router.find_nearest_node(req.end_lat, req.end_lon)

    if start_node is None or end_node is None:
        raise HTTPException(status_code=404, detail="Could not find nearest nodes")

    eval_result = router.evaluate_route_comparison(start_node, end_node)
    return eval_result


@app.get("/system-report")
async def system_report():
    if router is None or G is None:
        raise HTTPException(status_code=503, detail="Graph not loaded yet")

    return generate_system_report(G)


@app.post("/report")
async def submit_report(req: ReportRequest):
    safety_engine.add_user_report(
        edge_id=req.edge_id,
        user_id=req.user_id,
        report_type=req.report_type,
        lat=req.lat,
        lon=req.lon
    )

    if G and G.has_edge:
        dummy_edge_data = {'crime_risk': 30, 'ai_sentiment': 20, 'safety_score': 70}
        validation = safety_engine.validate_report_with_gdelt(dummy_edge_data, req.report_type)

        if validation['override']:
            return {
                "message": "Report received with override",
                "status": validation['status'],
                "confidence": validation['confidence'],
                "reason": validation['reason']
            }

    return {
        "message": "Report submitted successfully",
        "status": "accepted",
        "confidence": "high"
    }


@app.post("/incident")
async def add_incident(req: IncidentRequest):
    safety_engine.add_incident(
        lat=req.lat,
        lon=req.lon,
        severity=req.severity,
        incident_type=req.incident_type
    )
    return {"message": "Incident recorded", "total_incidents": len(safety_engine.recent_incidents)}


@app.post("/gdelt")
async def update_gdelt(req: GDELTUpdate):
    for news in req.news_items:
        safety_engine.gdelt_cache[news.get('id', str(hash(str(news))))] = news
    return {"message": f"{len(req.news_items)} GDELT items processed"}


@app.post("/xai")
async def get_xai_explanation(req: RouteRequest):
    if router is None or G is None:
        raise HTTPException(status_code=503, detail="Graph not loaded yet")

    start_node = router.find_nearest_node(req.start_lat, req.start_lon)
    end_node = router.find_nearest_node(req.end_lat, req.end_lon)

    night = is_night_time()
    shortest = router.get_safest_route(start_node, end_node, "shortest", transport=req.transport, is_night=night)
    safest = router.get_safest_route(start_node, end_node, req.mode, transport=req.transport, is_night=night)

    if 'error' in shortest or 'error' in safest:
        raise HTTPException(status_code=404, detail="Could not compute routes")

    explanations = safety_engine.generate_xai_explanation(
        safest['path'],
        G,
        shortest_distance=shortest['total_distance_km'],
        safest_distance=safest['total_distance_km']
    )

    return {
        "mode": req.mode,
        "explanations": explanations,
        "shortest_distance_km": shortest['total_distance_km'],
        "selected_distance_km": safest['total_distance_km'],
        "safety_gain": safest['avg_safety_score'] - shortest['avg_safety_score']
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "graph_loaded": G is not None,
        "nodes": G.number_of_nodes() if G else 0,
        "edges": G.number_of_edges() if G else 0
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
