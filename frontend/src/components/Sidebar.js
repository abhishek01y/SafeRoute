import { useState } from 'react'

const SAMPLE_LOCATIONS = [
  { name: "Connaught Place", lat: 28.6315, lon: 77.2167 },
  { name: "India Gate", lat: 28.6129, lon: 77.2295 },
  { name: "Lajpat Nagar", lat: 28.5650, lon: 77.2430 },
  { name: "Karol Bagh", lat: 28.6510, lon: 77.1900 },
  { name: "Dwarka", lat: 28.5900, lon: 77.0500 },
  { name: "Rohini", lat: 28.7350, lon: 77.1150 },
  { name: "Saket", lat: 28.5280, lon: 77.2150 },
  { name: "Vasant Kunj", lat: 28.5100, lon: 77.1600 },
  { name: "Chandni Chowk", lat: 28.6560, lon: 77.2300 },
  { name: "Hauz Khas", lat: 28.5490, lon: 77.2050 },
  { name: "Nehru Place", lat: 28.5480, lon: 77.2510 },
  { name: "Pitampura", lat: 28.7010, lon: 77.1400 },
  { name: "Janakpuri", lat: 28.6210, lon: 77.0900 },
  { name: "Mayur Vihar", lat: 28.6100, lon: 77.2900 },
  { name: "Greater Kailash", lat: 28.5570, lon: 77.2400 },
]

const ROUTE_MODES = [
  { value: 'shortest', label: 'Shortest', icon: '⚡', desc: 'Fastest path, minimum distance' },
  { value: 'balanced', label: 'Balanced', icon: '⚖️', desc: 'Optimizes safety & distance' },
  { value: 'safest', label: 'Safest', icon: '🛡️', desc: 'Avoids all high-risk zones' },
]

const TRANSPORT_MODES = [
  { value: 'car', label: 'Car / 4-Wheeler', icon: '🚗', desc: 'All cars, SUVs, autos' },
  { value: 'motorcycle', label: 'Motorcycle / 2-Wheeler', icon: '🏍️', desc: 'Bikes, scooters, cycles' },
  { value: 'walk', label: 'Walk', icon: '🚶', desc: 'Pedestrian routes' },
]

