import { useState, useMemo } from 'react'
import { LOCATION_CATEGORIES, FLAT_LOCATIONS } from '../utils/locations'

const TRANSPORT_MODES = [
  { value: 'car', label: 'Car', icon: '🚗', desc: '4-wheeler' },
  { value: 'motorcycle', label: 'Bike', icon: '🏍️', desc: '2-wheeler' },
  { value: 'walk', label: 'Walk', icon: '🚶', desc: 'Pedestrian' },
]

export default function Sidebar({
  startCoords, endCoords, startName, endName,
  setStartCoords, setEndCoords, setStartName, setEndName,
  transportMode, setTransportMode,
  onFindRoute, loading,
  onLocSelect, onQuickRoute, quickRoutes,
  recentRoutes, onSwap, onClose,
}) {
  const [tab, setTab] = useState('route')
  const [startInput, setStartInput] = useState(startName || '')
  const [endInput, setEndInput] = useState(endName || '')
  const [showStart, setShowStart] = useState(false)
  const [showEnd, setShowEnd] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [expandedCat, setExpandedCat] = useState(null)

  const filteredStart = useMemo(() => {
    if (!startInput) return []
    const q = startInput.toLowerCase()
    return FLAT_LOCATIONS.filter(l => l.name.toLowerCase().includes(q)).slice(0, 8)
  }, [startInput])

  const filteredEnd = useMemo(() => {
    if (!endInput) return []
    const q = endInput.toLowerCase()
    return FLAT_LOCATIONS.filter(l => l.name.toLowerCase().includes(q)).slice(0, 8)
  }, [endInput])

  function handleStartSelect(loc) {
    onLocSelect('start', loc)
    setStartInput(loc.name)
    setShowStart(false)
  }

  function handleEndSelect(loc) {
    onLocSelect('end', loc)
    setEndInput(loc.name)
    setShowEnd(false)
  }

  function handleQuick(qr) {
    onQuickRoute(qr)
    setStartInput(qr.start)
    setEndInput(qr.end)
    setShowPresets(false)
  }

  const ready = startCoords && endCoords

  return (
    <div className="w-[380px] h-full flex flex-col bg-slate-900/95 border-r border-slate-700/50 backdrop-blur-xl">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-slate-700/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-lg shadow-lg shadow-blue-500/20">🛡️</div>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">Safe Route</h1>
              <p className="text-[11px] text-slate-500">Delhi Smart Navigation</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-slate-500 hover:text-white p-1"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700/30 px-2">
        {[
          { id: 'route', label: 'Route', icon: '📍' },
          { id: 'presets', label: 'Presets', icon: '⚡' },
          { id: 'recent', label: 'Recent', icon: '🕐' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 text-xs font-medium transition-all relative ${tab === t.id ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
            <span className="mr-1">{t.icon}</span>{t.label}
            {tab === t.id && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-blue-500 rounded-full"></span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* === TAB: ROUTE === */}
        {tab === 'route' && (
          <>
            {/* Start */}
            <div>
              <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-lg shadow-green-500/30"></span> Start
              </label>
              <div className="relative">
                <input value={startInput} onChange={e => { setStartInput(e.target.value); setShowStart(true) }}
                  onFocus={() => setShowStart(true)} onBlur={() => setTimeout(() => setShowStart(false), 200)}
                  placeholder="Search location..." className="w-full bg-slate-800/80 text-white px-3 py-2.5 rounded-xl border border-slate-600/50 focus:border-green-500/50 outline-none text-sm transition-all placeholder:text-slate-600" />
                {showStart && startInput && filteredStart.length > 0 && (
                  <div className="absolute z-20 w-full bg-slate-800 border border-slate-600/50 rounded-xl mt-1 max-h-52 overflow-y-auto shadow-2xl animate-fadeIn">
                    {filteredStart.map(loc => (
                      <button key={loc.name} onMouseDown={() => handleStartSelect(loc)}
                        className="w-full text-left px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors first:rounded-t-xl last:rounded-b-xl">
                        <span className="text-slate-500 mr-2">📍</span>{loc.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Swap */}
            <div className="flex justify-center -my-1">
              <button onClick={onSwap} className="w-9 h-9 rounded-full glass flex items-center justify-center text-slate-400 hover:text-blue-400 hover:border-blue-500/30 transition-all btn-press">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
              </button>
            </div>

            {/* End */}
            <div>
              <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full shadow-lg ${endCoords ? 'bg-red-500 shadow-red-500/30' : 'bg-slate-600'}`}></span> Destination
              </label>
              <div className="relative">
                <input value={endInput} onChange={e => { setEndInput(e.target.value); setShowEnd(true) }}
                  onFocus={() => setShowEnd(true)} onBlur={() => setTimeout(() => setShowEnd(false), 200)}
                  placeholder="Search location..." className="w-full bg-slate-800/80 text-white px-3 py-2.5 rounded-xl border border-slate-600/50 focus:border-red-500/50 outline-none text-sm transition-all placeholder:text-slate-600" />
                {showEnd && endInput && filteredEnd.length > 0 && (
                  <div className="absolute z-20 w-full bg-slate-800 border border-slate-600/50 rounded-xl mt-1 max-h-52 overflow-y-auto shadow-2xl animate-fadeIn">
                    {filteredEnd.map(loc => (
                      <button key={loc.name} onMouseDown={() => handleEndSelect(loc)}
                        className="w-full text-left px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors first:rounded-t-xl last:rounded-b-xl">
                        <span className="text-slate-500 mr-2">📍</span>{loc.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Selected coords */}
            {startCoords && (
              <div className="text-[11px] text-slate-600 bg-slate-800/30 rounded-lg px-3 py-1.5">
                Start: {startCoords.lat.toFixed(4)}, {startCoords.lng.toFixed(4)}
              </div>
            )}

            {/* Transport */}
            <div>
              <label className="text-xs text-slate-400 mb-2 block">Transport Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {TRANSPORT_MODES.map(tm => (
                  <button key={tm.value} onClick={() => setTransportMode(tm.value)}
                    className={`text-center py-3 rounded-xl border text-xs transition-all btn-press ${
                      transportMode === tm.value
                        ? 'border-blue-500/50 bg-blue-500/10 text-blue-300 shadow-lg shadow-blue-500/10'
                        : 'border-slate-600/30 bg-slate-800/50 text-slate-400 hover:border-slate-500/50 hover:text-slate-300'
                    }`}>
                    <div className="text-xl mb-1">{tm.icon}</div>
                    <div className="font-medium">{tm.label}</div>
                    <div className="text-[10px] opacity-60">{tm.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Find Route */}
            <button onClick={onFindRoute} disabled={!ready || loading}
              className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all btn-press ${
                loading ? 'bg-slate-800 text-slate-500 cursor-not-allowed' :
                ready ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-500 hover:to-blue-600 shadow-lg shadow-blue-500/20 active:shadow-md' :
                'bg-slate-800/50 text-slate-600 cursor-not-allowed border border-slate-700/30'
              }`}>
              {loading ? (
                <span className="flex items-center justify-center gap-2.5">
                  <span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin"></span>
                  Finding safest route...
                </span>
              ) : ready ? '🚀 Find Route' : 'Select start & destination'}
            </button>

            {/* Browse locations */}
            <div>
              <button onClick={() => setExpandedCat(expandedCat ? null : 'all')}
                className="w-full text-xs text-slate-500 hover:text-slate-300 py-2 flex items-center justify-center gap-1 transition-colors">
                <span>📋</span> Browse all locations
              </button>
              {expandedCat && (
                <div className="space-y-1 mt-1 max-h-48 overflow-y-auto">
                  {LOCATION_CATEGORIES.map(cat => (
                    <div key={cat.name}>
                      <button onClick={() => setExpandedCat(expandedCat === cat.name ? null : cat.name)}
                        className="w-full text-left text-xs text-slate-400 hover:text-white py-1.5 px-2 rounded-lg hover:bg-slate-800/50 transition-colors">
                        {cat.name} <span className="text-slate-600">({cat.locations.length})</span>
                      </button>
                      {expandedCat === cat.name && cat.locations.map(loc => (
                        <button key={loc.name} onMouseDown={() => { handleStartSelect(loc); setExpandedCat(null) }}
                          className="w-full text-left text-xs text-slate-500 hover:text-slate-300 py-1 px-3 pl-6 rounded hover:bg-slate-800/30 transition-colors">
                          {loc.name}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* === TAB: PRESETS === */}
        {tab === 'presets' && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 mb-3">Popular routes across Delhi</p>
            {quickRoutes.map((qr, i) => (
              <button key={i} onClick={() => handleQuick(qr)}
                className="w-full glass glass-hover rounded-xl p-3.5 text-left transition-all btn-press">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white font-medium">⚡ {qr.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      <span className="text-green-400">●</span> {qr.start} <span className="text-slate-600">→</span> <span className="text-red-400">●</span> {qr.end}
                    </div>
                  </div>
                  <span className="text-slate-600 text-lg">→</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* === TAB: RECENT === */}
        {tab === 'recent' && (
          <div className="space-y-2">
            {recentRoutes.length === 0 ? (
              <div className="text-center py-8 text-slate-600">
                <div className="text-3xl mb-2">🗺️</div>
                <p className="text-xs">No recent routes yet</p>
              </div>
            ) : (
              recentRoutes.map((r, i) => (
                <button key={i} onClick={() => {
                  const loc = FLAT_LOCATIONS.find(l => l.name === r.start)
                  const loc2 = FLAT_LOCATIONS.find(l => l.name === r.end)
                  if (loc && loc2) {
                    onLocSelect('start', loc)
                    setStartInput(r.start)
                    onLocSelect('end', loc2)
                    setEndInput(r.end)
                    setTab('route')
                  }
                }}
                  className="w-full glass glass-hover rounded-xl p-3 text-left transition-all btn-press">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 text-lg">🕐</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{r.start} <span className="text-slate-600">→</span> {r.end}</div>
                      <div className="text-[10px] text-slate-600">{new Date(r.ts).toLocaleTimeString()} · <span className="capitalize">{r.transport}</span></div>
                    </div>
                    <span className="text-slate-600">→</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-700/30">
        <div className="flex items-center justify-between text-[10px] text-slate-600">
          <span>🛡️ Delhi Safe Route v2</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulseGlow"></span>
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  )
}
