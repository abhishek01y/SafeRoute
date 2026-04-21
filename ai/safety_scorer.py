"""
Safety Scorer
Combines: (1) Chandigarh sector data, (2) Overpass OSM live POI count, (3) NewsAPI sentiment
Output: 0–100 SafeScore + verdict + breakdown
"""

import os
import requests
from dotenv import load_dotenv
from chandigarh_sectors import get_time_adjusted_score, get_sector_from_coords

load_dotenv()

NEWS_API_KEY = os.getenv("NEWS_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


# ── 1. Overpass: Live POI count ───────────────────────────────────────────────

def get_poi_score(lat: float, lon: float, radius: int = 500) -> dict:
    """
    Queries OpenStreetMap via Overpass for shops, police, hospitals within radius.
    Returns a score contribution (0–25) and counts.
    """
    query = f"""
    [out:json][timeout:10];
    (
      node["shop"](around:{radius},{lat},{lon});
      node["amenity"="police"](around:{radius},{lat},{lon});
      node["amenity"="hospital"](around:{radius},{lat},{lon});
      node["amenity"="pharmacy"](around:{radius},{lat},{lon});
      node["amenity"="atm"](around:{radius},{lat},{lon});
    );
    out count;
    """
    try:
        resp = requests.post(
            "https://overpass-api.de/api/interpreter",
            data={"data": query},
            timeout=12
        )
        data = resp.json()
        total = data.get("elements", [{}])[0].get("tags", {}).get("total", 0)
        count = int(total)

        # Score: 0 POIs = 0, 20+ POIs = 25 (max contribution)
        poi_score = min(25, round((count / 20) * 25))
        return {"poi_count": count, "poi_score": poi_score}

    except Exception as e:
        return {"poi_count": 0, "poi_score": 10, "error": str(e)}  # neutral fallback


# ── 2. NewsAPI: Chandigarh sector sentiment ───────────────────────────────────

def get_news_sentiment(sector_name: str) -> dict:
    """
    Fetches recent Chandigarh news for a sector, scores with OpenAI.
    Returns a score contribution (0–25).
    """
    if not NEWS_API_KEY:
        return {"news_score": 12, "headlines": [], "error": "NEWS_API_KEY missing"}

    try:
        query = f"Chandigarh {sector_name} safety crime police incident"
        url = f"https://newsapi.org/v2/everything?q={query}&language=en&pageSize=5&sortBy=publishedAt&apiKey={NEWS_API_KEY}"
        resp = requests.get(url, timeout=10)
        articles = resp.json().get("articles", [])
        headlines = [a["title"] for a in articles if a.get("title")]

        if not headlines:
            return {"news_score": 15, "headlines": [], "note": "No recent news — neutral score"}

        # Score with OpenAI
        if OPENAI_API_KEY:
            news_score = score_headlines_with_ai(headlines, sector_name)
        else:
            # Simple keyword fallback if no OpenAI key
            news_score = keyword_sentiment(headlines)

        return {"news_score": news_score, "headlines": headlines[:3]}

    except Exception as e:
        return {"news_score": 12, "headlines": [], "error": str(e)}


def score_headlines_with_ai(headlines: list, sector: str) -> int:
    """Uses GPT-4o-mini to score headlines for urban safety. Returns 0–25."""
    import json

    headlines_text = "\n".join(f"- {h}" for h in headlines)
    prompt = f"""You are an urban safety analyst for Chandigarh, India.
Rate these recent news headlines about {sector} on a safety scale from 0 to 25:
- 0 = extremely unsafe (multiple crimes, riots, serious incidents)
- 12 = neutral (no relevant safety news)
- 25 = very safe (police deployment, infrastructure improvements, zero incidents)

Headlines:
{headlines_text}

Respond with ONLY a JSON object: {{"score": <number>, "reason": "<one sentence>"}}"""

    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 80,
                "temperature": 0.1
            },
            timeout=10
        )
        content = resp.json()["choices"][0]["message"]["content"]
        result = json.loads(content)
        return max(0, min(25, int(result.get("score", 12))))
    except:
        return 12  # neutral fallback


def keyword_sentiment(headlines: list) -> int:
    """Simple keyword fallback when OpenAI is unavailable."""
    negative = ["crime", "robbery", "theft", "murder", "rape", "accident", "assault", "arrested", "incident"]
    positive = ["safe", "patrolling", "cctv", "lights", "improved", "security", "deployed", "clean"]

    text = " ".join(headlines).lower()
    neg_count = sum(1 for w in negative if w in text)
    pos_count = sum(1 for w in positive if w in text)

    score = 12 + (pos_count * 3) - (neg_count * 4)
    return max(0, min(25, score))


# ── 3. Master Score Calculator ────────────────────────────────────────────────

def calculate_safe_score(lat: float, lon: float) -> dict:
    """
    Master function. Returns final SafeScore (0–100) with full breakdown.
    
    Weights:
      - Sector knowledge (Chandigarh data):  50 points max
      - Live POI density (Overpass OSM):     25 points max
      - News sentiment (NewsAPI + OpenAI):   25 points max
    """
    sector_key = get_sector_from_coords(lat, lon)
    sector_data = get_time_adjusted_score(sector_key)

    # Layer 1: Sector score (max 50)
    sector_contribution = round((sector_data["score"] / 100) * 50)

    # Layer 2: POI density (max 25)
    poi_data = get_poi_score(lat, lon)

    # Layer 3: News sentiment (max 25)
    sector_name = sector_data.get("sector", "Chandigarh")
    news_data = get_news_sentiment(sector_name)

    final_score = sector_contribution + poi_data["poi_score"] + news_data["news_score"]
    final_score = max(0, min(100, final_score))

    # Verdict
    if final_score >= 75:
        verdict = "Safe"
        color = "green"
    elif final_score >= 50:
        verdict = "Moderate"
        color = "yellow"
    else:
        verdict = "Caution"
        color = "red"

    return {
        "safe_score": final_score,
        "verdict": verdict,
        "color": color,
        "sector": sector_data.get("sector"),
        "sector_type": sector_data.get("type"),
        "is_night": sector_data.get("is_night"),
        "notes": sector_data.get("notes"),
        "breakdown": {
            "sector_score": sector_contribution,
            "poi_score": poi_data["poi_score"],
            "news_score": news_data["news_score"],
            "poi_count": poi_data["poi_count"],
            "headlines": news_data.get("headlines", []),
        }
    }