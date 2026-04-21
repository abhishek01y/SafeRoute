import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ScoreData, Coords, RouteOption } from "../pages/index";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Chandigarh sector heatmap data (always available, no API needed)
const SECTOR_HEATMAP = [
    { lat: 30.7412, lon: 76.7843, score: 85 },  // Sector 17
    { lat: 30.7341, lon: 76.7812, score: 80 },  // Sector 22
    { lat: 30.7280, lon: 76.7798, score: 78 },  // Sector 35
    { lat: 30.7390, lon: 76.7756, score: 73 },  // Sector 9
    { lat: 30.7458, lon: 76.7780, score: 74 },  // Sector 10
    { lat: 30.7480, lon: 76.7870, score: 90 },  // Jan Marg
    { lat: 30.7412, lon: 76.7900, score: 88 },  // Madhya Marg
    { lat: 30.7312, lon: 76.7765, score: 83 },  // Himalaya Marg
    { lat: 30.7280, lon: 76.7765, score: 65 },  // Sector 20
    { lat: 30.7234, lon: 76.7780, score: 67 },  // Sector 21
    { lat: 30.7001, lon: 76.7994, score: 72 },  // Sector 43
    { lat: 30.7198, lon: 76.8094, score: 55 },  // Sector 31
    { lat: 30.7521, lon: 76.8121, score: 80 },  // Sukhna Lake
    { lat: 30.7458, lon: 76.8001, score: 60 },  // Rock Garden area
    { lat: 30.7234, lon: 76.7834, score: 65 },  // Sector 20
    { lat: 30.7312, lon: 76.8050, score: 70 },  // Sector 32 / PGIMER
];

const SAFE_ROUTE_WAYPOINTS = [
    { lat: 30.7412, lon: 76.7843, name: "Sector 17" },
    { lat: 30.7341, lon: 76.7812, name: "Sector 22" },
    { lat: 30.7280, lon: 76.7798, name: "Sector 35" },
    { lat: 30.7480, lon: 76.7870, name: "Jan Marg" },
    { lat: 30.7521, lon: 76.8121, name: "Sukhna Lake" },
];

interface Props {
    onMapClick: (lat: number, lon: number) => void;
    onRouteOptions?: (routes: RouteOption[]) => void;
    onRouteSelect?: (id: string) => void;
    clickedCoords: Coords | null;
    scoreData: ScoreData | null;
    routeCoords: { from: Coords; to: Coords } | null;
    routeOptions: RouteOption[];
    selectedRouteId: string | null;
    userLocation: Coords | null;
}

