import { useEffect, useMemo, useRef, useState } from "react";
import { ScoreData, Coords, RouteOption } from "../pages/index";

interface Props {
    scoreData: ScoreData | null;
    loading: boolean;
    clickedCoords: Coords | null;
    routeCoords: { from: Coords; to: Coords } | null;
    routeLine: Coords[];
    routeOptions: RouteOption[];
    selectedRouteId: string | null;
    onRouteSelect: (id: string) => void;
    userLocation: Coords | null;
    onUserLocationChange: (coords: Coords | null) => void;
    onMovementScore?: (coords: Coords) => void;
}

interface EmergencyContact {
    id: string;
    name: string;
    phone: string;
}

const REPORT_TYPES = [
    { key: "safe", label: "✅ Safe area", danger: false },
    { key: "well_lit", label: "💡 Well lit", danger: false },
    { key: "busy", label: "👥 Busy / active", danger: false },
    { key: "police_present", label: "🚓 Police present", danger: false },
    { key: "dark", label: "🌑 Dark / no lights", danger: true },
    { key: "danger", label: "⚠️ Feels unsafe", danger: true },
    { key: "suspicious", label: "👁️ Suspicious", danger: true },
    { key: "deserted", label: "🏚️ Deserted area", danger: true },
];

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL;
const CONTACTS_KEY = "saferoute_emergency_contacts";
const ROUTE_DEVIATION_METERS = 180;
const CHECK_IN_OPTIONS = [1, 5, 10, 15, 30];
const ZONE_THRESHOLD_OPTIONS = [40, 50, 60];

