const express = require("express");
const axios = require("axios");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const AI_SERVICE = process.env.AI_SERVICE_URL || "http://localhost:8000";

// ── POST /api/safety-score ─────────────────────────────────────────────────
// Main endpoint. Frontend calls this with a lat/lon.
// Returns combined SafeScore from all 3 layers.
router.post("/safety-score", async (req, res) => {
  const { lat, lon } = req.body;

  if (!lat || !lon) {
    return res.status(400).json({ error: "lat and lon required" });
  }

  try {
    // Layer 1+2: Python AI engine (sector data + news + POI)
    const aiResponse = await axios.post(`${AI_SERVICE}/score`, { lat, lon }, { timeout: 15000 });
    const aiScore = aiResponse.data;

    // Layer 3: Supabase community reports within 500m
    const communityData = await getCommunityReports(lat, lon);

    // Merge community reports into final score
    const communityAdjustment = calculateCommunityAdjustment(communityData.reports);
    const finalScore = Math.max(0, Math.min(100, aiScore.safe_score + communityAdjustment));

    const verdict = finalScore >= 75 ? "Safe" : finalScore >= 50 ? "Moderate" : "Caution";
    const color = finalScore >= 75 ? "green" : finalScore >= 50 ? "yellow" : "red";

    return res.json({
      safe_score: finalScore,
      verdict,
      color,
      sector: aiScore.sector,
      sector_type: aiScore.sector_type,
      is_night: aiScore.is_night,
      notes: aiScore.notes,
      breakdown: {
        ...aiScore.breakdown,
        community_adjustment: communityAdjustment,
        community_report_count: communityData.reports.length,
        recent_reports: communityData.reports.slice(0, 3),
      }
    });

  } catch (err) {
    console.error("Safety score error:", err.message);
    return res.status(500).json({ error: "Score calculation failed", detail: err.message });
  }
});


// ── POST /api/report ───────────────────────────────────────────────────────
// User submits a safety report from the map.
router.post("/report", async (req, res) => {
  const { lat, lon, safety_type, description, sector } = req.body;

  if (!lat || !lon || !safety_type) {
    return res.status(400).json({ error: "lat, lon, safety_type required" });
  }

  const { data, error } = await supabase
    .from("reports")
    .insert([{ lat, lon, safety_type, description: description || null, sector: sector || null }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true, report: data[0] });
});


// POST /api/alert
// Sends or simulates an emergency alert with the user's latest location.
router.post("/alert", async (req, res) => {
  const { contacts = [], location, reason = "Safety alert", route } = req.body;

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: "At least one emergency contact is required" });
  }

  if (!location?.lat || !location?.lon) {
    return res.status(400).json({ error: "Current location is required" });
  }

  const recipients = contacts
    .map((contact) => normalizePhoneNumber(contact.phone))
    .filter(Boolean);

  if (!recipients.length) {
    return res.status(400).json({ error: "Contact phone numbers are required" });
  }

  const invalidRecipient = recipients.find((phone) => !/^\+\d{8,15}$/.test(phone));
  if (invalidRecipient) {
    return res.status(400).json({
      error: "Invalid phone number",
      detail: `Use international format with +country code, for example +91XXXXXXXXXX. Invalid: ${invalidRecipient}`,
    });
  }

  const mapLink = `https://maps.google.com/?q=${location.lat},${location.lon}`;
  const routeText = route?.from && route?.to
    ? ` Route: ${route.from.lat.toFixed(5)},${route.from.lon.toFixed(5)} to ${route.to.lat.toFixed(5)},${route.to.lon.toFixed(5)}.`
    : "";
  const message = `SafeRoute alert: ${reason}. Last location: ${mapLink}.${routeText}`;

  try {
    const result = await sendSmsAlerts(recipients, message);
    return res.json({
      success: true,
      mode: result.mode,
      sent_count: result.sentCount,
      recipients: recipients.length,
      map_link: mapLink,
    });
  } catch (err) {
    console.error("Alert send error:", err.message);
    return res.status(500).json({ error: "Alert failed", detail: err.message });
  }
});


// ── GET /api/reports ───────────────────────────────────────────────────────
// Returns all reports for map pins display.
router.get("/reports", async (req, res) => {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ reports: data });
});


// ── GET /api/heatmap ───────────────────────────────────────────────────────
// Returns sector-level scores for heatmap rendering.
router.get("/heatmap", async (req, res) => {
  try {
    const response = await axios.get(`${AI_SERVICE}/heatmap`, { timeout: 10000 });
    return res.json(response.data);
  } catch (err) {
    return res.status(500).json({ error: "Heatmap fetch failed" });
  }
});


// ── Helpers ────────────────────────────────────────────────────────────────

async function getCommunityReports(lat, lon) {
  // Fetch reports within ~500m (rough lat/lon delta)
  const delta = 0.005;
  const { data, error } = await supabase
    .from("reports")
    .select("safety_type, description, created_at")
    .gte("lat", lat - delta)
    .lte("lat", lat + delta)
    .gte("lon", lon - delta)
    .lte("lon", lon + delta)
    .order("created_at", { ascending: false })
    .limit(20);

  return { reports: error ? [] : data };
}

function calculateCommunityAdjustment(reports) {
  if (!reports.length) return 0;

  const weights = {
    "safe": +5,
    "well_lit": +4,
    "busy": +3,
    "police_present": +6,
    "dark": -6,
    "danger": -8,
    "suspicious": -5,
    "no_footpath": -3,
    "deserted": -4,
  };

  const total = reports.reduce((sum, r) => {
    return sum + (weights[r.safety_type] || 0);
  }, 0);

  // Cap adjustment at ±15
  return Math.max(-15, Math.min(15, total));
}

async function sendSmsAlerts(recipients, message) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = normalizePhoneNumber(process.env.TWILIO_FROM_NUMBER);

  if (!sid || !token || !from) {
    console.log("[alert simulation]", { recipients, message });
    return { mode: "simulation", sentCount: recipients.length };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const results = await Promise.all(recipients.map(async (to) => {
    const body = new URLSearchParams({ From: from, To: to, Body: message });
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    if (!response.ok) {
      const text = await response.text();
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        detail = parsed.message || parsed.detail || text;
      } catch {
        detail = text;
      }
      throw new Error(`Twilio failed for ${to}: ${detail}`);
    }

    return response.json();
  }));

  return { mode: "sms", sentCount: results.length };
}

function normalizePhoneNumber(value) {
  const phone = String(value || "").trim();
  if (!phone) return "";

  const hasPlus = phone.startsWith("+");
  const digits = phone.replace(/[^\d]/g, "");
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return digits;
}

module.exports = router;
