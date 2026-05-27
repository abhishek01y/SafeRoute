import { useMemo } from 'react'

const SAFETY_LABELS = {
  standard: { label: 'Standard', icon: '🛡️', color: 'text-blue-400' },
  women_safety: { label: 'Women Safety', icon: '👩', color: 'text-pink-400' },
  domestic_tourist: { label: 'Domestic Tourist', icon: '🧳', color: 'text-amber-400' },
}

export default function XAIPanel({ xaiData, loading, safetyMode }) {
  if (!xaiData && !loading) return null

  const gain = useMemo(() => {
    if (!xaiData || !xaiData.shortest_distance_km || !xaiData.selected_distance_km) return null
    const distDiff = xaiData.selected_distance_km - xaiData.shortest_distance_km
    const safetyGain = xaiData.safety_gain || 0
    return { distDiff: distDiff.toFixed(1), safetyGain: safetyGain.toFixed(1) }
  }, [xaiData])

  return (
    <div className="bg-slate-900/95 border-t border-slate-700/50 backdrop-blur-xl animate-fadeIn">
      <div className="max-w-5xl mx-auto px-5 py-3">
        {loading ? (
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin"></span>
            <span>Analyzing route safety factors...</span>
          </div>
        ) : xaiData ? (
          <div className="flex items-center gap-6 flex-wrap">
            {/* Header */}
            <div className="flex items-center gap-2">
              <span className="text-base">🧠</span>
              <span className="text-xs font-semibold text-white">XAI Analysis</span>
              <span className="text-[10px] text-slate-500 glass rounded-lg px-2 py-0.5">{xaiData.mode} mode</span>
              {safetyMode && SAFETY_LABELS[safetyMode] && (
                <span className={`text-[10px] glass rounded-lg px-2 py-0.5 ${SAFETY_LABELS[safetyMode].color}`}>
                  {SAFETY_LABELS[safetyMode].icon} {SAFETY_LABELS[safetyMode].label}
                </span>
              )}
            </div>

            {/* Stats */}
            {gain && (
              <>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span>📏 Extra distance:</span>
                  <span className="text-amber-400 font-semibold">{gain.distDiff > 0 ? '+' : ''}{gain.distDiff} km</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span>🛡️ Safety gain:</span>
                  <span className={`font-semibold ${parseFloat(gain.safetyGain) > 0 ? 'text-green-400' : 'text-slate-400'}`}>
                    +{gain.safetyGain}/100
                  </span>
                </div>
              </>
            )}

            {/* Explanations */}
            {xaiData.explanations && xaiData.explanations.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {xaiData.explanations.map((exp, i) => (
                  <span key={i}
                    className="text-[11px] glass rounded-lg px-2.5 py-1 text-slate-300 border-slate-700/30 flex items-center gap-1.5">
                    <span>{['📊', '🛑', '⚠️', 'ℹ️'][i] || 'ℹ️'}</span>
                    {exp}
                  </span>
                ))}
              </div>
            )}

            {/* Safety score bar */}
            {xaiData.selected_safety_score && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[10px] text-slate-500">Overall</span>
                <div className="w-20 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${xaiData.selected_safety_score}%`,
                      background: xaiData.selected_safety_score > 75
                        ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                        : xaiData.selected_safety_score > 55
                        ? 'linear-gradient(90deg, #eab308, #ca8a04)'
                        : 'linear-gradient(90deg, #ef4444, #dc2626)'
                    }}></div>
                </div>
                <span className={`text-xs font-bold ${
                  xaiData.selected_safety_score > 75 ? 'text-green-400' :
                  xaiData.selected_safety_score > 55 ? 'text-yellow-400' : 'text-red-400'
                }`}>{xaiData.selected_safety_score}/100</span>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
