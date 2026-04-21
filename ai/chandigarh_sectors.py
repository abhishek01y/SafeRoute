"""
Chandigarh Sector Dataset
Core static knowledge base. Drives baseline scoring before live API data layers on top.
Every sector classified by type, baseline safety, night penalty, and key landmarks.
"""

SECTORS = {
    # ── Commercial / High Activity ──────────────────────────────────────────
    "sector_17": {
        "name": "Sector 17",
        "type": "commercial",
        "baseline_score": 85,
        "night_penalty": 5,        # Very active even at night
        "landmarks": ["Sector 17 Plaza", "ISBT 17", "High Court"],
        "main_roads": ["Jan Marg", "Madhya Marg"],
        "notes": "City centre. Highest foot traffic. Police post at plaza."
    },
    "sector_22": {
        "name": "Sector 22",
        "type": "commercial",
        "baseline_score": 80,
        "night_penalty": 8,
        "landmarks": ["Sector 22 Market", "Bus Stand"],
        "main_roads": ["Himalaya Marg", "Jan Marg"],
        "notes": "Dense market. Active till late night."
    },
    "sector_35": {
        "name": "Sector 35",
        "type": "commercial",
        "baseline_score": 78,
        "night_penalty": 10,
        "landmarks": ["Sector 35 Market", "PGIMER nearby"],
        "main_roads": ["Dakshin Marg"],
        "notes": "Known medical zone. PGIMER proximity keeps activity high."
    },

    # ── Residential / Mixed ──────────────────────────────────────────────────
    "sector_7": {
        "name": "Sector 7",
        "type": "residential",
        "baseline_score": 70,
        "night_penalty": 20,
        "landmarks": ["Government Multi Specialty Hospital"],
        "main_roads": ["Madhya Marg"],
        "notes": "Residential. Hospital boosts safety. Quieter at night."
    },
    "sector_8": {
        "name": "Sector 8",
        "type": "residential",
        "baseline_score": 68,
        "night_penalty": 22,
        "landmarks": [],
        "main_roads": ["Himalaya Marg"],
        "notes": "Mostly residential. Low night activity."
    },
    "sector_9": {
        "name": "Sector 9",
        "type": "residential",
        "baseline_score": 72,
        "night_penalty": 18,
        "landmarks": ["Rose Garden"],
        "main_roads": ["Jan Marg"],
        "notes": "Residential. Rose Garden park area — avoid internal lanes at night."
    },
    "sector_10": {
        "name": "Sector 10",
        "type": "residential",
        "baseline_score": 74,
        "night_penalty": 15,
        "landmarks": ["Chandigarh Museum", "Art Gallery"],
        "main_roads": ["Jan Marg"],
        "notes": "Cultural zone. Well-lit main road."
    },
    "sector_11": {
        "name": "Sector 11",
        "type": "residential",
        "baseline_score": 73,
        "night_penalty": 17,
        "landmarks": [],
        "main_roads": ["Madhya Marg"],
        "notes": "Standard residential."
    },
    "sector_14": {
        "name": "Sector 14",
        "type": "institutional",
        "baseline_score": 76,
        "night_penalty": 25,
        "landmarks": ["Panjab University"],
        "main_roads": ["Jan Marg"],
        "notes": "University zone. Active in day, very quiet at night."
    },
    "sector_15": {
        "name": "Sector 15",
        "type": "residential",
        "baseline_score": 69,
        "night_penalty": 20,
        "landmarks": [],
        "main_roads": ["Himalaya Marg"],
        "notes": "Residential sector."
    },
    "sector_20": {
        "name": "Sector 20",
        "type": "residential",
        "baseline_score": 65,
        "night_penalty": 25,
        "landmarks": [],
        "main_roads": ["Dakshin Marg"],
        "notes": "Mix of residential and light commercial."
    },
    "sector_21": {
        "name": "Sector 21",
        "type": "residential",
        "baseline_score": 67,
        "night_penalty": 22,
        "landmarks": [],
        "main_roads": ["Himalaya Marg", "Dakshin Marg"],
        "notes": "Residential. Decent road connectivity."
    },

    # ── Green Belts / Parks / Caution Zones ──────────────────────────────────
    "sukhna_lake": {
        "name": "Sukhna Lake",
        "type": "green_belt",
        "baseline_score": 80,
        "night_penalty": 50,   # Very unsafe after dark
        "landmarks": ["Sukhna Lake", "Sukhna Wildlife Sanctuary"],
        "main_roads": ["Sukhna Path"],
        "notes": "Safe haven in daytime. AVOID surrounding forest paths at night."
    },
    "sector_1": {
        "name": "Sector 1 (Capitol Complex)",
        "type": "institutional",
        "baseline_score": 75,
        "night_penalty": 40,
        "landmarks": ["Secretariat", "Vidhan Sabha", "High Court"],
        "main_roads": ["Capitol Marg"],
        "notes": "Government zone. Heavy security in day. Deserted at night."
    },
    "rock_garden": {
        "name": "Rock Garden Area",
        "type": "green_belt",
        "baseline_score": 78,
        "night_penalty": 45,
        "landmarks": ["Rock Garden", "Nek Chand"],
        "main_roads": ["Museum Road"],
        "notes": "Tourist spot. Safe in day. Closed + dark at night."
    },

    # ── Industrial / Lower Safety ────────────────────────────────────────────
    "sector_31": {
        "name": "Sector 31",
        "type": "industrial",
        "baseline_score": 55,
        "night_penalty": 30,
        "landmarks": ["Industrial Area"],
        "main_roads": ["Dakshin Marg"],
        "notes": "Industrial area. Fewer people, lower lighting."
    },
    "sector_32": {
        "name": "Sector 32",
        "type": "mixed",
        "baseline_score": 70,
        "night_penalty": 20,
        "landmarks": ["PGIMER Hospital"],
        "main_roads": ["Vikas Marg"],
        "notes": "PGIMER boosts 24/7 activity. Hospital zone = safer."
    },
    "sector_43": {
        "name": "Sector 43",
        "type": "mixed",
        "baseline_score": 72,
        "night_penalty": 18,
        "landmarks": ["ISBT 43", "Tribune Chowk"],
        "main_roads": ["Madhya Marg", "Purv Marg"],
        "notes": "Bus terminal keeps it active. Tribune Chowk is busy."
    },

    # ── V-Roads (Chandigarh's main arteries — always higher safety) ──────────
    "jan_marg": {
        "name": "Jan Marg (V2)",
        "type": "v_road",
        "baseline_score": 90,
        "night_penalty": 5,
        "landmarks": [],
        "main_roads": ["Jan Marg"],
        "notes": "Best-lit road. Police patrolling. Prefer this always."
    },
    "madhya_marg": {
        "name": "Madhya Marg (V3)",
        "type": "v_road",
        "baseline_score": 88,
        "night_penalty": 6,
        "landmarks": [],
        "main_roads": ["Madhya Marg"],
        "notes": "Central artery. Well-lit, high traffic."
    },
    "himalaya_marg": {
        "name": "Himalaya Marg (V4)",
        "type": "v_road",
        "baseline_score": 85,
        "night_penalty": 8,
        "landmarks": [],
        "main_roads": ["Himalaya Marg"],
        "notes": "North-south connector. Good lighting."
    },
    "dakshin_marg": {
        "name": "Dakshin Marg (V5)",
        "type": "v_road",
        "baseline_score": 83,
        "night_penalty": 10,
        "landmarks": [],
        "main_roads": ["Dakshin Marg"],
        "notes": "Southern artery. Active commercial stretches."
    },
}

