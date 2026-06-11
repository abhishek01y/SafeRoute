import { useMemo } from 'react'
import { getSafetyColor, getSafetyBg, calcTime } from '../utils/locations'

const MODE_LABELS = { shortest: 'Shortest', balanced: 'Balanced', safest: 'Safest' }
const MODE_COLORS = { shortest: '#ff3333', balanced: '#ff8800', safest: '#00ff66' }

export default function RightPanel({ routes, activeMode, setActiveMode, transportMode, startName, endName, xaiData, loading }) {
  const unique = useMemo(() => {
    if (!routes) return []
    const MODES = ['shortest', 'balanced', 'safest']
    const result = []
    const seen = []
    MODES.forEach(key => {
      const r = routes?.[key]
      if (!r || !r.path || r.path.length < 2) return
      const dup = seen.some(s => {
        if (s.length !== r.path.length) return false
        const step = Math.max(1, Math.floor(s.length / 20))
        for (let i = 0; i < s.length; i += step) {
          if (Math.abs(s[i].lat - r.path[i].lat) > 0.0001 || Math.abs(s[i].lon - r.path[i].lon) > 0.0001) return false
        }
        return true
      })
      if (dup) return
      seen.push(r.path)
      result.push({ ...r, _key: key })
    })
    return result
  }, [routes])

  const stats = useMemo(() => {
    if (!routes || !routes.shortest || !routes.safest) return null
    const s = routes.shortest; const safe = routes.safest
    const diff = (safe.total_distance_km - s.total_distance_km).toFixed(1)
    const safetyGain = (safe.avg_safety_score - s.avg_safety_score).toFixed(1)
    const safetyImp = s.avg_safety_score > 0 ? ((safe.avg_safety_score - s.avg_safety_score) / s.avg_safety_score * 100).toFixed(0) : '0'
    return {
      diff, safetyGain, safetyImp,
      timeShortest: calcTime(s.total_distance_km, transportMode),
      timeSafest: calcTime(safe.total_distance_km, transportMode),
      distShortest: s.total_distance_km, distSafest: safe.total_distance_km,
      scoreShortest: s.avg_safety_score, scoreSafest: safe.avg_safety_score,
    }
  }, [routes, transportMode])

  const active = unique.find(r => r._key === activeMode) || unique[0] || null

  if (!routes || unique.length === 0) return null

  return (
    <div className="w-[280px] max-h-[calc(100vh-40px)] overflow-y-auto glass-card animate-slideInRight">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <h2 className="text-sm font-bold text-white">Route Analysis</h2>
        </div>
        {startName && endName && (
          <p className="text-[9px] text-slate-500 mt-1.5 truncate">{startName} → {endName}</p>
        )}
      </div>

      <div className="p-3 space-y-4">

        {/* ── Route Overview ── */}
        {active && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: MODE_COLORS[active._key] || '#00ff88' }}></div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Route Overview</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/[0.03] rounded-xl p-2.5 text-center">
                <div className="text-[9px] text-slate-500">Distance</div>
                <div className="text-sm font-bold text-white mt-0.5">{active.total_distance_km?.toFixed(1)} km</div>
              </div>
              <div className="bg-white/[0.03] rounded-xl p-2.5 text-center">
                <div className="text-[9px] text-slate-500">Time</div>
                <div className="text-sm font-bold text-white mt-0.5">~{active.estimated_time_min || calcTime(active.total_distance_km, transportMode)}m</div>
              </div>
              <div className="bg-white/[0.03] rounded-xl p-2.5 text-center">
                <div className="text-[9px] text-slate-500">Safety</div>
                <div className={`text-sm font-bold mt-0.5 ${getSafetyColor(active.avg_safety_score)}`}>{active.avg_safety_score}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Route Comparison ── */}
        {stats && parseFloat(stats.safetyGain) > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Route Comparison</span>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-3 space-y-2.5">
              {/* Safe Route */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#00ff66]"></span>
                  <span className="text-xs text-slate-300">Safe</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white font-medium">{stats.distSafest} km</span>
                  <span className="text-[10px] text-[#00ff88] font-semibold">{stats.scoreSafest}/100</span>
                </div>
              </div>
              {/* Shortest Route */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#ff3333]"></span>
                  <span className="text-xs text-slate-300">Shortest</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white font-medium">{stats.distShortest} km</span>
                  <span className="text-[10px] text-[#ff3333] font-semibold">{stats.scoreShortest}/100</span>
                </div>
              </div>
              {/* Difference */}
              <div className="border-t border-white/5 pt-2 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">Difference</span>
                <div className="flex items-center gap-2">
                  {parseFloat(stats.diff) > 0 && <span className="text-[10px] text-amber-400">+{stats.diff} km</span>}
                  <span className="text-[11px] text-[#00ff88] font-bold">+{stats.safetyGain} safer</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Safety Impact ── */}
        {stats && parseFloat(stats.safetyGain) > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Safety Impact</span>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300">🚫 High Risk Roads Avoided</span>
                <span className="text-xs text-white font-bold">
                  {xaiData?.high_risk_roads_avoided ?? (parseFloat(stats.diff) > 0 ? Math.ceil(parseFloat(stats.diff) * 2) : '—')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300">⚠️ Incidents Avoided</span>
                <span className="text-xs text-white font-bold">
                  {xaiData?.incidents_avoided ?? (parseFloat(stats.safetyGain) > 5 ? Math.floor(parseFloat(stats.safetyGain) / 3) : '—')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300">📈 Safety Improvement</span>
                <span className="text-xs text-[#00ff88] font-bold">+{stats.safetyImp}%</span>
              </div>
              {/* Visual bar */}
              <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden mt-1">
                <div className="h-full rounded-full bg-gradient-to-r from-[#ff3333] via-[#ff8800] to-[#00ff66] transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.max(10, stats.scoreSafest))}%` }}></div>
              </div>
              <div className="flex justify-between text-[9px] text-slate-600">
                <span>Risky</span>
                <span>Safe</span>
              </div>
            </div>
          </div>
        )}

        {/* ── XAI Analysis ── */}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-3 h-3 border-2 border-[#00ff88]/30 border-t-[#00ff88] rounded-full animate-spin"></span>
            Analyzing safety factors...
          </div>
        )}
        {xaiData?.explanations?.length > 0 && !loading && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">XAI Analysis</span>
            </div>
            <div className="space-y-1.5">
              {xaiData.explanations.map((exp, i) => (
                <div key={i} className="flex items-start gap-2 bg-white/[0.03] rounded-xl p-2.5">
                  <span className="text-sm mt-0.5">{['📊', '🛑', '⚠️', 'ℹ️'][i] || 'ℹ️'}</span>
                  <span className="text-[10px] text-slate-300 leading-relaxed">{exp}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Route Mode Switcher ── */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Routes</span>
          </div>
          <div className="space-y-1.5">
            {unique.map(r => {
              const isActive = r._key === activeMode
              const color = MODE_COLORS[r._key] || '#666'
              return (
                <button key={r._key} onClick={() => setActiveMode(r._key)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs transition-all btn-press ${
                    isActive
                      ? 'bg-white/[0.06] shadow-sm'
                      : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04] text-slate-400'
                  }`}
                  style={isActive ? { borderColor: `${color}44`, background: `${color}08` } : {}}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: color }}></div>
                    <span className={isActive ? 'text-white font-medium' : ''}>{MODE_LABELS[r._key] || r._key}</span>
                    {isActive && <span className="text-[9px] text-[#00ff88]">● Active</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">{r.total_distance_km?.toFixed(1)} km</span>
                    <span className={`font-semibold ${getSafetyColor(r.avg_safety_score)}`}>{r.avg_safety_score}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
