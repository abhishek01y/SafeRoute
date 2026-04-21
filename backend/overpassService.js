/**
 * overpassService.js
 * Node.js wrapper for Overpass API (OpenStreetMap).
 * Counts shops, police stations, hospitals near a coordinate.
 * No API key required.
 */

const axios = require("axios");

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Safety weight per POI type
const POI_WEIGHTS = {
    police: 8,
    hospital: 6,
    pharmacy: 4,
    fire_station: 5,
    restaurant: 3,
    cafe: 3,
    shop: 3,
    bank: 2,
    atm: 2,
    supermarket: 4,
};


/**
 * Query Overpass for all safety-relevant POIs within radius of a point.
 * @param {number} lat
 * @param {number} lon
 * @param {number} radius - metres (default 500)
 * @returns {Promise<Object>} - { poi_score, poi_count, breakdown, highlights }
 */
async function getPOIScore(lat, lon, radius = 500) {
    const query = `
    [out:json][timeout:12];
    (
      node["amenity"="police"](around:${radius},${lat},${lon});
      node["amenity"="hospital"](around:${radius},${lat},${lon});
      node["amenity"="pharmacy"](around:${radius},${lat},${lon});
      node["amenity"="fire_station"](around:${radius},${lat},${lon});
      node["amenity"="restaurant"](around:${radius},${lat},${lon});
      node["amenity"="cafe"](around:${radius},${lat},${lon});
      node["amenity"="bank"](around:${radius},${lat},${lon});
      node["amenity"="atm"](around:${radius},${lat},${lon});
      node["shop"](around:${radius},${lat},${lon});
    );
    out body;
  `;

    try {
        const resp = await axios.post(
            OVERPASS_URL,
            new URLSearchParams({ data: query }),
            { timeout: 14000, headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        const elements = resp.data?.elements || [];
        return scoreElements(elements);

    } catch (err) {
        console.error("[overpassService] Error:", err.message);
        // Return neutral fallback — don't crash the whole scoring pipeline
        return { poi_score: 10, poi_count: 0, breakdown: {}, highlights: [], error: err.message };
    }
}


/**
 * Parse raw Overpass elements into weighted score.
 */
function scoreElements(elements) {
    const counts = {};

    for (const el of elements) {
        const tags = el.tags || {};
        const amenity = tags.amenity || "";
        const shop = tags.shop || "";

        if (amenity && POI_WEIGHTS[amenity] !== undefined) {
            counts[amenity] = (counts[amenity] || 0) + 1;
        } else if (shop) {
            const key = shop === "supermarket" ? "supermarket" : "shop";
            counts[key] = (counts[key] || 0) + 1;
        }
    }

    // Weighted score with diminishing returns
    let weighted = 0;
    for (const [category, count] of Object.entries(counts)) {
        const weight = POI_WEIGHTS[category] || 1;
        const effective = Math.min(count, 3) + Math.max(0, count - 3) * 0.5;
        weighted += effective * weight;
    }

    // Normalize to 0–25
    const poi_score = Math.min(25, Math.round((weighted / 60) * 25));
    const poi_count = Object.values(counts).reduce((a, b) => a + b, 0);

    // Highlights for UI
    const highlights = [];
    if (counts.police > 0) highlights.push(`🚓 ${counts.police} police post nearby`);
    if (counts.hospital > 0) highlights.push(`🏥 Hospital within ${500}m`);
    if (counts.pharmacy > 0) highlights.push(`💊 Pharmacy nearby`);
    const shopTotal = (counts.shop || 0) + (counts.restaurant || 0) + (counts.cafe || 0);
    if (shopTotal > 5) highlights.push(`🏪 ${shopTotal} active shops/restaurants`);

    return {
        poi_score,
        poi_count,
        breakdown: counts,
        highlights,
    };
}


/**
 * Lightweight version — just returns a count total.
 * Useful for quick checks without full scoring.
 */
async function countPOIsNearPoint(lat, lon, radius = 300) {
    const result = await getPOIScore(lat, lon, radius);
    return result.poi_count;
}


module.exports = { getPOIScore, countPOIsNearPoint };