import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Chandigarh bounding box (south, west, north, east)
CHD_BBOX = (30.65, 76.70, 30.82, 76.90)

# POI categories and their safety weight
POI_WEIGHTS = {
    "police":     8,   # Strongest safety signal
    "hospital":   6,
    "pharmacy":   4,
    "fire_station": 5,
    "shop":       3,   # Shops = active area = safer
    "restaurant": 3,
    "cafe":       3,
    "bank":       2,
    "atm":        2,
    "fuel":       2,
    "supermarket": 4,
}


def query_pois_near_point(lat: float, lon: float, radius: int = 500) -> dict:
    """
    Queries Overpass API for all relevant POIs within `radius` meters of lat/lon.
    Returns raw counts per category.
    """
    query = f"""
    [out:json][timeout:12];
    (
      node["amenity"="police"](around:{radius},{lat},{lon});
      node["amenity"="hospital"](around:{radius},{lat},{lon});
      node["amenity"="pharmacy"](around:{radius},{lat},{lon});
      node["amenity"="fire_station"](around:{radius},{lat},{lon});
      node["amenity"="restaurant"](around:{radius},{lat},{lon});
      node["amenity"="cafe"](around:{radius},{lat},{lon});
      node["amenity"="bank"](around:{radius},{lat},{lon});
      node["amenity"="atm"](around:{radius},{lat},{lon});
      node["amenity"="fuel"](around:{radius},{lat},{lon});
      node["shop"](around:{radius},{lat},{lon});
      node["shop"="supermarket"](around:{radius},{lat},{lon});
    );
    out body;
    """
    try:
        resp = requests.post(
            OVERPASS_URL,
            data={"data": query},
            timeout=14
        )
        resp.raise_for_status()
        elements = resp.json().get("elements", [])
        return parse_elements(elements)

    except requests.exceptions.Timeout:
        return {"error": "Overpass timeout", "counts": {}, "total": 0}
    except Exception as e:
        return {"error": str(e), "counts": {}, "total": 0}


def parse_elements(elements: list) -> dict:
    """Parses raw Overpass elements into counts per category."""
    counts = {cat: 0 for cat in POI_WEIGHTS}

    for el in elements:
        tags = el.get("tags", {})
        amenity = tags.get("amenity", "")
        shop    = tags.get("shop", "")

        if amenity in counts:
            counts[amenity] += 1
        elif amenity == "restaurant":
            counts["restaurant"] = counts.get("restaurant", 0) + 1
        elif amenity == "cafe":
            counts["cafe"] = counts.get("cafe", 0) + 1
        elif shop:
            counts["shop"] = counts.get("shop", 0) + 1
            if shop == "supermarket":
                counts["supermarket"] = counts.get("supermarket", 0) + 1

    total = sum(counts.values())
    return {"counts": counts, "total": total}


def calculate_poi_score(lat: float, lon: float, radius: int = 500) -> dict:
    """
    Master function for POI scoring.
    Returns:
      - poi_score: 0–25 (contribution to final SafeScore)
      - poi_count: total POIs found
      - breakdown: per-category counts
      - highlights: notable POIs found (e.g. "Police station nearby")
    """
    result = query_pois_near_point(lat, lon, radius)

    if "error" in result and result["total"] == 0:
        # Overpass failed — return neutral score
        return {
            "poi_score": 10,
            "poi_count": 0,
            "breakdown": {},
            "highlights": [],
            "error": result.get("error")
        }

    counts = result["counts"]
    total  = result["total"]

    # Weighted score calculation
    weighted = 0
    for category, count in counts.items():
        weight = POI_WEIGHTS.get(category, 1)
        # Diminishing returns: first 3 of same type count fully, rest at half
        effective = min(count, 3) + max(0, count - 3) * 0.5
        weighted += effective * weight

    # Normalize to 0–25
    # A "perfect" zone (police + hospital + 10 shops) scores ~60 weighted units
    poi_score = min(25, round((weighted / 60) * 25))

    # Highlights for UI display
    highlights = []
    if counts.get("police", 0) > 0:
        highlights.append(f"🚓 {counts['police']} police post nearby")
    if counts.get("hospital", 0) > 0:
        highlights.append(f"🏥 Hospital within {radius}m")
    if counts.get("pharmacy", 0) > 0:
        highlights.append(f"💊 Pharmacy nearby")
    shop_total = counts.get("shop", 0) + counts.get("restaurant", 0) + counts.get("cafe", 0)
    if shop_total > 5:
        highlights.append(f"🏪 {shop_total} active shops/restaurants")

    return {
        "poi_score": poi_score,
        "poi_count": total,
        "breakdown": {k: v for k, v in counts.items() if v > 0},
        "highlights": highlights,
    }


def check_street_lighting(lat: float, lon: float, radius: int = 300) -> dict:
    """
    Checks OSM for street lighting tags near a coordinate.
    Roads tagged lit=yes contribute to safety.
    """
    query = f"""
    [out:json][timeout:8];
    (
      way["highway"]["lit"="yes"](around:{radius},{lat},{lon});
      way["highway"]["lit"="no"](around:{radius},{lat},{lon});
    );
    out tags;
    """
    try:
        resp = requests.post(OVERPASS_URL, data={"data": query}, timeout=10)
        elements = resp.json().get("elements", [])

        lit     = sum(1 for e in elements if e.get("tags", {}).get("lit") == "yes")
        not_lit = sum(1 for e in elements if e.get("tags", {}).get("lit") == "no")
        total   = lit + not_lit

        if total == 0:
            return {"lighting_ratio": 0.5, "lit": 0, "unlit": 0, "note": "No lighting data"}

        ratio = lit / total
        return {
            "lighting_ratio": round(ratio, 2),
            "lit": lit,
            "unlit": not_lit,
            "note": f"{round(ratio*100)}% roads lit in this area"
        }

    except Exception as e:
        return {"lighting_ratio": 0.5, "error": str(e)}


def get_full_infrastructure_score(lat: float, lon: float) -> dict:
    """
    Combines POI score + street lighting for a complete infrastructure picture.
    """
    poi_data      = calculate_poi_score(lat, lon, radius=500)
    lighting_data = check_street_lighting(lat, lon, radius=300)

    # Bonus/penalty from lighting
    lighting_bonus = 0
    ratio = lighting_data.get("lighting_ratio", 0.5)
    if ratio > 0.7:
        lighting_bonus = 3
    elif ratio < 0.3:
        lighting_bonus = -4

    adjusted_poi_score = max(0, min(25, poi_data["poi_score"] + lighting_bonus))

    return {
        "poi_score":    adjusted_poi_score,
        "poi_count":    poi_data["poi_count"],
        "breakdown":    poi_data["breakdown"],
        "highlights":   poi_data["highlights"],
        "lighting":     lighting_data,
    }


# ── Test ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Sector 17 Chandigarh coords
    test_lat, test_lon = 30.7412, 76.7843
    print(f"Testing POI score for Sector 17 ({test_lat}, {test_lon})...")
    result = get_full_infrastructure_score(test_lat, test_lon)
    print(f"POI Score: {result['poi_score']}/25")
    print(f"Total POIs found: {result['poi_count']}")
    print(f"Breakdown: {result['breakdown']}")
    print(f"Highlights: {result['highlights']}")
    print(f"Lighting: {result['lighting']}")