export default function SafetyPanel({
    scoreData,
    loading,
    clickedCoords,
    routeCoords,
    routeLine,
    routeOptions,
    selectedRouteId,
    onRouteSelect,
    userLocation,
    onUserLocationChange,
    onMovementScore,
}: Props) {
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [description, setDescription] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [contacts, setContacts] = useState<EmergencyContact[]>([]);
    const [contactName, setContactName] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [tracking, setTracking] = useState(false);
    const [trackingError, setTrackingError] = useState("");
    const [alertStatus, setAlertStatus] = useState("");
    const [lastDeviation, setLastDeviation] = useState<number | null>(null);
    const [checkInMinutes, setCheckInMinutes] = useState(10);
    const [checkInDeadline, setCheckInDeadline] = useState<number | null>(null);
    const [checkInRemaining, setCheckInRemaining] = useState(0);
    const [zoneAlertEnabled, setZoneAlertEnabled] = useState(true);
    const [zoneThreshold, setZoneThreshold] = useState(50);
    const [zoneAlertStatus, setZoneAlertStatus] = useState("Watching");
    const watchId = useRef<number | null>(null);
    const autoAlertSent = useRef(false);
    const checkInAlertSent = useRef(false);
    const zoneAlertSent = useRef(false);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(CONTACTS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                setContacts(parsed.map((contact: EmergencyContact) => ({
                    ...contact,
                    phone: normalizePhoneNumber(contact.phone),
                })));
            }
        } catch {
            setContacts([]);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
    }, [contacts]);

    useEffect(() => {
        if (!routeCoords) {
            autoAlertSent.current = false;
            setLastDeviation(null);
        }
    }, [routeCoords]);

    useEffect(() => {
        if (!tracking || !userLocation || routeLine.length < 2) return;

        const distance = distanceToRouteMeters(userLocation, routeLine);
        setLastDeviation(Math.round(distance));

        if (distance > ROUTE_DEVIATION_METERS && !autoAlertSent.current) {
            autoAlertSent.current = true;
            sendAlert(`Route changed or traveler moved ${Math.round(distance)}m away from the planned route`);
        }
    }, [tracking, userLocation, routeLine]);

    useEffect(() => {
        return () => {
            if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
        };
    }, []);

    useEffect(() => {
        if (!checkInDeadline) {
            setCheckInRemaining(0);
            return;
        }

        const timer = window.setInterval(() => {
            const remaining = Math.max(0, checkInDeadline - Date.now());
            setCheckInRemaining(remaining);

            if (remaining === 0 && !checkInAlertSent.current) {
                checkInAlertSent.current = true;
                sendAlert(`Missed safety check-in after ${checkInMinutes} minutes`);
            }
        }, 1000);

        return () => window.clearInterval(timer);
    }, [checkInDeadline, checkInMinutes]);

    useEffect(() => {
        if (!scoreData) {
            zoneAlertSent.current = false;
            setZoneAlertStatus("Waiting for score");
            return;
        }

        if (!zoneAlertEnabled) {
            setZoneAlertStatus("Paused");
            return;
        }

        if (!tracking) {
            setZoneAlertStatus("Start tracking");
            return;
        }

        if (scoreData.safe_score >= zoneThreshold) {
            zoneAlertSent.current = false;
            setZoneAlertStatus("Safe");
            return;
        }

        setZoneAlertStatus("Caution zone");

        if (!zoneAlertSent.current) {
            zoneAlertSent.current = true;
            sendAlert(`Traveler entered a caution zone near ${scoreData.sector}. Safety score: ${scoreData.safe_score}/100`);
            setZoneAlertStatus("Alert sent");
        }
    }, [scoreData, tracking, zoneAlertEnabled, zoneThreshold]);

    const canSendAlert = contacts.length > 0;
    const routeStatus = useMemo(() => {
        if (!routeCoords) return "No active route";
        if (!tracking) return "Route ready";
        if (lastDeviation === null) return "Tracking route";
        if (lastDeviation > ROUTE_DEVIATION_METERS) return `Off route by ${lastDeviation}m`;
        return `On route, ${lastDeviation}m from path`;
    }, [lastDeviation, routeCoords, tracking]);

    async function submitReport() {
        if (!selectedType || !clickedCoords) return;
        try {
            await fetch(`${BACKEND}/report`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lat: clickedCoords.lat,
                    lon: clickedCoords.lon,
                    safety_type: selectedType,
                    description,
                }),
            });
        } catch { /* offline — silently fail */ }

        setSubmitted(true);
        setTimeout(() => {
            setModalOpen(false);
            setSelectedType(null);
            setDescription("");
            setSubmitted(false);
        }, 1500);
    }

    function addContact() {
        const name = contactName.trim();
        const phone = normalizePhoneNumber(contactPhone);
        if (!name || !phone) return;
        if (!/^\+\d{8,15}$/.test(phone)) {
            setAlertStatus("Use phone format +91XXXXXXXXXX");
            return;
        }

        setContacts(prev => [...prev, { id: `${Date.now()}`, name, phone }]);
        setContactName("");
        setContactPhone("");
    }

    function removeContact(id: string) {
        setContacts(prev => prev.filter(contact => contact.id !== id));
    }

    function startTracking() {
        setTrackingError("");

        if (!navigator.geolocation) {
            setTrackingError("Location is not supported in this browser");
            return;
        }

        watchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const coords = {
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                };
                onUserLocationChange(coords);
                onMovementScore?.(coords);
                setTracking(true);
            },
            (error) => {
                setTracking(false);
                setTrackingError(error.message || "Location permission denied");
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
        );
    }

    function stopTracking() {
        if (watchId.current !== null) {
            navigator.geolocation.clearWatch(watchId.current);
            watchId.current = null;
        }
        setTracking(false);
        setLastDeviation(null);
    }

    function startCheckInTimer() {
        if (!contacts.length) {
            setAlertStatus("Add at least one emergency contact");
            return;
        }

        checkInAlertSent.current = false;
        setCheckInDeadline(Date.now() + checkInMinutes * 60 * 1000);
        setAlertStatus(`Check-in timer started for ${checkInMinutes} min`);

        if (!tracking) startTracking();
    }

    function markSafe() {
        checkInAlertSent.current = false;
        setCheckInDeadline(Date.now() + checkInMinutes * 60 * 1000);
        setAlertStatus("Check-in confirmed");
    }

    function stopCheckInTimer() {
        checkInAlertSent.current = false;
        setCheckInDeadline(null);
        setAlertStatus("Check-in timer stopped");
    }

    async function sendAlert(reason: string) {
        if (!contacts.length) {
            setAlertStatus("Add at least one emergency contact");
            return;
        }

        const location = userLocation || await getCurrentLocation();
        if (!location) {
            setAlertStatus("Allow location permission to send SOS");
            return;
        }
        onUserLocationChange(location);

        setAlertStatus("Sending alert...");
        try {
            const resp = await fetch(`${BACKEND}/alert`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contacts,
                    location,
                    route: routeCoords,
                    reason,
                }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || data.error || "Alert failed");
            setAlertStatus(data.mode === "sms" ? "Alert sent by SMS" : "SMS API not configured; alert logged in backend");
        } catch (err: any) {
            setAlertStatus(err?.message || "Alert failed");
        }
    }

    function getCurrentLocation(): Promise<Coords | null> {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(null);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lon: position.coords.longitude,
                    });
                },
                () => resolve(null),
                { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
            );
        });
    }

    const score = scoreData?.safe_score ?? null;
    const color = scoreData?.color ?? "green";
    const cssColor =
        color === "green" ? "var(--accent)" :
            color === "yellow" ? "var(--warn)" : "var(--danger)";

    return (
        <aside className="panel">
            <section className="section emergency-section">
                <div className="section-head">
                    <div>
                        <div className="section-label">Safety Companion</div>
                        <div className={`tracking-pill ${tracking ? "active" : ""}`}>
                            {tracking ? "Live GPS + scoring" : "Tracking off"}
                        </div>
                    </div>
                    <button
                        className="sos-btn"
                        onClick={() => sendAlert("SOS triggered manually")}
                        disabled={!canSendAlert}
                    >
                        SOS
                    </button>
                </div>

                <div className="route-status">
                    <span>Status</span>
                    <strong>{routeStatus}</strong>
                </div>

                {routeOptions.length > 0 && (
                    <div className="route-choices">
                        <div className="mini-label">Route Choice</div>
                        {routeOptions.map((route, index) => {
                            const selected = route.id === selectedRouteId;
                            const safety = route.safetyScore ?? 0;
                            const safetyClass = safety >= 75 ? "safe" : safety >= 50 ? "moderate" : "caution";
                            return (
                                <button
                                    key={route.id}
                                    className={`route-choice ${selected ? "selected" : ""}`}
                                    onClick={() => onRouteSelect(route.id)}
                                >
                                    <div>
                                        <strong>{route.label}</strong>
                                        <span>{formatDistance(route.distanceMeters)} · {formatDurationLong(route.durationSeconds)}</span>
                                    </div>
                                    <em className={safetyClass}>{route.safetyScore ?? "--"}</em>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="checkin-box">
                    <div className="checkin-top">
                        <div>
                            <span>Check-in</span>
                            <strong>{checkInDeadline ? formatDuration(checkInRemaining) : "Not active"}</strong>
                        </div>
                        <select
                            value={checkInMinutes}
                            onChange={e => setCheckInMinutes(Number(e.target.value))}
                            disabled={!!checkInDeadline}
                        >
                            {CHECK_IN_OPTIONS.map(minutes => (
                                <option key={minutes} value={minutes}>{minutes} min</option>
                            ))}
                        </select>
                    </div>
                    <div className="checkin-actions">
                        {checkInDeadline ? (
                            <>
                                <button onClick={markSafe}>I'm safe</button>
                                <button onClick={stopCheckInTimer}>Stop</button>
                            </>
                        ) : (
                            <button onClick={startCheckInTimer}>Start check-in timer</button>
                        )}
                    </div>
                </div>

                <div className="zone-watch">
                    <div className="zone-top">
                        <div>
                            <span>Zone Watch</span>
                            <strong className={zoneAlertStatus === "Alert sent" || zoneAlertStatus === "Caution zone" ? "zone-danger" : ""}>
                                {zoneAlertStatus}
                            </strong>
                        </div>
                        <label className="zone-toggle">
                            <input
                                type="checkbox"
                                checked={zoneAlertEnabled}
                                onChange={e => setZoneAlertEnabled(e.target.checked)}
                            />
                            On
                        </label>
                    </div>
                    <div className="zone-threshold">
                        <span>Alert below</span>
                        <select value={zoneThreshold} onChange={e => setZoneThreshold(Number(e.target.value))}>
                            {ZONE_THRESHOLD_OPTIONS.map(value => (
                                <option key={value} value={value}>{value}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="companion-actions">
                    <button className="track-btn" onClick={tracking ? stopTracking : startTracking}>
                        {tracking ? "Stop tracking" : "Start tracking"}
                    </button>
                    <button className="alert-btn" onClick={() => sendAlert("Safety check-in requested")} disabled={!canSendAlert}>
                        Share location
                    </button>
                </div>

                {trackingError && <div className="status-text danger-text">{trackingError}</div>}
                {alertStatus && <div className="status-text">{alertStatus}</div>}

                <div className="contact-form">
                    <input
                        value={contactName}
                        placeholder="Contact name"
                        onChange={e => setContactName(e.target.value)}
                    />
                    <input
                        value={contactPhone}
                        placeholder="+91 phone number"
                        onChange={e => setContactPhone(e.target.value)}
                    />
                    <button onClick={addContact}>Add</button>
                </div>

                <div className="contact-list">
                    {contacts.length === 0 && <div className="muted-line">No emergency contacts saved</div>}
                    {contacts.map(contact => (
                        <div key={contact.id} className="contact-row">
                            <div>
                                <strong>{contact.name}</strong>
                                <span>{contact.phone}</span>
                            </div>
                            <button onClick={() => removeContact(contact.id)}>Remove</button>
                        </div>
                    ))}
                </div>
            </section>

            {/* Score Section */}
            <section className="section">
                <div className="section-label">Safety Score</div>
                <div className="score-card">
                    {!scoreData && !loading && (
                        <div className="empty-state">
                            <span className="empty-icon">🗺️</span>
                            <p>Click anywhere on the map<br />or enter a route to check safety</p>
                        </div>
                    )}

                    {loading && (
                        <div className="empty-state">
                            <span className="empty-icon loading-pulse">⏳</span>
                            <p>Analyzing area safety...</p>
                        </div>
                    )}

                    {scoreData && !loading && (
                        <>
                            <div className="score-top">
                                <div>
                                    <div className="score-num" style={{ color: cssColor }}>
                                        {score}
                                    </div>
                                    <div className="sector-name">{scoreData.sector}</div>
                                    <div className="sector-type">{scoreData.sector_type}</div>
                                    {scoreData.is_night && (
                                        <div className="night-badge">🌙 Night mode — scores reduced</div>
                                    )}
                                </div>
                                <div className="verdict-badge" style={{ background: cssColor + "22", color: cssColor }}>
                                    {scoreData.verdict}
                                </div>
                            </div>

                            <div className="bar-track">
                                <div className="bar-fill" style={{ width: `${score}%`, background: cssColor }} />
                            </div>

                            {scoreData.notes && (
                                <p className="notes-text">{scoreData.notes}</p>
                            )}

                            <div className="breakdown">
                                <div className="bd-row">
                                    <span className="bd-label">Sector knowledge</span>
                                    <span className="bd-val">{scoreData.breakdown.sector_score}/50</span>
                                </div>
                                <div className="bd-row">
                                    <span className="bd-label">Nearby activity</span>
                                    <span className="bd-val">{scoreData.breakdown.poi_score}/25 · {scoreData.breakdown.poi_count} places</span>
                                </div>
                                <div className="bd-row">
                                    <span className="bd-label">News sentiment</span>
                                    <span className="bd-val">{scoreData.breakdown.news_score}/25</span>
                                </div>
                                <div className="bd-row">
                                    <span className="bd-label">Community reports</span>
                                    <span className="bd-val">
                                        {scoreData.breakdown.community_adjustment >= 0 ? "+" : ""}
                                        {scoreData.breakdown.community_adjustment} · {scoreData.breakdown.community_report_count} reports
                                    </span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </section>

            {/* Report Section */}
            <section className="section">
                <div className="section-label">Community Reports</div>
                <button className="report-btn" onClick={() => setModalOpen(true)}>
                    📍 Drop a report here
                </button>
            </section>

            {/* News Section */}
            {scoreData?.breakdown?.headlines?.length > 0 && (
                <section className="section">
                    <div className="section-label">Recent News</div>
                    {scoreData.breakdown.headlines.map((h, i) => (
                        <div key={i} className="headline">{h}</div>
                    ))}
                </section>
            )}

            {/* Legend */}
            <section className="section">
                <div className="section-label">Heatmap Legend</div>
                <div className="legend-row"><span className="dot" style={{ background: "#00d4aa" }} /> Safe (75–100)</div>
                <div className="legend-row"><span className="dot" style={{ background: "#ffaa00" }} /> Moderate (50–74)</div>
                <div className="legend-row"><span className="dot" style={{ background: "#ff4455" }} /> Caution (0–49)</div>
            </section>

            {/* Report Modal */}
            {modalOpen && (
                <div className="modal-overlay" onClick={() => setModalOpen(false)}>
                    <div className="modal-card" onClick={e => e.stopPropagation()}>
                        <div className="modal-title">Report this location</div>
                        <div className="modal-sub">
                            {clickedCoords
                                ? `📍 ${clickedCoords.lat.toFixed(5)}, ${clickedCoords.lon.toFixed(5)}`
                                : "Click the map first to select a location"}
                        </div>

                        {submitted ? (
                            <div className="submitted">✅ Report submitted!</div>
                        ) : (
                            <>
                                <div className="type-grid">
                                    {REPORT_TYPES.map(t => (
                                        <button
                                            key={t.key}
                                            className={`type-btn ${t.danger ? "danger" : ""} ${selectedType === t.key ? "selected" : ""}`}
                                            onClick={() => setSelectedType(t.key)}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>

                                <textarea
                                    className="modal-textarea"
                                    placeholder="Optional note..."
                                    rows={2}
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                />

                                <div className="modal-actions">
                                    <button className="btn-cancel" onClick={() => setModalOpen(false)}>Cancel</button>
                                    <button
                                        className="btn-submit"
                                        disabled={!selectedType || !clickedCoords}
                                        onClick={submitReport}
                                    >
                                        Submit
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            <style jsx>{`
        .panel {
          width: 340px;
          background: var(--surface);
          border-left: 1px solid var(--border);
          overflow-y: auto;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
        }
        .panel::-webkit-scrollbar { width: 4px; }
        .panel::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

        .section {
          padding: 16px;
          border-bottom: 1px solid var(--border);
        }
        .emergency-section {
          background: linear-gradient(180deg, rgba(255,68,85,0.08), rgba(17,24,32,0));
        }
        .section-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .section-label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 10px;
        }
        .tracking-pill {
          display: inline-flex;
          align-items: center;
          height: 24px;
          padding: 0 9px;
          border: 1px solid var(--border);
          border-radius: 999px;
          color: var(--muted);
          font-size: 12px;
        }
        .tracking-pill.active {
          border-color: var(--accent);
          color: var(--accent);
          background: rgba(0,212,170,0.08);
        }
        .sos-btn {
          width: 64px;
          height: 44px;
          border: none;
          border-radius: 8px;
          background: var(--danger);
          color: white;
          font-weight: 800;
          letter-spacing: 0;
          cursor: pointer;
        }
        .sos-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .route-status {
          margin-top: 12px;
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--card);
          display: flex;
          justify-content: space-between;
          gap: 12px;
          font-size: 12px;
        }
        .route-status span { color: var(--muted); }
        .route-status strong { color: var(--text); font-weight: 600; text-align: right; }
        .route-choices {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 10px;
        }
        .mini-label {
          color: var(--muted);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .route-choice {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--card);
          color: var(--text);
          font-family: inherit;
          cursor: pointer;
          text-align: left;
        }
        .route-choice.selected {
          border-color: var(--accent);
          background: rgba(0,212,170,0.08);
        }
        .route-choice strong {
          display: block;
          font-size: 12px;
          margin-bottom: 3px;
        }
        .route-choice span {
          color: var(--muted);
          font-size: 11px;
        }
        .route-choice em {
          min-width: 42px;
          height: 32px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-style: normal;
          font-weight: 800;
          font-size: 13px;
        }
        .route-choice em.safe { background: rgba(0,212,170,0.14); color: var(--accent); }
        .route-choice em.moderate { background: rgba(255,170,0,0.14); color: var(--warn); }
        .route-choice em.caution { background: rgba(255,68,85,0.14); color: var(--danger); }
        .checkin-box {
          margin-top: 10px;
          padding: 10px;
          border: 1px solid rgba(255,170,0,0.32);
          border-radius: 8px;
          background: rgba(255,170,0,0.07);
        }
        .checkin-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .checkin-top span {
          display: block;
          color: var(--muted);
          font-size: 11px;
          margin-bottom: 2px;
        }
        .checkin-top strong {
          color: var(--warn);
          font-family: 'JetBrains Mono', monospace;
          font-size: 16px;
        }
        .checkin-top select {
          height: 32px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          font-family: inherit;
          font-size: 12px;
          padding: 0 8px;
        }
        .checkin-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 9px;
        }
        .checkin-actions button {
          height: 34px;
          border-radius: 8px;
          border: 1px solid rgba(255,170,0,0.36);
          background: rgba(255,170,0,0.12);
          color: var(--warn);
          font-family: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .checkin-actions button:only-child {
          grid-column: 1 / -1;
        }
        .zone-watch {
          margin-top: 10px;
          padding: 10px;
          border: 1px solid rgba(0,150,255,0.3);
          border-radius: 8px;
          background: rgba(0,150,255,0.07);
        }
        .zone-top, .zone-threshold {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .zone-top span, .zone-threshold span {
          display: block;
          color: var(--muted);
          font-size: 11px;
          margin-bottom: 2px;
        }
        .zone-top strong {
          color: #9ed2ff;
          font-size: 13px;
        }
        .zone-top strong.zone-danger {
          color: var(--danger);
        }
        .zone-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--text);
          font-size: 12px;
        }
        .zone-toggle input {
          accent-color: var(--accent);
        }
        .zone-threshold {
          margin-top: 8px;
        }
        .zone-threshold select {
          height: 30px;
          min-width: 64px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          font-family: inherit;
          font-size: 12px;
          padding: 0 8px;
        }
        .companion-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 10px;
        }
        .track-btn, .alert-btn, .contact-form button {
          height: 38px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--text);
          font-family: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .alert-btn {
          background: rgba(0,150,255,0.14);
          border-color: rgba(0,150,255,0.4);
          color: #9ed2ff;
        }
        .alert-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .status-text {
          margin-top: 9px;
          color: var(--accent);
          font-size: 12px;
          line-height: 1.4;
        }
        .danger-text { color: var(--danger); }
        .contact-form {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
          margin-top: 12px;
        }
        .contact-form input {
          height: 36px;
          width: 100%;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          font-family: inherit;
          font-size: 12px;
          padding: 0 10px;
          outline: none;
        }
        .contact-form input:focus { border-color: var(--accent2); }
        .contact-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 10px;
        }
        .muted-line {
          color: var(--muted);
          font-size: 12px;
        }
        .contact-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 9px 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: rgba(22,30,40,0.72);
        }
        .contact-row strong {
          display: block;
          font-size: 12px;
          color: var(--text);
        }
        .contact-row span {
          display: block;
          margin-top: 2px;
          font-size: 11px;
          color: var(--muted);
        }
        .contact-row button {
          border: none;
          background: transparent;
          color: var(--danger);
          cursor: pointer;
          font-size: 11px;
          font-family: inherit;
        }

        .score-card {
          background: var(--card);
          border-radius: 12px;
          padding: 16px;
          border: 1px solid var(--border);
        }
        .empty-state {
          text-align: center;
          padding: 24px 8px;
          color: var(--muted);
          font-size: 13px;
          line-height: 1.7;
        }
        .empty-icon { font-size: 28px; display: block; margin-bottom: 8px; }

        .score-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }
        .score-num {
          font-size: 48px;
          font-weight: 700;
          line-height: 1;
          font-family: 'JetBrains Mono', 'Courier New', monospace;
          transition: color 0.4s;
        }
        .sector-name { font-size: 14px; font-weight: 500; margin-top: 4px; }
        .sector-type { font-size: 12px; color: var(--muted); }
        .night-badge {
          font-size: 11px;
          color: var(--warn);
          background: rgba(255,170,0,0.12);
          padding: 3px 8px;
          border-radius: 10px;
          margin-top: 4px;
          display: inline-block;
        }
        .verdict-badge {
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
        }

        .bar-track {
          background: var(--border);
          border-radius: 4px;
          height: 6px;
          overflow: hidden;
          margin-bottom: 10px;
        }
        .bar-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.6s ease, background 0.4s;
        }
        .notes-text {
          font-size: 12px;
          color: var(--muted);
          line-height: 1.5;
          margin-bottom: 12px;
        }

        .breakdown {}
        .bd-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 7px 0;
          border-bottom: 1px solid var(--border);
          font-size: 12px;
        }
        .bd-row:last-child { border-bottom: none; }
        .bd-label { color: var(--muted); }
        .bd-val { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 500; }

        .report-btn {
          width: 100%;
          padding: 12px;
          background: transparent;
          border: 1px dashed var(--border);
          border-radius: 8px;
          color: var(--muted);
          font-family: inherit;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .report-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
          background: rgba(0,212,170,0.05);
        }

        .headline {
          font-size: 12px;
          color: var(--muted);
          line-height: 1.5;
          padding: 7px 0;
          border-bottom: 1px solid var(--border);
        }
        .headline:last-child { border-bottom: none; }

        .legend-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 6px;
        }
        .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }

        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: rgba(0,0,0,0.75);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .modal-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 24px;
          width: 360px;
          max-width: 90vw;
        }
        .modal-title { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
        .modal-sub { font-size: 13px; color: var(--muted); margin-bottom: 20px; }

        .type-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 14px;
        }
        .type-btn {
          padding: 10px 8px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          font-family: inherit;
          font-size: 12px;
          cursor: pointer;
          text-align: center;
          transition: all 0.15s;
          line-height: 1.4;
        }
        .type-btn:hover, .type-btn.selected {
          border-color: var(--accent);
          background: rgba(0,212,170,0.1);
          color: var(--accent);
        }
        .type-btn.danger:hover, .type-btn.danger.selected {
          border-color: var(--danger);
          background: rgba(255,68,85,0.1);
          color: var(--danger);
        }

        .modal-textarea {
          width: 100%;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          font-family: inherit;
          font-size: 13px;
          padding: 10px 12px;
          resize: none;
          outline: none;
          margin-bottom: 12px;
        }
        .modal-textarea:focus { border-color: var(--accent2); }

        .modal-actions { display: flex; gap: 8px; }
        .btn-cancel, .btn-submit {
          flex: 1; padding: 10px;
          border-radius: 8px;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: none;
        }
        .btn-cancel { background: var(--card); color: var(--muted); }
        .btn-submit { background: var(--accent); color: #0a0e14; }
        .btn-submit:disabled { opacity: 0.4; cursor: not-allowed; }

        .submitted {
          text-align: center;
          padding: 20px;
          color: var(--accent);
          font-size: 16px;
          font-weight: 600;
        }

        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .loading-pulse { animation: pulse 1.2s ease-in-out infinite; }
      `}</style>
        </aside>
    );
}

function normalizePhoneNumber(value: string) {
    const phone = value.trim();
    if (!phone) return "";

    const hasPlus = phone.startsWith("+");
    const digits = phone.replace(/[^\d]/g, "");
    if (hasPlus) return `+${digits}`;
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    return digits;
}

function formatDuration(milliseconds: number) {
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
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

function distanceToRouteMeters(point: Coords, route: Coords[]) {
    let minDistance = Infinity;

    for (let i = 0; i < route.length - 1; i += 1) {
        const distance = distanceToSegmentMeters(point, route[i], route[i + 1]);
        if (distance < minDistance) minDistance = distance;
    }

    return minDistance;
}

function distanceToSegmentMeters(point: Coords, start: Coords, end: Coords) {
    const metersPerLat = 111320;
    const metersPerLon = 111320 * Math.cos((point.lat * Math.PI) / 180);

    const px = point.lon * metersPerLon;
    const py = point.lat * metersPerLat;
    const sx = start.lon * metersPerLon;
    const sy = start.lat * metersPerLat;
    const ex = end.lon * metersPerLon;
    const ey = end.lat * metersPerLat;

    const dx = ex - sx;
    const dy = ey - sy;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) return Math.hypot(px - sx, py - sy);

    const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSq));
    const projectedX = sx + t * dx;
    const projectedY = sy + t * dy;

    return Math.hypot(px - projectedX, py - projectedY);
}
