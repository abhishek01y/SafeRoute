"""
FastAPI App — Python AI service
Runs on port 8000. Called by Node.js backend.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from safety_scorer import calculate_safe_score
from chandigarh_sectors import get_all_sector_scores

app = FastAPI(title="SafeRoute AI — Python Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class CoordRequest(BaseModel):
    lat: float
    lon: float


@app.post("/score")
def get_score(req: CoordRequest):
    """Main endpoint: returns SafeScore for a lat/lon."""
    try:
        result = calculate_safe_score(req.lat, req.lon)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/heatmap")
def get_heatmap():
    """Returns time-adjusted scores for all Chandigarh sectors. Used by frontend heatmap."""
    try:
        scores = get_all_sector_scores()
        return {"sectors": scores}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok", "service": "SafeRoute AI Python Engine"}