export default function XAIPanel({ xaiData, loading }) {
  if (!xaiData && !loading) return null

  return (
    <div className="bg-slate-900 border-t border-slate-700 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm">🧠</span>
          <h3 className="text-sm font-semibold text-white">Explainable AI - Route Decision</h3>
          {xaiData && (
            <span className="text-xs text-slate-500">
              ({xaiData.mode} mode)
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="inline-block w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></span>
            Analyzing route safety factors...
          </div>
        ) : xaiData ? (
          <div className="space-y-2">
            <div className="flex items-center gap-4 text-sm mb-2">
              <span className="text-slate-400">
                Distance trade-off:
                <span className="text-yellow-400 font-medium ml-1">
                  +{(xaiData.selected_distance_km - xaiData.shortest_distance_km).toFixed(1)} km
                </span>
              </span>
              <span className="text-slate-400">
                Safety gain:
                <span className="text-green-400 font-medium ml-1">
                  +{xaiData.safety_gain?.toFixed(1) || '?'}/100
                </span>
              </span>
            </div>

            {xaiData.explanations && xaiData.explanations.length > 0 ? (
              <div className="space-y-1.5">
                {xaiData.explanations.map((exp, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-sm bg-slate-800 rounded px-3 py-2 border border-slate-700"
                  >
                    <span className="text-slate-500 mt-0.5 shrink-0">
                      {i === 0 ? '📊' : i === 1 ? '🛑' : i === 2 ? '⚠️' : 'ℹ️'}
                    </span>
                    <span className="text-slate-300">{exp}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-400">No specific risk factors identified on this route.</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
