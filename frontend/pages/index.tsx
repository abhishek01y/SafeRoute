import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import SearchBar from "../components/SearchBar";
import SafetyPanel from "../components/SafetyPanel";

// Mapbox uses browser APIs — import dynamically to avoid SSR crash
const MapView = dynamic(() => import("../components/MapView"), { ssr: false });

export interface ScoreData {
    safe_score: number;
    verdict: "Safe" | "Moderate" | "Caution";
    color: "green" | "yellow" | "red";
    sector: string;
    sector_type: string;
    is_night: boolean;
    notes: string;
    breakdown: {
        sector_score: number;
        poi_score: number;
        news_score: number;
        poi_count: number | string;
        community_adjustment: number;
        community_report_count: number;
        headlines: string[];
    };
}

export interface Coords {
    lat: number;
    lon: number;
}

export interface RouteOption {
    id: string;
    label: string;
    coords: Coords[];
    distanceMeters: number;
    durationSeconds: number;
    safetyScore: number | null;
}

const MOVEMENT_SCORE_DISTANCE_METERS = 50;

export default function Home() {
    const [scoreData, setScoreData] = useState<ScoreData | null>(null);
    const [loading, setLoading] = useState(false);
    const [clickedCoords, setClickedCoords] = useState<Coords | null>(null);
    const [routeCoords, setRouteCoords] = useState<{ from: Coords; to: Coords } | null>(null);
    const [routeLine, setRouteLine] = useState<Coords[]>([]);
    const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
    const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
    const [userLocation, setUserLocation] = useState<Coords | null>(null);
    const [lastScoredLocation, setLastScoredLocation] = useState<Coords | null>(null);

    const fetchScore = useCallback(async (lat: number, lon: number) => {
        setLoading(true);
        setClickedCoords({ lat, lon });
        try {
            const resp = await fetch(
                process.env.NEXT_PUBLIC_BACKEND_URL + "/safety-score",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lat, lon }),
                }
            );
            const data = await resp.json();
            setScoreData(data);
        } catch {
            // Backend offline — use fallback score based on coords
            setScoreData(getFallbackScore(lat, lon));
        } finally {
            setLoading(false);
        }
    }, []);

    const handleRouteSearch = useCallback(
        (from: Coords, to: Coords) => {
            setRouteCoords({ from, to });
            setRouteLine([]);
            setRouteOptions([]);
            setSelectedRouteId(null);
            // Score the midpoint of the route
            const midLat = (from.lat + to.lat) / 2;
            const midLon = (from.lon + to.lon) / 2;
            fetchScore(midLat, midLon);
        },
        [fetchScore]
    );

    const handleMovementScore = useCallback((coords: Coords) => {
        if (lastScoredLocation) {
            const distance = distanceMeters(coords, lastScoredLocation);
            if (distance < MOVEMENT_SCORE_DISTANCE_METERS) return;
        }

        setLastScoredLocation(coords);
        fetchScore(coords.lat, coords.lon);
    }, [fetchScore, lastScoredLocation]);

    const handleRouteOptions = useCallback(async (options: RouteOption[]) => {
        const scoredOptions = await Promise.all(options.map(async (option) => {
            const sample = option.coords[Math.floor(option.coords.length / 2)];
            if (!sample) return option;

            try {
                const resp = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/safety-score`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lat: sample.lat, lon: sample.lon }),
                });
                const data = await resp.json();
                return { ...option, safetyScore: data.safe_score ?? null };
            } catch {
                return { ...option, safetyScore: getFallbackScore(sample.lat, sample.lon).safe_score };
            }
        }));

        const sorted = [...scoredOptions].sort((a, b) => {
            const safeA = a.safetyScore ?? -1;
            const safeB = b.safetyScore ?? -1;
            if (safeB !== safeA) return safeB - safeA;
            return a.durationSeconds - b.durationSeconds;
        });

        setRouteOptions(sorted);
        const selected = sorted[0];
        if (selected) {
            setSelectedRouteId(selected.id);
            setRouteLine(selected.coords);
        }
    }, []);

    const handleRouteSelect = useCallback((id: string) => {
        setSelectedRouteId(id);
        const option = routeOptions.find(route => route.id === id);
        if (option) {
            setRouteLine(option.coords);
            const sample = option.coords[Math.floor(option.coords.length / 2)];
            if (sample) fetchScore(sample.lat, sample.lon);
        }
    }, [fetchScore, routeOptions]);

    return (
        <div className="app-shell">
            <header className="topbar">
                <div className="logo">
                    Safe<span>Route</span> <span className="logo-city">AI</span>
                </div>
                <SearchBar onRouteSearch={handleRouteSearch} />
            </header>

            <main className="main-content">
                <MapView
                    onMapClick={fetchScore}
                    onRouteOptions={handleRouteOptions}
                    onRouteSelect={handleRouteSelect}
                    clickedCoords={clickedCoords}
                    scoreData={scoreData}
                    routeCoords={routeCoords}
                    routeOptions={routeOptions}
                    selectedRouteId={selectedRouteId}
                    userLocation={userLocation}
                />
                <SafetyPanel
                    scoreData={scoreData}
                    loading={loading}
                    clickedCoords={clickedCoords}
                    routeCoords={routeCoords}
                    routeLine={routeLine}
                    routeOptions={routeOptions}
                    selectedRouteId={selectedRouteId}
                    onRouteSelect={handleRouteSelect}
                    userLocation={userLocation}
                    onUserLocationChange={setUserLocation}
                    onMovementScore={handleMovementScore}
                />
            </main>

            <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:      #0a0e14;
          --surface: #111820;
          --card:    #161e28;
          --border:  #1e2d3d;
          --accent:  #00d4aa;
          --accent2: #0096ff;
          --warn:    #ffaa00;
          --danger:  #ff4455;
          --text:    #e2eaf4;
          --muted:   #6b7f94;
        }

        body {
          font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
          background: var(--bg);
          color: var(--text);
          height: 100vh;
          overflow: hidden;
        }

        .app-shell {
          display: flex;
          flex-direction: column;
          height: 100vh;
        }

        .topbar {
          height: 56px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          padding: 0 20px;
          gap: 16px;
          flex-shrink: 0;
          z-index: 100;
        }

        .logo {
          font-size: 18px;
          font-weight: 700;
          color: var(--accent);
          white-space: nowrap;
          letter-spacing: -0.5px;
        }
        .logo span { color: var(--text); }
        .logo .logo-city { color: var(--accent); }

        .main-content {
          flex: 1;
          display: flex;
          overflow: hidden;
        }
      `}</style>
        </div>
    );
}

// ── Fallback when backend is offline ───────────────────────────────────────
function getFallbackScore(lat: number, lon: number): ScoreData {
    const SECTORS = [
        { lat: 30.7412, lon: 76.7843, score: 85, name: "Sector 17" },
        { lat: 30.7341, lon: 76.7812, score: 80, name: "Sector 22" },
        { lat: 30.7280, lon: 76.7798, score: 78, name: "Sector 35" },
        { lat: 30.7521, lon: 76.8121, score: 80, name: "Sukhna Lake" },
        { lat: 30.7198, lon: 76.8094, score: 55, name: "Sector 31" },
        { lat: 30.7001, lon: 76.7994, score: 72, name: "Sector 43" },
        { lat: 30.7480, lon: 76.7870, score: 90, name: "Jan Marg" },
    ];

    let closest = SECTORS[0];
    let minDist = Infinity;
    for (const s of SECTORS) {
        const d = Math.hypot(s.lat - lat, s.lon - lon);
        if (d < minDist) { minDist = d; closest = s; }
    }

    const hour = new Date().getHours();
    const night = hour >= 20 || hour < 6;
    const score = Math.max(0, closest.score - (night ? 15 : 0));
    const verdict = score >= 75 ? "Safe" : score >= 50 ? "Moderate" : "Caution";
    const color = score >= 75 ? "green" : score >= 50 ? "yellow" : "red";

    return {
        safe_score: score, verdict, color,
        sector: closest.name, sector_type: "local data",
        is_night: night,
        notes: "Offline mode — using Chandigarh sector knowledge base",
        breakdown: {
            sector_score: Math.round(score * 0.5),
            poi_score: 12, news_score: 10,
            poi_count: "–", community_adjustment: 0,
            community_report_count: 0, headlines: [],
        },
    };
}

function distanceMeters(a: Coords, b: Coords) {
    const earthRadius = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;

    const h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
