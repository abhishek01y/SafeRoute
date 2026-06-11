import { useState, useMemo } from 'react'
import { LOCATION_CATEGORIES, FLAT_LOCATIONS } from '../utils/locations'

const TRANSPORT_MODES = [
  { value: 'car', label: 'Car', icon: '🚗', desc: '4-wheeler' },
  { value: 'motorcycle', label: 'Bike', icon: '🏍️', desc: '2-wheeler' },
  { value: 'walk', label: 'Walk', icon: '🚶', desc: 'Pedestrian' },
]

const SAFETY_MODES = [
  { value: 'standard', label: 'Standard', icon: '🛡️', desc: 'Default routing' },
  { value: 'women_safety', label: 'Women Safety', icon: '👩', desc: 'Avoid dark & residential' },
  { value: 'domestic_tourist', label: 'Domestic Tourist', icon: '🧳', desc: 'Avoid scam zones' },
]

export default function Sidebar({
  startCoords, endCoords, startName, endName,
  setStartCoords, setEndCoords, setStartName, setEndName,
  transportMode, setTransportMode,
  safetyMode, setSafetyMode,
  onFindRoute, loading,
  onLocSelect, onQuickRoute, quickRoutes,
  recentRoutes, onSwap, onClose,
  navActive, onStopNav,
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
    onLocSelect('start', loc); setStartInput(loc.name); setShowStart(false)
  }

  function handleEndSelect(loc) {
    onLocSelect('end', loc); setEndInput(loc.name); setShowEnd(false)
  }

  function handleQuick(qr) {
    onQuickRoute(qr); setStartInput(qr.start); setEndInput(qr.end); setShowPresets(false)
  }

  const ready = startCoords && endCoords

  return (
    <div className="w-[300px] max-h-[calc(100vh-40px)] overflow-y-auto glass-card animate-slideInLeft">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#00ff88] to-[#00cc66] flex items-center justify-center text-base shadow-lg shadow-[#00ff88]/15">🛡️</div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">Safe Route</h1>
              <p className="text-[10px] text-slate-500">Delhi Smart Navigation</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-slate-500 hover:text-white p-1 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 px-2">
        {[
          { id: 'route', label: 'Route', icon: '📍' },
          { id: 'presets', label: 'Presets', icon: '⚡' },
          { id: 'recent', label: 'Recent', icon: '🕐' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-xs font-medium transition-all relative ${tab === t.id ? 'text-[#00ff88]' : 'text-slate-500 hover:text-slate-300'}`}>
            <span className="mr-1">{t.icon}</span>{t.label}
            {tab === t.id && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[#00ff88] rounded-full"></span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* === TAB: ROUTE === */}
        {tab === 'route' && (
          <>
            {/* Start Input */}
            <div>
              <label className="text-[10px] text-slate-500 mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#00ff66] shadow-lg shadow-[#00ff66]/30"></span> Start
              </label>
              <div className="relative">
                <input value={startInput} onChange={e => { setStartInput(e.target.value); setShowStart(true) }}
                  onFocus={() => setShowStart(true)} onBlur={() => setTimeout(() => setShowStart(false), 200)}
                  placeholder="Search location..." className="w-full bg-white/5 text-white px-3 py-2 rounded-xl border border-white/5 focus:border-[#00ff88]/30 outline-none text-sm transition-all placeholder:text-slate-600" />
                {showStart && startInput && filteredStart.length > 0 && (
                  <div className="absolute z-20 w-full bg-[#0a0f19] border border-white/8 rounded-xl mt-1 max-h-44 overflow-y-auto shadow-2xl animate-fadeIn">
                    {filteredStart.map(loc => (
                      <button key={loc.name} onMouseDown={() => handleStartSelect(loc)}
                        className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors first:rounded-t-xl last:rounded-b-xl">
                        <span className="text-slate-500 mr-2">📍</span>{loc.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Swap */}
            <div className="flex justify-center -my-0.5">
              <button onClick={onSwap} className="w-8 h-8 rounded-full glass flex items-center justify-center text-slate-400 hover:text-[#00ff88] hover:border-[#00ff88]/20 transition-all btn-press">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
              </button>
            </div>

            {/* End Input */}
            <div>
              <label className="text-[10px] text-slate-500 mb-1.5 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full shadow-lg ${endCoords ? 'bg-[#ff3333] shadow-[#ff3333]/30' : 'bg-slate-600'}`}></span> Destination
              </label>
              <div className="relative">
                <input value={endInput} onChange={e => { setEndInput(e.target.value); setShowEnd(true) }}
                  onFocus={() => setShowEnd(true)} onBlur={() => setTimeout(() => setShowEnd(false), 200)}
                  placeholder="Search location..." className="w-full bg-white/5 text-white px-3 py-2 rounded-xl border border-white/5 focus:border-[#ff3333]/30 outline-none text-sm transition-all placeholder:text-slate-600" />
                {showEnd && endInput && filteredEnd.length > 0 && (
                  <div className="absolute z-20 w-full bg-[#0a0f19] border border-white/8 rounded-xl mt-1 max-h-44 overflow-y-auto shadow-2xl animate-fadeIn">
                    {filteredEnd.map(loc => (
                      <button key={loc.name} onMouseDown={() => handleEndSelect(loc)}
                        className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors first:rounded-t-xl last:rounded-b-xl">
                        <span className="text-slate-500 mr-2">📍</span>{loc.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {startCoords && (
              <div className="text-[10px] text-slate-600 bg-white/[0.03] rounded-lg px-3 py-1.5">
                Start: {startCoords.lat.toFixed(4)}, {startCoords.lng.toFixed(4)}
              </div>
            )}

            {/* Transport Mode */}
            <div>
              <label className="text-[10px] text-slate-500 mb-2 block">Transport</label>
              <div className="grid grid-cols-3 gap-1.5">
                {TRANSPORT_MODES.map(tm => (
                  <button key={tm.value} onClick={() => setTransportMode(tm.value)}
                    className={`text-center py-2.5 rounded-xl border text-[11px] transition-all btn-press ${
                      transportMode === tm.value
                        ? 'border-[#00ff88]/30 bg-[#00ff88]/8 text-[#00ff88] shadow-lg shadow-[#00ff88]/5'
                        : 'border-white/5 bg-white/[0.03] text-slate-400 hover:border-white/10 hover:text-slate-300'
                    }`}>
                    <div className="text-lg mb-0.5">{tm.icon}</div>
                    <div className="font-medium leading-tight">{tm.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Travel Profile */}
            <div>
              <label className="text-[10px] text-slate-500 mb-2 flex items-center gap-1.5">
                <span className="text-sm">👤</span> Profile
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {SAFETY_MODES.map(sm => (
                  <button key={sm.value} onClick={() => setSafetyMode(sm.value)}
                    className={`text-center py-2 rounded-xl border text-[10px] transition-all btn-press ${
                      safetyMode === sm.value
                        ? sm.value === 'women_safety' ? 'border-pink-500/30 bg-pink-500/8 text-pink-300'
                          : sm.value === 'domestic_tourist' ? 'border-amber-500/30 bg-amber-500/8 text-amber-300'
                          : 'border-[#00ff88]/30 bg-[#00ff88]/8 text-[#00ff88]'
                        : 'border-white/5 bg-white/[0.03] text-slate-400 hover:border-white/10 hover:text-slate-300'
                    }`}>
                    <div className="text-base mb-0.5">{sm.icon}</div>
                    <div className="font-medium leading-tight">{sm.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Navigation Active Banner */}
            {navActive && (
              <div className="glass-card p-3 border border-[#00ff88]/20 bg-[#00ff88]/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulseGlow"></span>
                    <span className="text-xs text-[#00ff88] font-medium">Navigation Active</span>
                  </div>
                  <button onClick={onStopNav}
                    className="text-[10px] text-red-400 hover:text-red-300 bg-red-500/10 px-2 py-0.5 rounded-lg transition-colors">Stop</button>
                </div>
                <p className="text-[9px] text-slate-500 mt-1">Dead-man switch active (5 min)</p>
              </div>
            )}

            {/* Find Route */}
            <button onClick={onFindRoute} disabled={!ready || loading}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-all btn-press ${
                loading ? 'bg-white/5 text-slate-500 cursor-not-allowed' :
                ready ? 'bg-gradient-to-r from-[#00ff88] to-[#00cc66] text-[#0a0f19] hover:shadow-lg hover:shadow-[#00ff88]/20 active:shadow-md font-bold' :
                'bg-white/[0.03] text-slate-600 cursor-not-allowed border border-white/5'
              }`}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-[#00ff88]/30 border-t-[#00ff88] rounded-full animate-spin"></span>
                  Finding safest route...
                </span>
              ) : ready ? '🚀 Find Route' : 'Select start & destination'}
            </button>

            {/* Browse locations */}
            <div>
              <button onClick={() => setExpandedCat(expandedCat ? null : 'all')}
                className="w-full text-[10px] text-slate-500 hover:text-slate-300 py-1.5 flex items-center justify-center gap-1 transition-colors">
                <span>📋</span> Browse all locations
              </button>
              {expandedCat && (
                <div className="space-y-0.5 mt-1 max-h-36 overflow-y-auto">
                  {LOCATION_CATEGORIES.map(cat => (
                    <div key={cat.name}>
                      <button onClick={() => setExpandedCat(expandedCat === cat.name ? null : cat.name)}
                        className="w-full text-left text-[10px] text-slate-400 hover:text-white py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                        {cat.name} <span className="text-slate-600">({cat.locations.length})</span>
                      </button>
                      {expandedCat === cat.name && cat.locations.map(loc => (
                        <button key={loc.name} onMouseDown={() => { handleStartSelect(loc); setExpandedCat(null) }}
                          className="w-full text-left text-[10px] text-slate-500 hover:text-slate-300 py-1 px-3 pl-5 rounded hover:bg-white/[0.03] transition-colors">
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
          <div className="space-y-1.5">
            <p className="text-[10px] text-slate-500 mb-3">Popular routes across Delhi</p>
            {quickRoutes.map((qr, i) => (
              <button key={i} onClick={() => handleQuick(qr)}
                className="w-full glass-card p-3 text-left transition-all btn-press hover:border-[#00ff88]/10">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white font-medium">⚡ {qr.name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      <span className="text-[#00ff66]">●</span> {qr.start} <span className="text-slate-600">→</span> <span className="text-[#ff3333]">●</span> {qr.end}
                    </div>
                  </div>
                  <span className="text-slate-600 text-base">→</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* === TAB: RECENT === */}
        {tab === 'recent' && (
          <div className="space-y-1.5">
            {recentRoutes.length === 0 ? (
              <div className="text-center py-6 text-slate-600">
                <div className="text-2xl mb-2">🗺️</div>
                <p className="text-xs">No recent routes yet</p>
              </div>
            ) : (
              recentRoutes.map((r, i) => (
                <button key={i} onClick={() => {
                  const loc = FLAT_LOCATIONS.find(l => l.name === r.start)
                  const loc2 = FLAT_LOCATIONS.find(l => l.name === r.end)
                  if (loc && loc2) {
                    onLocSelect('start', loc); setStartInput(r.start)
                    onLocSelect('end', loc2); setEndInput(r.end)
                    setTab('route')
                  }
                }}
                  className="w-full glass-card p-2.5 text-left transition-all btn-press hover:border-[#00ff88]/10">
                  <div className="flex items-center gap-2.5">
                    <span className="text-slate-500 text-base">🕐</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{r.start} <span className="text-slate-600">→</span> {r.end}</div>
                      <div className="text-[9px] text-slate-600">{new Date(r.ts).toLocaleTimeString()} · <span className="capitalize">{r.transport}</span></div>
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
      <div className="px-4 py-2.5 border-t border-white/5">
        <div className="flex items-center justify-between text-[9px] text-slate-600">
          <span>🛡️ Safe Route v2</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulseGlow"></span>
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  )
}
