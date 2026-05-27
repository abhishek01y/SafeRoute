from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from contextlib import asynccontextmanager
from datetime import datetime
import uvicorn
import os
import asyncio
import logging
from shapely.geometry import LineString, Point

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants & helpers
# ---------------------------------------------------------------------------
EMERGENCY_CONTACT = os.getenv("EMERGENCY_CONTACT", "+911121223344")


def is_night_time():
    h = (datetime.utcnow().hour + 5) % 24
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

# In-memory dead-man alert log
deadman_alerts = []

# In-memory navigation session store
active_nav_sessions = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global G, router
    logger.info("Loading Delhi road network...")
    G = load_and_segment_delhi_data(
        highway_shp_path=HIGHWAY_SHP,
        poi_shp_path=POI_SHP,
        admin_shp_path=ADMIN_SHP
    )
    router = SafeRouter(G)
    logger.info(f"Server ready. {G.number_of_nodes()} nodes, {G.number_of_edges()} edges loaded.")

    gdelt_task = asyncio.create_task(gdelt_background_loop())
    logger.info("GDELT auto-updater started (every 10 min)")
    yield
    gdelt_task.cancel()
    logger.info("Shutting down...")


async def gdelt_background_loop():
    global G, router, safety_engine
    while True:
        try:
            await asyncio.sleep(600)
            logger.info("Running GDELT news update...")
            success = await update_safety_scores_from_news(safety_engine, G, router)
            if success:
                logger.info("GDELT update complete")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"GDELT update failed: {e}")


