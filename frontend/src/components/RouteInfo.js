import { useMemo } from 'react'
import { getSafetyColor, getSafetyBg, calcTime } from '../utils/locations'

const MODES = ['shortest', 'balanced', 'safest']
const MODE_LABELS = { shortest: 'Standard', balanced: 'Balanced', safest: 'Safest' }
const COLORS = ['#3b82f6', '#a855f7', '#22c55e']
const MODE_ICONS = { shortest: '⚡', balanced: '⚖️', safest: '🛡️' }

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

export default function RouteInfo({ routes, activeMode, setActiveMode, transportMode, startName, endName }) {
  const unique = useMemo(() => getUniqueRoutes(routes), [routes])

  const stats = useMemo(() => {
    if (!routes) return null
    const s = routes.shortest
    const safe = routes.safest
    if (!s || !safe || s.error || safe.error) return null
    return {
      diff: (safe.total_distance_km - s.total_distance_km).toFixed(1),
      safetyGain: (safe.avg_safety_score - s.avg_safety_score).toFixed(1),
      timeShortest: calcTime(s.total_distance_km, transportMode),
      timeSafest: calcTime(safe.total_distance_km, transportMode),
    }
  }, [routes, transportMode])

  if (!routes || unique.length === 0) return null

  return (
    <div className="bg-slate-900/95 border-t border-slate-700/50 backdrop-blur-xl">
      {/* Comparison header */}
      {stats && parseFloat(stats.safetyGain) > 0 && (
        <div className="px-5 pt-3 pb-1">
          <div className="glass rounded-xl px-4 py-2.5 flex items-center justify-center gap-6 text-xs animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm"></span>
              <span className="text-slate-400">Standard</span>
              <span className="text-white font-semibold">{routes.shortest.total_distance_km} km</span>
              <span className={`font-medium ${getSafetyColor(routes.shortest.avg_safety_score)}`}>{routes.shortest.avg_safety_score}/100</span>
            </div>
            {stats.diff !== '0.0' && (
              <span className="text-slate-600">→</span>
            )}
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-sm"></span>
              <span className="text-slate-400">Safe</span>
              <span className="text-white font-semibold">{routes.safest.total_distance_km} km</span>
              <span className={`font-medium ${getSafetyColor(routes.safest.avg_safety_score)}`}>{routes.safest.avg_safety_score}/100</span>
            </div>
            {parseFloat(stats.safetyGain) > 0 && (
              <span className="text-green-400 font-semibold bg-green-500/10 px-2.5 py-1 rounded-lg text-[11px]">
                +{stats.safetyGain} safer
              </span>
            )}
            {stats.diff !== '0.0' && (
              <span className="text-amber-400 text-[11px]">+{stats.diff} km extra</span>
            )}
          </div>
        </div>
      )}

      {/* Route cards */}
      <div className="px-4 py-2.5 flex items-center gap-3 overflow-x-auto">
        {unique.map((data, i) => {
          const time = data.estimated_time_min || calcTime(data.total_distance_km, transportMode)
          const label = MODE_LABELS[data._key] || `Route ${i + 1}`
          const isActive = data._key === activeMode
          const color = COLORS[i % 3]
          const icon = MODE_ICONS[data._key] || '📍'

          return (
            <button key={data._key} onClick={() => setActiveMode(data._key)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border text-sm transition-all btn-press flex-shrink-0 ${
                isActive
                  ? 'glass border-slate-500/50 shadow-2xl'
                  : 'border-slate-700/20 bg-slate-800/30 hover:bg-slate-800/60 hover:border-slate-600/30 cursor-pointer'
              }`}
              style={isActive ? { borderColor: `${color}44` } : {}}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
                style={{ background: `${color}15` }}>
                {icon}
              </div>
              <div className="text-left min-w-[60px]">
                <div className="text-white font-semibold text-xs">{label}</div>
                <div className="text-[11px] text-slate-500">{data.total_distance_km} km · ~{time}m</div>
              </div>
              <div className="text-right min-w-[70px]">
                <div className="text-[10px] text-slate-500 mb-1">Safety</div>
                <div className="flex items-center gap-1.5">
                  <div className="w-14 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${getSafetyBg(data.avg_safety_score)}`}
                      style={{ width: `${data.avg_safety_score}%` }}></div>
                  </div>
                  <span className={`text-xs font-bold ${getSafetyColor(data.avg_safety_score)}`}>{data.avg_safety_score}</span>
                </div>
              </div>
              {/* Quick difference indicator */}
              {i === 0 && stats && parseFloat(stats.safetyGain) > 0 && (
                <div className="text-[10px] text-slate-600 bg-slate-700/30 rounded-lg px-2 py-1">
                  {stats.safetyGain > 0 ? '+' : ''}{stats.safetyGain} vs safest
                </div>
              )}
            </button>
          )
        })}

        {/* Route info */}
        {startName && endName && (
          <div className="text-[11px] text-slate-500 flex-shrink-0 px-2">
            {startName} <span className="text-slate-600">→</span> {endName}
          </div>
        )}
      </div>
    </div>
  )
}
