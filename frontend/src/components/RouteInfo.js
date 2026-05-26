function calcTime(distKm, transport) {
  const speed = { car: 20, motorcycle: 25, walk: 5 }[transport] || 20
  return Math.round((distKm / speed) * 60)
}

function getSafetyColor(score) {
  if (score > 75) return 'text-green-400'
  if (score >= 55) return 'text-yellow-400'
  return 'text-red-400'
}

function getSafetyBar(score) {
  if (score > 75) return 'bg-green-500'
  if (score >= 55) return 'bg-yellow-500'
  return 'bg-red-500'
}

const MODES = ['shortest', 'balanced', 'safest']

function pathsEqual(a, b) {
  if (a.length !== b.length) return false
  const step = Math.max(1, Math.floor(a.length / 20))
  for (let i = 0; i < a.length; i += step) {
    if (Math.abs(a[i].lat - b[i].lat) > 0.0001 || Math.abs(a[i].lon - b[i].lon) > 0.0001) return false
  }
  return true
}

function getUniqueRoutes(routes) {
  const result = []
  const seen = []
  MODES.forEach(key => {
    const r = routes?.[key]
    if (!r || !r.path || r.path.length < 2) return
    if (seen.some(s => pathsEqual(s.path, r.path))) return
    seen.push(r)
    result.push({ ...r, _key: key })
  })
  return result
}

const MODE_LABELS = { shortest: 'Standard', balanced: 'Balanced', safest: 'Safest' }
const COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-green-500']

export default function RouteInfo({ routes, activeMode, setActiveMode, transportMode }) {
  if (!routes) return null

  const unique = getUniqueRoutes(routes)
  const multiple = unique.length > 1
  const hasShortest = routes.shortest && !routes.shortest.error
  const safest = routes.safest && !routes.safest.error ? routes.safest : null
  const shortest = hasShortest ? routes.shortest : null

  const safetyDiff = safest && shortest ? (safest.avg_safety_score - shortest.avg_safety_score).toFixed(1) : null

  return (
    <div className="bg-slate-900 border-t border-slate-700/50 p-3">
      {safetyDiff !== null && shortest && safest && (
        <div className="flex items-center justify-center gap-6 mb-3 pb-2 border-b border-slate-700/30 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span className="text-slate-400">Standard Route</span>
            <span className="text-white font-medium">{shortest.total_distance_km} km</span>
            <span className={getSafetyColor(shortest.avg_safety_score)}>{shortest.avg_safety_score}/100</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-slate-400">Safe Route</span>
            <span className="text-white font-medium">{safest.total_distance_km} km</span>
            <span className={getSafetyColor(safest.avg_safety_score)}>{safest.avg_safety_score}/100</span>
          </div>
          {parseFloat(safetyDiff) > 0 && (
            <span className="text-green-400 font-medium">+{safetyDiff} safer</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 justify-center">
        {unique.map((data, i) => {
          const time = data.estimated_time_min || calcTime(data.total_distance_km, transportMode)
          const label = multiple ? (MODE_LABELS[data._key] || `Route ${i + 1}`) : 'Route'
          const isActive = data._key === activeMode

          return (
            <button
              key={data._key}
              onClick={() => setActiveMode(data._key)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm transition-all ${
                isActive
                  ? 'bg-slate-800 border-slate-500 shadow-lg shadow-slate-900/50'
                  : 'border-slate-700/50 bg-slate-800/30 hover:bg-slate-800 cursor-pointer'
              }`}
            >
              <span className={`w-3 h-3 rounded-full ${COLORS[i % COLORS.length]}`}></span>
              <div className="text-left">
                <div className="text-white font-medium text-xs">{label}</div>
                <div className="text-[11px] text-slate-500">{data.total_distance_km} km</div>
              </div>
              <div className="text-center px-2">
                <div className="text-[10px] text-slate-500">Time</div>
                <div className="text-xs text-white font-medium">{time}m</div>
              </div>
              <div className="text-right min-w-[50px]">
                <div className="text-[10px] text-slate-500">Safety</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden w-12">
                    <div className={`h-full rounded-full ${getSafetyBar(data.avg_safety_score)}`} style={{ width: `${data.avg_safety_score}%` }}></div>
                  </div>
                  <span className={`text-xs font-medium ${getSafetyColor(data.avg_safety_score)}`}>{data.avg_safety_score}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}