import { useMemo } from 'react'
import { getSafetyColor, calcTime, computeTurns } from '../utils/locations'

export default function BottomSummary({ routes, activeMode, transportMode }) {
  const data = useMemo(() => {
    if (!routes || !routes[activeMode]) return null
    const r = routes[activeMode]
    const s = routes.shortest
    const time = r.estimated_time_min || calcTime(r.total_distance_km, transportMode)
    const turns = computeTurns(r.path || [])
    const riskAvoided = s && !s.error
      ? Math.round(Math.max(0, (s.avg_safety_score || 0) - (r.avg_safety_score || 0)))
      : '—'
    return {
      distance: r.total_distance_km,
      time,
      safety: r.avg_safety_score,
      turns,
      riskAvoided,
    }
  }, [routes, activeMode, transportMode])

  if (!data) return null

  const items = [
    { label: 'Distance', value: `${data.distance?.toFixed(1)} km`, icon: '📏' },
    { label: 'Time', value: `~${data.time} min`, icon: '⏱' },
    { label: 'Safety', value: `${data.safety}/100`, icon: '🛡️', color: getSafetyColor(data.safety) },
    { label: 'Risk Avoided', value: data.riskAvoided !== '—' ? `${data.riskAvoided} pts` : '—', icon: '🚫' },
    { label: 'Turns', value: `${data.turns}`, icon: '↻' },
  ]

  return (
    <div className="glass-card animate-fadeInUp px-4 py-3">
      <div className="flex items-center gap-6 flex-wrap">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-base">{item.icon}</span>
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider">{item.label}</span>
              <span className={`text-sm font-bold ${item.color || 'text-white'}`}>{item.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
