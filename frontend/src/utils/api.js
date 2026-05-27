import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
});

const cache = new Map();
function cached(key, ttl = 30000) {
  return {
    get: () => { const v = cache.get(key); return v && Date.now() - v.ts < ttl ? v.data : null; },
    set: (data) => { cache.set(key, { data, ts: Date.now() }); },
  };
}

export async function getEdges() {
  const res = await api.get('/edges?major=true');
  return res.data;
}

export async function getRoute(startLat, startLon, endLat, endLon, mode = 'balanced', transport = 'car', safetyMode = 'standard') {
  const res = await api.post('/route', { start_lat: startLat, start_lon: startLon, end_lat: endLat, end_lon: endLon, mode, transport, safety_mode: safetyMode });
  return res.data;
}

export async function compareRoutes(startLat, startLon, endLat, endLon, transport = 'car', safetyMode = 'standard') {
  const key = `compare:${startLat},${startLon},${endLat},${endLon},${transport},${safetyMode}`;
  const c = cached(key, 60000);
  let data = c.get();
  if (data) return data;
  const res = await api.post('/compare', { start_lat: startLat, start_lon: startLon, end_lat: endLat, end_lon: endLon, transport, safety_mode: safetyMode });
  c.set(res.data);
  return res.data;
}

export async function evaluateRoute(startLat, startLon, endLat, endLon) {
  const res = await api.post('/evaluate', { start_lat: startLat, start_lon: startLon, end_lat: endLat, end_lon: endLon });
  return res.data;
}

export async function getXAI(startLat, startLon, endLat, endLon, mode = 'balanced', transport = 'car', safetyMode = 'standard') {
  const res = await api.post('/xai', { start_lat: startLat, start_lon: startLon, end_lat: endLat, end_lon: endLon, mode, transport, safety_mode: safetyMode });
  return res.data;
}

export async function submitReport(edgeId, userId, reportType) {
  const res = await api.post('/report', { edge_id: edgeId, user_id: userId, report_type: reportType });
  return res.data;
}

export async function submitIncident(lat, lon, severity, incidentType) {
  const res = await api.post('/incident', { lat, lon, severity, incident_type: incidentType });
  return res.data;
}

export async function getSystemReport() {
  const res = await api.get('/system-report');
  return res.data;
}

export async function getPOIs(types = '') {
  const key = `pois:${types}`;
  const c = cached(key, 120000);
  let data = c.get();
  if (data) return data;
  const res = await api.get('/pois', { params: { types } });
  c.set(res.data);
  return res.data;
}

export async function getHealth() {
  const res = await api.get('/health');
  return res.data;
}

// === SAFETY PROTOCOL ENDPOINTS ===

export async function startNavSession(sessionId, startLat, startLon, endLat, endLon, transport, safetyMode, emergencyContact) {
  const res = await api.post('/navigation/session-start', {
    session_id: sessionId, start_lat: startLat, start_lon: startLon,
    end_lat: endLat, end_lon: endLon, transport, safety_mode: safetyMode,
    emergency_contact: emergencyContact,
  });
  return res.data;
}

export async function triggerDeadman(lat, lon, emergencyContact, sessionId) {
  const res = await api.post('/safety/deadman-trigger', { lat, lon, emergency_contact: emergencyContact, session_id: sessionId });
  return res.data;
}

export async function verifyTrajectory(assignedPath, currentGps) {
  const res = await api.post('/navigation/verify-trajectory', { assigned_path: assignedPath, current_gps: currentGps });
  return res.data;
}

export async function getSafetyAlerts() {
  const res = await api.get('/safety/alerts');
  return res.data;
}

export default api;