export default function Sidebar({
  startCoords, setStartCoords,
  endCoords, setEndCoords,
  routeMode, setRouteMode,
  transportMode, setTransportMode,
  onFindRoute,
  loading,
  routeResult,
  systemReport,
}) {
  const [startInput, setStartInput] = useState('')
  const [endInput, setEndInput] = useState('')
  const [showStartSuggestions, setShowStartSuggestions] = useState(false)
  const [showEndSuggestions, setShowEndSuggestions] = useState(false)

  const filteredStarts = SAMPLE_LOCATIONS.filter(l =>
    l.name.toLowerCase().includes(startInput.toLowerCase())
  )
  const filteredEnds = SAMPLE_LOCATIONS.filter(l =>
    l.name.toLowerCase().includes(endInput.toLowerCase())
  )

  function handleStartSelect(loc) {
    setStartCoords({ lat: loc.lat, lon: loc.lon })
    setStartInput(loc.name)
    setShowStartSuggestions(false)
  }

  function handleEndSelect(loc) {
    setEndCoords({ lat: loc.lat, lon: loc.lon })
    setEndInput(loc.name)
    setShowEndSuggestions(false)
  }

  function getSafetyColor(score) {
    if (score > 75) return 'text-green-400'
    if (score >= 45) return 'text-yellow-400'
    return 'text-red-400'
  }

  function getSafetyBar(score) {
    if (score > 75) return 'bg-green-500'
    if (score >= 45) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  return (
    <div className="w-96 bg-slate-900 border-r border-slate-700 flex flex-col h-full overflow-hidden">
      <div className="p-5 border-b border-slate-700">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <span>🛡️</span> Delhi Safe Route
        </h1>
        <p className="text-slate-400 text-sm mt-1">AI-Powered Smart Navigation</p>
      </div>

      <div className="p-5 space-y-4 flex-1 overflow-y-auto">
        <div>
          <label className="text-sm text-slate-400 block mb-1">Start Location</label>
          <div className="relative">
            <input
              type="text"
              value={startInput}
              onChange={e => { setStartInput(e.target.value); setShowStartSuggestions(true) }}
              onFocus={() => setShowStartSuggestions(true)}
              onBlur={() => setTimeout(() => setShowStartSuggestions(false), 200)}
              placeholder="Search or pick on map..."
              className="w-full bg-slate-800 text-white px-3 py-2 rounded border border-slate-600 focus:border-blue-500 outline-none text-sm"
            />
            {showStartSuggestions && startInput && (
              <div className="absolute z-20 w-full bg-slate-800 border border-slate-600 rounded mt-1 max-h-48 overflow-y-auto">
                {filteredStarts.map(loc => (
                  <button
                    key={loc.name}
                    className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                    onMouseDown={() => handleStartSelect(loc)}
                  >
                    {loc.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm text-slate-400 block mb-1">Destination</label>
          <div className="relative">
            <input
              type="text"
              value={endInput}
              onChange={e => { setEndInput(e.target.value); setShowEndSuggestions(true) }}
              onFocus={() => setShowEndSuggestions(true)}
              onBlur={() => setTimeout(() => setShowEndSuggestions(false), 200)}
              placeholder="Search or pick on map..."
              className="w-full bg-slate-800 text-white px-3 py-2 rounded border border-slate-600 focus:border-blue-500 outline-none text-sm"
            />
            {showEndSuggestions && endInput && (
              <div className="absolute z-20 w-full bg-slate-800 border border-slate-600 rounded mt-1 max-h-48 overflow-y-auto">
                {filteredEnds.map(loc => (
                  <button
                    key={loc.name}
                    className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                    onMouseDown={() => handleEndSelect(loc)}
                  >
                    {loc.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {startCoords && (
          <div className="text-xs text-slate-500">
            Start: {startCoords.lat.toFixed(4)}, {startCoords.lon.toFixed(4)}
          </div>
        )}
        {endCoords && (
          <div className="text-xs text-slate-500">
            End: {endCoords.lat.toFixed(4)}, {endCoords.lon.toFixed(4)}
          </div>
        )}

        <div>
          <label className="text-sm text-slate-400 block mb-2">Route Preference</label>
          <div className="space-y-2">
            {ROUTE_MODES.map(mode => (
              <button
                key={mode.value}
                onClick={() => setRouteMode(mode.value)}
                className={`w-full text-left px-3 py-2.5 rounded border text-sm transition-all ${
                  routeMode === mode.value
                    ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                    : 'border-slate-600 bg-slate-800 text-slate-400 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{mode.icon}</span>
                  <span className="font-medium">{mode.label}</span>
                </div>
                <div className="text-xs mt-0.5 ml-7 opacity-70">{mode.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-slate-400 block mb-2">Transport Mode</label>
          <div className="grid grid-cols-3 gap-1.5">
            {TRANSPORT_MODES.map(tm => (
              <button
                key={tm.value}
                onClick={() => setTransportMode(tm.value)}
                className={`text-center px-2 py-2 rounded border text-xs transition-all ${
                  transportMode === tm.value
                    ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                    : 'border-slate-600 bg-slate-800 text-slate-400 hover:border-slate-500'
                }`}
              >
                <div className="text-base">{tm.icon}</div>
                <div className="font-medium mt-0.5">{tm.label.split('/')[0].trim()}</div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onFindRoute}
          disabled={!startCoords || !endCoords || loading}
          className={`w-full py-3 rounded-lg font-medium text-sm transition-all ${
            loading
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700'
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></span>
              Calculating...
            </span>
          ) : (
            'Find Route'
          )}
        </button>

        {routeResult && (
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Route Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Distance</span>
                <span className="text-white font-medium">{routeResult.total_distance_km} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Safety Score</span>
                <span className={`font-medium ${getSafetyColor(routeResult.avg_safety_score)}`}>
                  {routeResult.avg_safety_score}/100
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Risk Exposure</span>
                <span className="text-orange-400 font-medium">{routeResult.risk_exposure}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Segments</span>
                <span className="text-white">{routeResult.path_edges?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Mode</span>
                <span className="text-blue-400 capitalize">{routeResult.routing_mode}</span>
              </div>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
              <div
                className={`h-2 rounded-full transition-all ${getSafetyBar(routeResult.avg_safety_score)}`}
                style={{ width: `${routeResult.avg_safety_score}%` }}
              />
            </div>
          </div>
        )}

        {systemReport && (
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 text-sm">
            <h3 className="text-sm font-semibold text-white mb-3">System Dashboard</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-900 rounded p-2 text-center">
                <div className="text-green-400 text-lg font-bold">{systemReport.green_roads_safe}</div>
                <div className="text-xs text-slate-400">Safe Roads</div>
              </div>
              <div className="bg-slate-900 rounded p-2 text-center">
                <div className="text-yellow-400 text-lg font-bold">{systemReport.yellow_roads_moderate}</div>
                <div className="text-xs text-slate-400">Moderate</div>
              </div>
              <div className="bg-slate-900 rounded p-2 text-center">
                <div className="text-red-400 text-lg font-bold">{systemReport.red_roads_dangerous}</div>
                <div className="text-xs text-slate-400">Dangerous</div>
              </div>
              <div className="bg-slate-900 rounded p-2 text-center">
                <div className="text-blue-400 text-lg font-bold">{systemReport.avg_safety_score}</div>
                <div className="text-xs text-slate-400">Avg Safety</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-500">
              Network: {systemReport.total_nodes} nodes, {systemReport.total_edges} edges
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-700 text-center">
        <div className="flex items-center justify-center gap-3 text-xs text-slate-500">
          <div className="legend-item">
            <span className="legend-color bg-green-500"></span> Safe (75+)
          </div>
          <div className="legend-item">
            <span className="legend-color bg-yellow-500"></span> Moderate
          </div>
          <div className="legend-item">
            <span className="legend-color bg-red-500"></span> Risky (&lt;45)
          </div>
        </div>
      </div>
    </div>
  )
}