app = FastAPI(title="Delhi Safe Route API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class RouteRequest(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    mode: str = "balanced"
    transport: str = "car"
    user_weight: Optional[float] = None
    safety_mode: str = "standard"  # "standard" | "women_safety" | "domestic_tourist"


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


class DeadmanTrigger(BaseModel):
    lat: float
    lon: float
    emergency_contact: str = EMERGENCY_CONTACT
    session_id: Optional[str] = None


class TrajectoryVerifyRequest(BaseModel):
    assigned_path: List[List[float]]  # [[lat, lon], ...]
    current_gps: List[float]          # [lat, lon]


class NavSessionStart(BaseModel):
    session_id: str
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    transport: str = "car"
    safety_mode: str = "standard"
    emergency_contact: str = EMERGENCY_CONTACT


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    return {
        "app": "Delhi Safe Route API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": [
            "/route", "/compare", "/edges", "/evaluate",
            "/report", "/incident", "/gdelt", "/system-report",
            "/xai", "/health", "/safety/deadman-trigger",
            "/navigation/verify-trajectory", "/navigation/session-start",
        ]
    }


@app.get("/edges")
async def get_edges(major: bool = False):
    if router is None:
        raise HTTPException(status_code=503, detail="Graph not loaded yet")
    return router.get_all_edges_geojson(major_only=major)


DELHI_POIS = [
    {"name": "AIIMS Delhi", "lat": 28.5670, "lon": 77.2100, "type": "hospital", "address": "Ansari Nagar"},
    {"name": "Safdarjung Hospital", "lat": 28.5620, "lon": 77.2000, "type": "hospital", "address": "Ring Road"},
    {"name": "LNJP Hospital", "lat": 28.6350, "lon": 77.2300, "type": "hospital"},
    {"name": "GTB Hospital", "lat": 28.7050, "lon": 77.2350, "type": "hospital"},
    {"name": "RML Hospital", "lat": 28.6300, "lon": 77.2200, "type": "hospital"},
    {"name": "Holy Family Hospital", "lat": 28.5600, "lon": 77.2600, "type": "hospital"},
    {"name": "Max Hospital Saket", "lat": 28.5250, "lon": 77.2150, "type": "hospital"},
    {"name": "Fortis Hospital", "lat": 28.5550, "lon": 77.2650, "type": "hospital"},
    {"name": "Apollo Hospital", "lat": 28.5450, "lon": 77.2750, "type": "hospital"},
    {"name": "Connaught Place Police Station", "lat": 28.6320, "lon": 77.2180, "type": "police"},
    {"name": "Chandni Chowk Police Station", "lat": 28.6550, "lon": 77.2300, "type": "police"},
    {"name": "New Delhi Police Station", "lat": 28.6150, "lon": 77.2150, "type": "police"},
    {"name": "Hauz Khas Police Station", "lat": 28.5500, "lon": 77.2050, "type": "police"},
    {"name": "Karol Bagh Police Station", "lat": 28.6500, "lon": 77.1900, "type": "police"},
    {"name": "Dwarka Police Station", "lat": 28.5850, "lon": 77.0500, "type": "police"},
    {"name": "Rohini Police Station", "lat": 28.7350, "lon": 77.1150, "type": "police"},
    {"name": "Red Fort", "lat": 28.6560, "lon": 77.2410, "type": "landmark"},
    {"name": "India Gate", "lat": 28.6129, "lon": 77.2295, "type": "landmark"},
    {"name": "Qutub Minar", "lat": 28.5245, "lon": 77.1850, "type": "landmark"},
    {"name": "Lotus Temple", "lat": 28.5530, "lon": 77.2580, "type": "landmark"},
    {"name": "Akshardham Temple", "lat": 28.6120, "lon": 77.2750, "type": "landmark"},
    {"name": "Jama Masjid", "lat": 28.6510, "lon": 77.2330, "type": "landmark"},
    {"name": "Humayun's Tomb", "lat": 28.5930, "lon": 77.2480, "type": "landmark"},
    {"name": "Lodhi Garden", "lat": 28.5900, "lon": 77.2200, "type": "landmark"},
    {"name": "Parliament House", "lat": 28.6170, "lon": 77.2080, "type": "landmark"},
    {"name": "Rashtrapati Bhavan", "lat": 28.6140, "lon": 77.2000, "type": "landmark"},
    {"name": "Supreme Court", "lat": 28.6220, "lon": 77.2400, "type": "landmark"},
    {"name": "Connaught Place", "lat": 28.6315, "lon": 77.2167, "type": "landmark"},
    {"name": "Chandni Chowk", "lat": 28.6560, "lon": 77.2300, "type": "landmark"},
    {"name": "Delhi Junction Railway Station", "lat": 28.6615, "lon": 77.2270, "type": "transit"},
    {"name": "New Delhi Railway Station", "lat": 28.6420, "lon": 77.2210, "type": "transit"},
    {"name": "ISBT Kashmere Gate", "lat": 28.6720, "lon": 77.2320, "type": "transit"},
    {"name": "IGI Airport Terminal 3", "lat": 28.5600, "lon": 77.1200, "type": "transit"},
]


@app.get("/pois")
async def get_pois(types: str = ""):
    if not types:
        return DELHI_POIS
    type_list = [t.strip().lower() for t in types.split(",")]
    return [p for p in DELHI_POIS if p["type"] in type_list]


@app.post("/route")
async def get_route(req: RouteRequest):
    if router is None:
        raise HTTPException(status_code=503, detail="Graph not loaded yet")
    start_node = router.find_nearest_node(req.start_lat, req.start_lon)
    end_node = router.find_nearest_node(req.end_lat, req.end_lon)
    if start_node is None or end_node is None:
        raise HTTPException(status_code=404, detail="Could not find nearest nodes")

    result = router.get_safest_route(
        start_node, end_node, req.mode, req.user_weight,
        req.transport, is_night=is_night_time(), safety_mode=req.safety_mode
    )
    if 'error' in result:
        raise HTTPException(status_code=404, detail=result['error'])
    path_coords = [{"lat": node[0], "lon": node[1]} for node in result['path']]
    return {
        "path": path_coords,
        "path_edges": result['path_edges'],
        "total_distance_km": result['total_distance_km'],
        "avg_safety_score": result['avg_safety_score'],
        "risk_exposure": result['risk_exposure'],
        "routing_mode": req.mode,
        "transport": req.transport,
        "safety_mode": req.safety_mode,
    }


@app.post("/compare")
async def compare_routes(req: RouteRequest):
    if router is None:
        raise HTTPException(status_code=503, detail="Graph not loaded yet")
    start_node = router.find_nearest_node(req.start_lat, req.start_lon)
    end_node = router.find_nearest_node(req.end_lat, req.end_lon)
    if start_node is None or end_node is None:
        raise HTTPException(status_code=404, detail="Could not find nearest nodes")

    comparison = router.compare_routes(
        start_node, end_node, req.user_weight,
        req.transport, is_night=is_night_time(), safety_mode=req.safety_mode
    )
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
                "risk_exposure": mode_result['risk_exposure'],
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
    return router.evaluate_route_comparison(start_node, end_node)


@app.get("/system-report")
async def system_report():
    if router is None or G is None:
        raise HTTPException(status_code=503, detail="Graph not loaded yet")
    return generate_system_report(G)


@app.post("/report")
async def submit_report(req: ReportRequest):
    safety_engine.add_user_report(
        edge_id=req.edge_id, user_id=req.user_id,
        report_type=req.report_type, lat=req.lat, lon=req.lon
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
    return {"message": "Report submitted successfully", "status": "accepted", "confidence": "high"}


@app.post("/incident")
async def add_incident(req: IncidentRequest):
    safety_engine.add_incident(
        lat=req.lat, lon=req.lon,
        severity=req.severity, incident_type=req.incident_type
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
    shortest = router.get_safest_route(
        start_node, end_node, "shortest",
        transport=req.transport, is_night=night, safety_mode=req.safety_mode
    )
    safest = router.get_safest_route(
        start_node, end_node, req.mode,
        transport=req.transport, is_night=night, safety_mode=req.safety_mode
    )
    if 'error' in shortest or 'error' in safest:
        raise HTTPException(status_code=404, detail="Could not compute routes")
    explanations = safety_engine.generate_xai_explanation(
        safest['path'], G,
        shortest_distance=shortest['total_distance_km'],
        safest_distance=safest['total_distance_km']
    )
    return {
        "mode": req.mode,
        "safety_mode": req.safety_mode,
        "explanations": explanations,
        "shortest_distance_km": shortest['total_distance_km'],
        "selected_distance_km": safest['total_distance_km'],
        "safety_gain": safest['avg_safety_score'] - shortest['avg_safety_score'],
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "graph_loaded": G is not None,
        "nodes": G.number_of_nodes() if G else 0,
        "edges": G.number_of_edges() if G else 0,
    }


# ===========================================================================
# SAFETY PROTOCOL ENDPOINTS
# ===========================================================================

@app.post("/navigation/session-start")
async def navigation_session_start(req: NavSessionStart):
    """
    Register a new navigation session. Frontend calls this when user starts
    navigating so the backend can correlate dead-man triggers and deviation
    checks with an active session.
    """
    active_nav_sessions[req.session_id] = {
        "session_id": req.session_id,
        "start": (req.start_lat, req.start_lon),
        "end": (req.end_lat, req.end_lon),
        "transport": req.transport,
        "safety_mode": req.safety_mode,
        "emergency_contact": req.emergency_contact,
        "last_ping": datetime.utcnow().isoformat(),
        "alerts": [],
    }
    logger.info(f"Nav session started: {req.session_id}")
    return {"status": "ok", "session_id": req.session_id}


@app.post("/safety/deadman-trigger")
async def deadman_trigger(req: DeadmanTrigger):
    """
    Called when the user fails to respond to the 5-min "Are you safe?" check.
    Logs a critical alert.  In production this would fire a Twilio/SMS gateway.
    """
    alert = {
        "timestamp": datetime.utcnow().isoformat(),
        "lat": req.lat,
        "lon": req.lon,
        "emergency_contact": req.emergency_contact,
        "session_id": req.session_id,
        "type": "DEADMAN_TRIGGER",
        "msg": f"User unresponsive. Last known: ({req.lat:.4f}, {req.lon:.4f}). "
               f"Dispatch alert to {req.emergency_contact}",
    }
    deadman_alerts.append(alert)
    logger.warning(f"DEADMAN TRIGGER: {alert['msg']}")

    # --- Mock Twilio / SMS gateway integration ---
    tracking_link = f"https://www.google.com/maps?q={req.lat:.4f},{req.lon:.4f}"
    sms_body = (
        f"SAFETY ALERT: User unresponsive during navigation session "
        f"'{req.session_id or 'unknown'}'. "
        f"Last known location: {tracking_link}. "
        f"Please verify safety immediately."
    )
    logger.info(f"[MOCK SMS] To: {req.emergency_contact}")
    logger.info(f"[MOCK SMS] Body: {sms_body}")

    return {
        "status": "alert_dispatched",
        "alert_id": len(deadman_alerts),
        "emergency_contact": req.emergency_contact,
        "mock_sms_body": sms_body,
    }


@app.post("/navigation/verify-trajectory")
async def verify_trajectory(req: TrajectoryVerifyRequest):
    """
    Verify the user's current GPS against the assigned A* path.
    Uses shapely to check if the current point is within a 100-metre corridor
    around the planned route.
    """
    if len(req.assigned_path) < 2:
        raise HTTPException(status_code=400, detail="assigned_path must contain at least 2 coordinate pairs")
    if len(req.current_gps) != 2:
        raise HTTPException(status_code=400, detail="current_gps must be [lat, lon]")

    try:
        # Build a LineString from the assigned route
        route_line = LineString([(p[1], p[0]) for p in req.assigned_path])  # (lon, lat) for shapely
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid assigned_path: {e}")

    # 100-metre buffer (~0.0009 deg at Delhi latitude)
    buffer_deg = 100.0 / 111320.0
    corridor = route_line.buffer(buffer_deg)

    current_point = Point(req.current_gps[1], req.current_gps[0])

    if current_point.within(corridor):
        return {
            "status": "on_track",
            "msg": "User is within the assigned safe corridor",
            "coordinates": req.current_gps,
        }

    logger.warning(f"TRAJECTORY DEVIATION: user at {req.current_gps} diverged from assigned path")
    return {
        "status": "diverted",
        "msg": "Diverted from assigned safe path",
        "coordinates": req.current_gps,
    }


@app.get("/safety/alerts")
async def get_safety_alerts():
    """Return all dead-man alerts (for dashboard / monitoring)."""
    return {"total": len(deadman_alerts), "alerts": deadman_alerts[-50:]}


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
