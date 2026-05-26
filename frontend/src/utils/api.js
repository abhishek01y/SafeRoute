import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function getEdges() {
  const res = await api.get('/edges?major=true');
  return res.data;
}

export async function getRoute(startLat, startLon, endLat, endLon, mode = 'balanced', transport = 'car') {
  const res = await api.post('/route', {
    start_lat: startLat,
    start_lon: startLon,
    end_lat: endLat,
    end_lon: endLon,
    mode,
    transport,
  });
  return res.data;
}

export async function compareRoutes(startLat, startLon, endLat, endLon, transport = 'car') {
  const res = await api.post('/compare', {
    start_lat: startLat,
    start_lon: startLon,
    end_lat: endLat,
    end_lon: endLon,
    transport,
  });
  return res.data;
}

export async function evaluateRoute(startLat, startLon, endLat, endLon) {
  const res = await api.post('/evaluate', {
    start_lat: startLat,
    start_lon: startLon,
    end_lat: endLat,
    end_lon: endLon,
  });
  return res.data;
}

export async function getXAI(startLat, startLon, endLat, endLon, mode = 'balanced', transport = 'car') {
  const res = await api.post('/xai', {
    start_lat: startLat,
    start_lon: startLon,
    end_lat: endLat,
    end_lon: endLon,
    mode,
    transport,
  });
  return res.data;
}

export async function submitReport(edgeId, userId, reportType) {
  const res = await api.post('/report', {
    edge_id: edgeId,
    user_id: userId,
    report_type: reportType,
  });
  return res.data;
}

export async function submitIncident(lat, lon, severity, incidentType) {
  const res = await api.post('/incident', {
    lat,
    lon,
    severity,
    incident_type: incidentType,
  });
  return res.data;
}

export async function getSystemReport() {
  const res = await api.get('/system-report');
  return res.data;
}

export async function getPOIs(types = '') {
  const res = await api.get('/pois', { params: { types } });
  return res.data;
}

export async function getHealth() {
  const res = await api.get('/health');
  return res.data;
}

export default api;
