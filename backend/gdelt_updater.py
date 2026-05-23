import httpx
import asyncio
import json
import re
from datetime import datetime, timedelta
from math import radians, sin, cos, sqrt, atan2
import random

DELHI_BBOX = {
    "min_lat": 28.40, "max_lat": 28.90,
    "min_lon": 76.80, "max_lon": 77.35
}

CRIME_KEYWORDS = [
    "crime", "robbery", "theft", "assault", "molestation", "protest",
    "riot", "murder", "snatching", "accident", "violence", "rape",
    "harassment", "attack", "burglary", "dacoity", "kidnapping",
    "drug", "smuggling", "curfew", "clash", "unrest"
]

DELHI_KEYWORDS = ["delhi", "new delhi", "national capital territory", "south delhi", "north delhi"]


async def fetch_gdelt_news():
    try:
        query = '(".crime" OR "protest" OR "robbery" OR "assault" OR "accident" OR "violence") location:"Delhi"'
        url = (
            "https://api.gdeltproject.org/api/v2/doc/doc"
            f"?query={query}"
            "&mode=ArtList"
            "&format=JSON"
            "&timespan=24h"
            "&maxrecords=50"
            "&sort=DateDesc"
        )

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                print(f"[GDELT] HTTP {resp.status_code}")
                return []

            data = resp.json()
            articles = data.get("articles", data.get("results", []))
            if not articles:
                articles = data.get("@graph", [{}])[0].get("results", []) if "@graph" in data else []

            parsed = []
            for article in articles[:30]:
                title = article.get("title", "") or article.get("title", "")
                snippet = article.get("snippet", "") or article.get("summary", "")
                text = (title + " " + snippet).lower()

                matched_keywords = [kw for kw in CRIME_KEYWORDS if kw in text]
                if not matched_keywords:
                    continue

                lat = None
                lon = None
                if "lat" in article and "lon" in article:
                    try:
                        lat = float(article["lat"])
                        lon = float(article["lon"])
                    except (ValueError, TypeError):
                        pass

                if lat is None and "geometry" in article:
                    try:
                        coords = article["geometry"].get("coordinates", [])
                        if len(coords) >= 2:
                            lon, lat = float(coords[0]), float(coords[1])
                    except (ValueError, TypeError, AttributeError):
                        pass

                bert_severity = None
                try:
                    from bert_analyzer import compute_bert_severity
                    bert_severity = compute_bert_severity(title, snippet)
                except Exception:
                    pass

                severity_multiplier = 1.0
                if bert_severity is not None:
                    severity_multiplier = bert_severity / 30.0
                else:
                    high_severity = ["murder", "rape", "assault", "molestation", "riot", "violence"]
                    medium_severity = ["robbery", "theft", "snatching", "attack", "kidnapping"]
                    if any(kw in text for kw in high_severity):
                        severity_multiplier = 2.0
                    elif any(kw in text for kw in medium_severity):
                        severity_multiplier = 1.5

                if lat is None or lon is None:
                    lat = random.uniform(DELHI_BBOX["min_lat"], DELHI_BBOX["max_lat"])
                    lon = random.uniform(DELHI_BBOX["min_lon"], DELHI_BBOX["max_lon"])

                if DELHI_BBOX["min_lat"] <= lat <= DELHI_BBOX["max_lat"] and \
                   DELHI_BBOX["min_lon"] <= lon <= DELHI_BBOX["max_lon"]:
                    parsed.append({
                        "lat": lat,
                        "lon": lon,
                        "matched_keywords": matched_keywords,
                        "severity": min(100, 30 * severity_multiplier + len(matched_keywords) * 10),
                        "title": title,
                        "timestamp": datetime.now().isoformat()
                    })

            print(f"[GDELT] Fetched {len(parsed)} Delhi-relevant news items")
            return parsed

    except httpx.TimeoutException:
        print("[GDELT] Request timed out")
        return []
    except Exception as e:
        print(f"[GDELT] Error: {e}")
        return []


async def update_safety_scores_from_news(safety_engine, G, router):
    news_items = await fetch_gdelt_news()
    if not news_items:
        return False

    safety_engine.gdelt_cache.clear()
    for item in news_items:
        item_id = f"gdelt_{hash(item['title'] + str(item['timestamp']))}"
        safety_engine.gdelt_cache[item_id] = item

    updated_count = 0
    for u, v, data in G.edges(data=True):
        if not data:
            continue

        mid_lat = (u[0] + v[0]) / 2
        mid_lon = (u[1] + v[1]) / 2

        ai_risk = safety_engine.compute_ai_sentiment_risk(mid_lat, mid_lon, news_items)
        data['ai_sentiment'] = ai_risk

        old_score = data.get('safety_score', 50)
        P = data.get('poi_density', 50)
        C = data.get('crime_risk', 20)
        L = data.get('lighting_score', 50)
        F = data.get('footfall', 40)
        U = data.get('crowdsourced_risk', 5)

        new_score = safety_engine.compute_safety_score({
            'poi_density': P, 'crime_risk': C,
            'lighting_score': L, 'footfall': F,
            'ai_sentiment': ai_risk, 'crowdsourced_risk': U
        })

        if abs(new_score - old_score) > 0.5:
            data['safety_score'] = round(new_score, 1)
            updated_count += 1

    print(f"[GDELT] Updated {updated_count} edges with new safety scores")
    return True
