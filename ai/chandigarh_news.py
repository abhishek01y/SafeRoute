"""
Chandigarh News Fetcher
Fetches hyperlocal news for specific Chandigarh sectors using NewsAPI + GDELT.
Called by safety_scorer.py to get the news sentiment layer.
"""

import os
import requests
from dotenv import load_dotenv

load_dotenv()
NEWS_API_KEY = os.getenv("NEWS_API_KEY")

# Sector-specific search keywords
# Each sector has tailored keywords so we get relevant local news, not generic Chandigarh news
SECTOR_KEYWORDS = {
    "Sector 17":    ["Sector 17 Chandigarh", "Chandigarh Plaza", "ISBT 17"],
    "Sector 22":    ["Sector 22 Chandigarh market", "Sector 22 crime"],
    "Sector 35":    ["Sector 35 Chandigarh", "PGIMER Chandigarh"],
    "Sector 43":    ["ISBT 43 Chandigarh", "Sector 43 Chandigarh", "Tribune Chowk"],
    "Sector 31":    ["Sector 31 industrial Chandigarh", "industrial area Chandigarh crime"],
    "Sukhna Lake":  ["Sukhna Lake safety", "Sukhna Lake incident", "Sukhna wildlife"],
    "Rock Garden":  ["Rock Garden Chandigarh", "Nek Chand Chandigarh"],
    "Jan Marg":     ["Jan Marg Chandigarh", "Chandigarh V2 road"],
    "Madhya Marg":  ["Madhya Marg Chandigarh", "Chandigarh V3"],
}

# Generic fallback keywords if sector not in map
GENERIC_KEYWORDS = ["Chandigarh crime", "Chandigarh police", "Chandigarh safety", "Chandigarh incident"]

# Words that push score DOWN
NEGATIVE_WORDS = [
    "murder", "robbery", "theft", "snatching", "assault", "rape", "arrested",
    "accident", "incident", "fire", "crime", "loot", "attack", "killed",
    "missing", "abduct", "shoot", "stabbed", "dark", "power cut", "blackout"
]

# Words that push score UP
POSITIVE_WORDS = [
    "safe", "patrolling", "cctv", "installed", "security", "deployed",
    "police post", "lights", "improved", "clean", "smart city", "surveillance",
    "pcr", "beat", "nabbed", "arrested accused", "crackdown"
]


def fetch_sector_news(sector_name: str, max_articles: int = 5) -> list:
    """
    Fetches recent news articles for a given Chandigarh sector.
    Returns list of headline strings.
    """
    if not NEWS_API_KEY:
        return []

    keywords = SECTOR_KEYWORDS.get(sector_name, GENERIC_KEYWORDS)
    query = " OR ".join(f'"{kw}"' for kw in keywords[:2])  # Use top 2 keywords

    try:
        url = (
            f"https://newsapi.org/v2/everything"
            f"?q={requests.utils.quote(query)}"
            f"&language=en"
            f"&sortBy=publishedAt"
            f"&pageSize={max_articles}"
            f"&apiKey={NEWS_API_KEY}"
        )
        resp = requests.get(url, timeout=10)
        data = resp.json()

        if data.get("status") != "ok":
            return []

        articles = data.get("articles", [])
        headlines = [
            a["title"] for a in articles
            if a.get("title") and "[Removed]" not in a.get("title", "")
        ]
        return headlines[:max_articles]

    except Exception as e:
        print(f"[chandigarh_news] NewsAPI error for {sector_name}: {e}")
        return []


def fetch_gdelt_news(lat: float, lon: float) -> list:
    """
    Fetches news from GDELT API for a specific lat/lon in Chandigarh.
    GDELT is free and requires no API key.
    Returns list of headline strings.
    """
    try:
        # GDELT 2.0 Doc API — search near coordinates
        query = f"Chandigarh+safety+crime+police"
        url = (
            f"https://api.gdeltproject.org/api/v2/doc/doc"
            f"?query={query}"
            f"&mode=artlist"
            f"&maxrecords=5"
            f"&format=json"
            f"&timespan=1d"  # Last 24 hours
        )
        resp = requests.get(url, timeout=8)
        data = resp.json()

        articles = data.get("articles", [])
        headlines = [a.get("title", "") for a in articles if a.get("title")]
        return headlines[:5]

    except Exception as e:
        print(f"[chandigarh_news] GDELT error: {e}")
        return []


def score_headlines(headlines: list) -> dict:
    """
    Simple keyword-based sentiment scorer.
    Used as fallback when OpenAI key is not available.
    Returns score (0–25) and matched keywords.
    """
    if not headlines:
        return {"score": 12, "reason": "No news found — neutral score", "matched": []}

    text = " ".join(headlines).lower()

    neg_matches = [w for w in NEGATIVE_WORDS if w in text]
    pos_matches = [w for w in POSITIVE_WORDS if w in text]

    # Base: 12 (neutral), +3 per positive signal, -4 per negative signal
    score = 12 + (len(pos_matches) * 3) - (len(neg_matches) * 4)
    score = max(0, min(25, score))

    if neg_matches:
        reason = f"Negative signals detected: {', '.join(neg_matches[:3])}"
    elif pos_matches:
        reason = f"Positive signals: {', '.join(pos_matches[:3])}"
    else:
        reason = "No strong safety signals in recent news"

    return {
        "score": score,
        "reason": reason,
        "matched_negative": neg_matches[:5],
        "matched_positive": pos_matches[:5],
    }


def get_news_score_for_sector(sector_name: str, lat: float = None, lon: float = None) -> dict:
    """
    Master function. Combines NewsAPI + GDELT + keyword scoring.
    Returns: { score: 0-25, headlines: [...], reason: str }
    """
    # Try NewsAPI first
    headlines = fetch_sector_news(sector_name)

    # If NewsAPI returns nothing, try GDELT
    if not headlines and lat and lon:
        headlines = fetch_gdelt_news(lat, lon)

    # Score the headlines
    result = score_headlines(headlines)
    result["headlines"] = headlines[:3]
    result["source"] = "NewsAPI" if headlines else "no_news"

    return result


# ── Test ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    test_sectors = ["Sector 17", "Sector 31", "Sukhna Lake"]
    for s in test_sectors:
        r = get_news_score_for_sector(s)
        print(f"\n{s}: score={r['score']}/25 | {r['reason']}")
        for h in r.get("headlines", []):
            print(f"  - {h}")