export default function MapView({
    onMapClick,
    onRouteOptions,
    onRouteSelect,
    clickedCoords,
    scoreData,
    routeCoords,
    routeOptions,
    selectedRouteId,
    userLocation,
}: Props) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const marker = useRef<mapboxgl.Marker | null>(null);
    const userMarker = useRef<mapboxgl.Marker | null>(null);
    const [mapReady, setMapReady] = useState(false);
    const [routePopupOpen, setRoutePopupOpen] = useState(false);
    const safestRoute = routeOptions[0] || null;
    const selectedRoute = routeOptions.find(route => route.id === selectedRouteId) || safestRoute;

    // Init map
    useEffect(() => {
        if (map.current || !mapContainer.current) return;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: "mapbox://styles/mapbox/dark-v11",
            center: [76.7794, 30.7333], // Chandigarh
            zoom: 13,
            pitch: 0,
        });

        map.current.addControl(new mapboxgl.NavigationControl(), "top-left");

        map.current.on("load", () => {
            setMapReady(true);
            loadChandigarhGeoJson();
            addHeatmapLayer();
            loadCommunityReports();
        });

        map.current.on("click", (e) => {
            onMapClick(e.lngLat.lat, e.lngLat.lng);
        });
    }, []);

    async function loadChandigarhGeoJson() {
        if (!map.current) return;

        try {
            const resp = await fetch("/data/chandigarh.geojson");
            if (!resp.ok) return;

            const data = await resp.json();
            if (!map.current || map.current.getSource("chandigarh-osm")) return;

            map.current.addSource("chandigarh-osm", {
                type: "geojson",
                data,
            });

            map.current.addLayer({
                id: "chandigarh-roads",
                type: "line",
                source: "chandigarh-osm",
                filter: [
                    "all",
                    ["has", "highway"],
                    ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
                ],
                paint: {
                    "line-color": [
                        "match",
                        ["get", "highway"],
                        "primary", "#5aa9ff",
                        "secondary", "#58d68d",
                        "tertiary", "#f4d03f",
                        "residential", "#9aa6b2",
                        "footway", "#00d4aa",
                        "pedestrian", "#00d4aa",
                        "#6b7f94",
                    ],
                    "line-width": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        11, 0.5,
                        15, 2.5,
                    ],
                    "line-opacity": 0.45,
                },
            });

            map.current.addLayer({
                id: "chandigarh-amenities",
                type: "circle",
                source: "chandigarh-osm",
                filter: [
                    "all",
                    ["has", "amenity"],
                    ["==", ["geometry-type"], "Point"],
                ],
                paint: {
                    "circle-radius": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        11, 2,
                        15, 5,
                    ],
                    "circle-color": [
                        "match",
                        ["get", "amenity"],
                        "police", "#00d4aa",
                        "hospital", "#ff4455",
                        "pharmacy", "#ffaa00",
                        "atm", "#c084fc",
                        "bank", "#c084fc",
                        "restaurant", "#ffffff",
                        "cafe", "#ffffff",
                        "parking", "#6b7f94",
                        "#ffffff",
                    ],
                    "circle-opacity": 0.75,
                    "circle-stroke-width": 1,
                    "circle-stroke-color": "#0a0e14",
                },
            });
        } catch {
            // Local Chandigarh GeoJSON is optional.
        }
    }

    // Update marker when score changes
    useEffect(() => {
        if (!map.current || !clickedCoords || !scoreData) return;

        if (marker.current) marker.current.remove();

        const color =
            scoreData.color === "green" ? "#00d4aa" :
                scoreData.color === "yellow" ? "#ffaa00" : "#ff4455";

        const el = document.createElement("div");
        el.style.cssText = `
      width: 18px; height: 18px; border-radius: 50%;
      background: ${color};
      border: 3px solid white;
      box-shadow: 0 0 14px ${color}99;
    `;

        marker.current = new mapboxgl.Marker(el)
            .setLngLat([clickedCoords.lon, clickedCoords.lat])
            .addTo(map.current);
    }, [clickedCoords, scoreData]);

    // Draw route when routeCoords changes
    useEffect(() => {
        if (!map.current || !routeCoords) return;
        fetchRouteOptions(routeCoords.from, routeCoords.to);
    }, [routeCoords]);

    useEffect(() => {
        if (!mapReady) return;
        drawRouteOptions();
    }, [mapReady, routeOptions, selectedRouteId]);

    useEffect(() => {
        if (!map.current || !userLocation) return;

        if (!userMarker.current) {
            const el = document.createElement("div");
            el.style.cssText = `
        width: 16px; height: 16px; border-radius: 50%;
        background: #0096ff;
        border: 3px solid white;
        box-shadow: 0 0 0 8px rgba(0,150,255,0.16);
      `;
            userMarker.current = new mapboxgl.Marker(el)
                .setLngLat([userLocation.lon, userLocation.lat])
                .addTo(map.current);
        }

        userMarker.current.setLngLat([userLocation.lon, userLocation.lat]);
    }, [userLocation]);

    function addHeatmapLayer() {
        if (!map.current) return;

        const geoData: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features: SECTOR_HEATMAP.map(s => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: [s.lon, s.lat] },
                properties: { score: s.score },
            })),
        };

        map.current.addSource("safety-heatmap", { type: "geojson", data: geoData });

        map.current.addLayer({
            id: "safety-heatmap-layer",
            type: "heatmap",
            source: "safety-heatmap",
            paint: {
                "heatmap-weight": ["interpolate", ["linear"], ["get", "score"], 0, 0, 100, 1],
                "heatmap-intensity": 1.2,
                "heatmap-radius": 65,
                "heatmap-opacity": 0.55,
                "heatmap-color": [
                    "interpolate", ["linear"], ["heatmap-density"],
                    0, "rgba(255,68,85,0)",
                    0.3, "rgba(255,68,85,0.65)",
                    0.5, "rgba(255,170,0,0.7)",
                    0.8, "rgba(0,212,170,0.7)",
                    1, "rgba(0,212,170,0.9)",
                ],
            },
        });
    }

    async function loadCommunityReports() {
        try {
            const resp = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/reports`
            );
            const data = await resp.json();
            renderReportPins(data.reports || []);
        } catch {
            // Backend offline — skip pins
        }
    }

    function renderReportPins(reports: any[]) {
        if (!map.current) return;

        const geoData: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features: reports.map(r => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: [r.lon, r.lat] },
                properties: { safety_type: r.safety_type },
            })),
        };

        if (map.current.getSource("reports")) {
            (map.current.getSource("reports") as mapboxgl.GeoJSONSource).setData(geoData);
        } else {
            map.current.addSource("reports", { type: "geojson", data: geoData });
            map.current.addLayer({
                id: "report-pins",
                type: "circle",
                source: "reports",
                paint: {
                    "circle-radius": 6,
                    "circle-color": [
                        "case",
                        ["in", ["get", "safety_type"], ["literal", ["safe", "well_lit", "busy", "police_present"]]],
                        "#00d4aa",
                        "#ff4455",
                    ],
                    "circle-stroke-width": 2,
                    "circle-stroke-color": "white",
                    "circle-opacity": 0.9,
                },
            });
        }
    }

    async function fetchRouteOptions(from: Coords, to: Coords) {
        if (!map.current) return;
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

        try {
            const resp = await fetch(
                `https://api.mapbox.com/directions/v5/mapbox/walking/` +
                `${from.lon},${from.lat};${to.lon},${to.lat}` +
                `?geometries=geojson&alternatives=true&overview=full&access_token=${token}`
            );
            const data = await resp.json();
            let routes = (data.routes || []).slice(0, 3).map((route: any, index: number) => {
                const coords = (route.geometry?.coordinates || []).map(([lon, lat]: [number, number]) => ({ lat, lon }));
                return {
                    id: `route-${index}`,
                    label: index === 0 ? "Fastest" : `Alternative ${index + 1}`,
                    coords,
                    distanceMeters: route.distance || 0,
                    durationSeconds: route.duration || 0,
                    safetyScore: null,
                };
            }).filter((route: RouteOption) => route.coords.length > 1);

            if (routes.length < 2) {
                const saferRoute = await fetchSaferWaypointRoute(from, to, token);
                if (saferRoute) routes = [...routes, saferRoute];
            }

            onRouteOptions?.(routes);

            // Fit bounds
            const bounds = new mapboxgl.LngLatBounds(
                [from.lon, from.lat], [to.lon, to.lat]
            );
            map.current.fitBounds(bounds, { padding: 80 });

        } catch (e) {
            console.error("Route draw error:", e);
        }
    }

    async function fetchSaferWaypointRoute(from: Coords, to: Coords, token: string): Promise<RouteOption | null> {
        const waypoint = chooseSafeWaypoint(from, to);
        if (!waypoint) return null;

        try {
            const resp = await fetch(
                `https://api.mapbox.com/directions/v5/mapbox/walking/` +
                `${from.lon},${from.lat};${waypoint.lon},${waypoint.lat};${to.lon},${to.lat}` +
                `?geometries=geojson&overview=full&access_token=${token}`
            );
            const data = await resp.json();
            const route = data.routes?.[0];
            const coords = (route?.geometry?.coordinates || []).map(([lon, lat]: [number, number]) => ({ lat, lon }));
            if (coords.length < 2) return null;

            return {
                id: "route-safer-waypoint",
                label: `Safer via ${waypoint.name}`,
                coords,
                distanceMeters: route.distance || 0,
                durationSeconds: route.duration || 0,
                safetyScore: null,
            };
        } catch {
            return null;
        }
    }

    function chooseSafeWaypoint(from: Coords, to: Coords) {
        const directDistance = distanceMeters(from, to);

        return SAFE_ROUTE_WAYPOINTS
            .map(point => ({
                ...point,
                extraDistance: distanceMeters(from, point) + distanceMeters(point, to) - directDistance,
            }))
            .filter(point => point.extraDistance > 120 && point.extraDistance < 3500)
            .sort((a, b) => a.extraDistance - b.extraDistance)[0] || null;
    }

    function drawRouteOptions() {
        if (!map.current) return;
        if (!map.current.isStyleLoaded()) return;

        const features: GeoJSON.Feature[] = routeOptions.map(route => ({
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: route.coords.map(coord => [coord.lon, coord.lat]),
            },
            properties: {
                id: route.id,
                selected: route.id === selectedRouteId,
                safetyScore: route.safetyScore ?? 0,
            },
        }));

        const routeData: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features,
        };

        if (map.current.getSource("routes")) {
            (map.current.getSource("routes") as mapboxgl.GeoJSONSource).setData(routeData);
            return;
        }

        map.current.addSource("routes", { type: "geojson", data: routeData });
        map.current.addLayer({
            id: "route-lines-muted",
            type: "line",
            source: "routes",
            filter: ["!=", ["get", "selected"], true],
            paint: {
                "line-color": "#6b7f94",
                "line-width": 4,
                "line-opacity": 0.55,
                "line-dasharray": [2, 1],
            },
        });
        map.current.addLayer({
            id: "route-line-selected",
            type: "line",
            source: "routes",
            filter: ["==", ["get", "selected"], true],
            paint: {
                "line-color": [
                    "case",
                    [">=", ["get", "safetyScore"], 75], "#00d4aa",
                    [">=", ["get", "safetyScore"], 50], "#ffaa00",
                    "#ff4455",
                ],
                "line-width": 7,
                "line-opacity": 0.92,
            },
        });
    }

    return (
        <>
            <div className="map-wrap">
                <div ref={mapContainer} style={{ flex: 1, height: "100%" }} />
                {safestRoute && (
                    <div className={`safest-popup ${routePopupOpen ? "open" : ""}`}>
                        <button className="safest-summary" onClick={() => setRoutePopupOpen(open => !open)}>
                            <span>Safest Route</span>
                            <strong>{safestRoute.safetyScore ?? "--"}</strong>
                        </button>
                        {routePopupOpen && (
                            <div className="safest-detail">
                                <div className="detail-head">
                                    <div>
                                        <span>Selected</span>
                                        <strong>{selectedRoute?.label || safestRoute.label}</strong>
                                    </div>
                                    <em>{selectedRoute?.safetyScore ?? "--"}</em>
                                </div>
                                <div className="detail-grid">
                                    <div><span>Distance</span><strong>{formatDistance(selectedRoute?.distanceMeters || 0)}</strong></div>
                                    <div><span>Time</span><strong>{formatDurationLong(selectedRoute?.durationSeconds || 0)}</strong></div>
                                </div>
                                <div className="route-list">
                                    {routeOptions.map(route => (
                                        <button
                                            key={route.id}
                                            className={route.id === selectedRouteId ? "active" : ""}
                                            onClick={() => onRouteSelect?.(route.id)}
                                        >
                                            <span>{route.label}</span>
                                            <strong>{route.safetyScore ?? "--"}</strong>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <style jsx global>{`
        .mapboxgl-ctrl-logo { display: none !important; }
      `}</style>
            <style jsx>{`
        .map-wrap {
          position: relative;
          flex: 1;
          height: 100%;
          min-width: 0;
        }
        .safest-popup {
          position: absolute;
          left: 18px;
          bottom: 18px;
          z-index: 20;
          width: 220px;
          color: var(--text);
          font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
        }
        .safest-summary {
          width: 100%;
          height: 58px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border: 1px solid rgba(0,212,170,0.42);
          border-radius: 8px;
          background: rgba(17,24,32,0.94);
          color: var(--text);
          box-shadow: 0 12px 30px rgba(0,0,0,0.38);
          cursor: pointer;
        }
        .safest-summary span {
          color: var(--muted);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .safest-summary strong {
          min-width: 42px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: rgba(0,212,170,0.14);
          color: var(--accent);
          font-size: 20px;
          font-weight: 800;
        }
        .safest-detail {
          margin-top: 8px;
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: rgba(17,24,32,0.96);
          box-shadow: 0 12px 30px rgba(0,0,0,0.38);
        }
        .detail-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .detail-head span, .detail-grid span {
          display: block;
          color: var(--muted);
          font-size: 10px;
          letter-spacing: 0.6px;
          text-transform: uppercase;
        }
        .detail-head strong {
          display: block;
          margin-top: 3px;
          font-size: 13px;
        }
        .detail-head em {
          min-width: 38px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: rgba(0,212,170,0.14);
          color: var(--accent);
          font-style: normal;
          font-weight: 800;
        }
        .detail-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 10px;
        }
        .detail-grid div {
          padding: 8px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--card);
        }
        .detail-grid strong {
          display: block;
          margin-top: 3px;
          font-size: 12px;
        }
        .route-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 10px;
        }
        .route-list button {
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 0 8px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: transparent;
          color: var(--text);
          font-family: inherit;
          cursor: pointer;
        }
        .route-list button.active {
          border-color: var(--accent);
          background: rgba(0,212,170,0.08);
        }
        .route-list span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
        }
        .route-list strong {
          color: var(--accent);
          font-size: 12px;
        }
      `}</style>
        </>
    );
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

function formatDurationLong(seconds: number) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatDistance(meters: number) {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}
