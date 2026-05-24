function calcTime(distKm) {
  return Math.round((distKm / 35) * 60)
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

const COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-green-500']

export default function RouteInfo({ routes, activeMode, setActiveMode }) {
  if (!routes) return null

  const unique = getUniqueRoutes(routes)
  const multiple = unique.length > 1

  return (
    <div className="bg-slate-900 border-t border-slate-700 p-3">
      <div className="flex items-center gap-3 justify-center">
        {unique.map((data, i) => {
          const time = data.estimated_time_min || calcTime(data.total_distance_km)
          const label = multiple ? `Route ${i + 1}` : 'Route'
          const isActive = data._key === activeMode

          return (
            <button
              key={data._key}
              onClick={() => setActiveMode(data._key)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg border text-sm transition-all ${
                isActive
                  ? 'bg-slate-800 border-slate-500'
                  : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 cursor-pointer'
              }`}
            >
              <span className={`w-3 h-3 rounded-full ${COLORS[i % COLORS.length]}`}></span>
              <div className="text-left">
                <div className="text-white font-medium">{label}</div>
                <div className="text-xs text-slate-400">{data.total_distance_km} km</div>
              </div>
              <div className="text-center px-2">
                <div className="text-xs text-slate-400">Time</div>
                <div className="text-xs text-white font-medium">{time} min</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Safety</div>
                <div className={`text-xs font-medium ${
                  data.avg_safety_score > 75 ? 'text-green-400' :
                  data.avg_safety_score >= 45 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {data.avg_safety_score}/100
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
