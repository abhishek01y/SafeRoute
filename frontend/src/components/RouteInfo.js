function calcTime(distKm) {
  return Math.round((distKm / 35) * 60)
}

export default function RouteInfo({ routes, activeMode, setActiveMode }) {
  if (!routes) return null

  const modes = [
    { key: 'shortest', color: 'bg-blue-500' },
    { key: 'balanced', color: 'bg-purple-500' },
    { key: 'safest', color: 'bg-green-500' },
  ]

  const available = modes.filter(m => routes[m.key] && !routes[m.key].error)
  const multiple = available.length > 1

  return (
    <div className="bg-slate-900 border-t border-slate-700 p-3">
      <div className="flex items-center gap-3 justify-center">
        {available.map((mode, i) => {
          const data = routes[mode.key]
          const time = data.estimated_time_min || calcTime(data.total_distance_km)
          const label = multiple ? `Route ${i + 1}` : 'Route'

          return (
            <button
              key={mode.key}
              onClick={() => setActiveMode(mode.key)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg border text-sm transition-all ${
                activeMode === mode.key
                  ? 'bg-slate-800 border-slate-500'
                  : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 cursor-pointer'
              }`}
            >
              <span className={`w-3 h-3 rounded-full ${mode.color}`}></span>
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
