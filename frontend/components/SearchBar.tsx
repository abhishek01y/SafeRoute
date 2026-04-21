import { useState } from "react";
import { Coords } from "../pages/index";

interface Props {
    onRouteSearch: (from: Coords, to: Coords) => void;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Geocode a place name to lat/lon using Mapbox, biased to Chandigarh
async function geocode(query: string): Promise<Coords | null> {
    const full = query.toLowerCase().includes("chandigarh")
        ? query
        : `${query}, Chandigarh, India`;

    try {
        const resp = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(full)}.json` +
            `?access_token=${MAPBOX_TOKEN}&country=IN&bbox=76.70,30.65,76.90,30.82&limit=1`
        );
        const data = await resp.json();
        const center = data.features?.[0]?.center;
        if (!center) return null;
        return { lat: center[1], lon: center[0] };
    } catch {
        return null;
    }
}

export default function SearchBar({ onRouteSearch }: Props) {
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSearch() {
        if (!from.trim() || !to.trim()) {
            setError("Enter both From and To locations");
            return;
        }
        setLoading(true);
        setError("");

        const [fromCoords, toCoords] = await Promise.all([geocode(from), geocode(to)]);

        setLoading(false);

        if (!fromCoords) { setError(`Could not find: "${from}"`); return; }
        if (!toCoords) { setError(`Could not find: "${to}"`); return; }

        onRouteSearch(fromCoords, toCoords);
    }

    function handleKey(e: React.KeyboardEvent) {
        if (e.key === "Enter") handleSearch();
    }

    return (
        <div className="search-bar">
            <div className="input-group">
                <label>FROM</label>
                <input
                    type="text"
                    value={from}
                    placeholder="e.g. Sector 17"
                    onChange={e => setFrom(e.target.value)}
                    onKeyDown={handleKey}
                />
            </div>

            <div className="divider">→</div>

            <div className="input-group">
                <label>TO</label>
                <input
                    type="text"
                    value={to}
                    placeholder="e.g. Sector 43"
                    onChange={e => setTo(e.target.value)}
                    onKeyDown={handleKey}
                />
            </div>

            <button className="go-btn" onClick={handleSearch} disabled={loading}>
                {loading ? "..." : "Find Safe Route"}
            </button>

            {error && <span className="err">{error}</span>}

            <style jsx>{`
        .search-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          max-width: 680px;
        }
        .input-group {
          flex: 1;
          position: relative;
        }
        .input-group label {
          position: absolute;
          top: -9px;
          left: 10px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1px;
          color: var(--muted);
          background: var(--surface);
          padding: 0 4px;
        }
        .input-group input {
          width: 100%;
          height: 40px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          font-family: inherit;
          font-size: 13px;
          padding: 0 12px;
          outline: none;
          transition: border-color 0.2s;
        }
        .input-group input:focus { border-color: var(--accent2); }
        .input-group input::placeholder { color: var(--muted); }

        .divider {
          color: var(--muted);
          font-size: 16px;
          flex-shrink: 0;
        }

        .go-btn {
          height: 40px;
          padding: 0 20px;
          background: var(--accent);
          color: #0a0e14;
          font-family: inherit;
          font-weight: 700;
          font-size: 13px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          white-space: nowrap;
          transition: opacity 0.2s;
          flex-shrink: 0;
        }
        .go-btn:hover:not(:disabled) { opacity: 0.85; }
        .go-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .err {
          font-size: 12px;
          color: var(--danger);
          white-space: nowrap;
        }
      `}</style>
        </div>
    );
}