# Type-level baseline multipliers
TYPE_MULTIPLIERS = {
    "commercial":    1.0,
    "v_road":        1.0,
    "institutional": 0.9,
    "residential":   0.85,
    "mixed":         0.88,
    "green_belt":    0.75,
    "industrial":    0.70,
}

# Bonus for 24/7 landmarks (hospitals, bus stands, etc.)
SAFE_HAVEN_BONUS = 8
SAFE_HAVENS = [
    "PGIMER", "Government Multi Specialty Hospital", "ISBT 17", "ISBT 43",
    "Police Post", "Police Station"
]

import datetime

def get_time_adjusted_score(sector_key: str) -> dict:
    """
    Returns the safety score for a sector adjusted for current time of day.
    Night = 8 PM to 6 AM.
    """
    sector = SECTORS.get(sector_key)
    if not sector:
        return {"error": f"Sector '{sector_key}' not found", "score": 50}

    hour = datetime.datetime.now().hour
    is_night = hour >= 20 or hour < 6

    base = sector["baseline_score"]
    multiplier = TYPE_MULTIPLIERS.get(sector["type"], 0.85)
    score = base * multiplier

    if is_night:
        score -= sector["night_penalty"]

    # Safe haven bonus
    for haven in SAFE_HAVENS:
        if any(haven.lower() in lm.lower() for lm in sector["landmarks"]):
            score += SAFE_HAVEN_BONUS
            break

    score = max(0, min(100, round(score)))

    return {
        "sector": sector["name"],
        "type": sector["type"],
        "score": score,
        "is_night": is_night,
        "night_penalty_applied": sector["night_penalty"] if is_night else 0,
        "notes": sector["notes"],
        "main_roads": sector["main_roads"],
    }


def get_sector_from_coords(lat: float, lon: float) -> str:
    """
    Approximate sector lookup from coordinates.
    Chandigarh grid: lat 30.68-30.78, lon 76.74-76.84
    Each sector ~0.008 deg wide.
    Returns closest sector key.
    """
    # Rough bounding boxes for key sectors (lat_min, lat_max, lon_min, lon_max)
    SECTOR_BOUNDS = {
        "sector_17": (30.738, 30.748, 76.778, 76.792),
        "sector_22": (30.728, 30.738, 76.778, 76.792),
        "sector_35": (30.718, 30.728, 76.778, 76.792),
        "sector_14": (30.758, 30.768, 76.778, 76.792),
        "sector_9":  (30.748, 30.758, 76.778, 76.792),
        "sector_10": (30.758, 30.768, 76.764, 76.778),
        "sector_15": (30.718, 30.728, 76.764, 76.778),
        "sector_21": (30.708, 30.718, 76.778, 76.792),
        "sector_43": (30.698, 30.710, 76.792, 76.810),
        "sector_32": (30.718, 30.730, 76.792, 76.810),
        "sector_31": (30.698, 30.710, 76.810, 76.830),
        "sukhna_lake": (30.750, 30.768, 76.810, 76.840),
        "rock_garden": (30.748, 30.758, 76.800, 76.815),
        "sector_1":  (30.763, 30.778, 76.800, 76.820),
    }

    for key, (lat_min, lat_max, lon_min, lon_max) in SECTOR_BOUNDS.items():
        if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max:
            return key

    # Default fallback
    return "sector_17"


def get_all_sector_scores() -> list:
    """Returns time-adjusted scores for all sectors. Used to render heatmap."""
    results = []
    for key in SECTORS:
        data = get_time_adjusted_score(key)
        data["sector_key"] = key
        results.append(data)
    return results