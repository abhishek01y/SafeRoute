import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

const MODES = ['shortest', 'balanced', 'safest']

function isNight() { const h = new Date().getHours(); return h < 6 || h >= 19 }

const ROUTE_VIS = {
  shortest: { color: '#ff3333', glow: 'rgba(255,51,51,0.12)', weight: 5, label: 'Shortest' },
  balanced: { color: '#ff8800', glow: 'rgba(255,136,0,0.12)', weight: 5, label: 'Balanced' },
  safest:   { color: '#00ff66', glow: 'rgba(0,255,102,0.18)', weight: 8, label: 'Safest' },
}

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

// === MapClickHandler ===
function MapClickHandler({ onMapClick }) {
  const map = useMap()
  useMapEvents({
    click(e) {
      const angle = map._rotationAngle || 0
      if (angle !== 0) {
        const center = map.getSize().divideBy(2)
        const dx = e.containerPoint.x - center.x
        const dy = e.containerPoint.y - center.y
        const rad = (-angle * Math.PI) / 180
        const cosA = Math.cos(rad); const sinA = Math.sin(rad)
        const rotDx = dx * cosA - dy * sinA
        const rotDy = dx * sinA + dy * cosA
        const rotPoint = L.point(center.x + rotDx, center.y + rotDy)
        const adjustedLatLng = map.containerPointToLatLng(rotPoint)
        if (onMapClick) onMapClick(adjustedLatLng)
      } else {
        if (onMapClick) onMapClick(e.latlng)
      }
    },
  })
  return null
}

// === Start/End Markers (Premium Design) ===
function StartEndMarkers({ startCoords, endCoords, startName, endName }) {
  const map = useMap()
  const markers = useRef([])

  useEffect(() => {
    markers.current.forEach(m => { try { map.removeLayer(m) } catch {} })
    markers.current = []

    if (startCoords) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
          <div style="
            width:28px;height:28px;
            background: linear-gradient(135deg, #00ff66, #00cc55);
            border: 2px solid rgba(0,255,102,0.4);
            border-radius: 50%;
            box-shadow: 0 0 0 6px rgba(0,255,102,0.12), 0 0 30px rgba(0,255,102,0.2), 0 4px 12px rgba(0,0,0,0.5);
          "></div>
          <div style="
            margin-top: 4px;
            padding: 2px 10px;
            background: rgba(10,15,25,0.85);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(0,255,102,0.2);
            border-radius: 6px;
            font-size: 10px;
            font-weight: 700;
            color: #00ff66;
            letter-spacing: 1px;
            text-transform: uppercase;
            white-space: nowrap;
          ">START</div>
        </div>`,
        iconSize: [28, 48],
        iconAnchor: [14, 44],
      })
      const m = L.marker([startCoords.lat, startCoords.lng], { icon }).addTo(map)
      if (startName) m.bindPopup(`<b>${startName}</b><br/><span style="color:#7a8494;font-size:11px">Start</span>`)
      markers.current.push(m)
    }

    if (endCoords) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
          <div style="
            width:28px;height:28px;
            background: linear-gradient(135deg, #ff3333, #cc2222);
            border: 2px solid rgba(255,51,51,0.4);
            border-radius: 50%;
            box-shadow: 0 0 0 6px rgba(255,51,51,0.12), 0 0 30px rgba(255,51,51,0.2), 0 4px 12px rgba(0,0,0,0.5);
          "></div>
          <div style="
            margin-top: 4px;
            padding: 2px 10px;
            background: rgba(10,15,25,0.85);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255,51,51,0.2);
            border-radius: 6px;
            font-size: 10px;
            font-weight: 700;
            color: #ff3333;
            letter-spacing: 1px;
            text-transform: uppercase;
            white-space: nowrap;
          ">END</div>
        </div>`,
        iconSize: [28, 48],
        iconAnchor: [14, 44],
      })
      const m = L.marker([endCoords.lat, endCoords.lng], { icon }).addTo(map)
      if (endName) m.bindPopup(`<b>${endName}</b><br/><span style="color:#7a8494;font-size:11px">Destination</span>`)
      markers.current.push(m)
    }

    return () => { markers.current.forEach(m => { try { map.removeLayer(m) } catch {} }) }
  }, [startCoords, endCoords, startName, endName, map])

  return null
}

// === RouteLayer (Premium Visualization) ===
function RouteLayer({ routes, activeMode, transportMode }) {
  const map = useMap()
  const layersRef = useRef({})

  useEffect(() => {
    Object.values(layersRef.current).forEach(l => {
      Object.values(l).forEach(layer => { try { map.removeLayer(layer) } catch {} })
    })
    layersRef.current = {}
    if (!routes) return

    const unique = getUniqueRoutes(routes)
    const boundsList = []

    unique.forEach((route, i) => {
      const latlngs = route.path.map(p => [p.lat, p.lon])
      const key = route._key
      const vis = ROUTE_VIS[key] || { color: '#666', glow: 'rgba(100,100,100,0.1)', weight: 4 }
      const isActive = key === activeMode
      const w = isActive ? vis.weight : 4
      const op = isActive ? 0.95 : 0.5

      // Glow layer (underneath)
      const glowPoly = L.polyline(latlngs, {
        color: vis.color,
        weight: w + 12,
        opacity: isActive ? 0.2 : 0.06,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(map)

      // Main path
      const poly = L.polyline(latlngs, {
        color: isActive ? vis.color : vis.color,
        weight: w,
        opacity: op,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: true,
      }).addTo(map)

      const totalKm = route.total_distance_km || 0
      if (totalKm > 1 && route.avg_safety_score) {
        const speed = { car: 20, motorcycle: 25, walk: 5 }[transportMode] || 20
        const time = route.estimated_time_min || Math.round((totalKm / speed) * 60)
        poly.bindPopup(`
          <div style="font-size:12px;min-width:160px">
            <b style="color:${vis.color}">${vis.label} Route</b>
            <div style="display:flex;justify-content:space-between;margin-top:6px;color:#94a3b8;gap:10px">
              <span>📏 ${totalKm} km</span>
              <span>⏱ ~${time} min</span>
              <span style="color:${route.avg_safety_score > 75 ? '#22c55e' : route.avg_safety_score > 55 ? '#eab308' : '#ef4444'}">🛡️ ${route.avg_safety_score}/100</span>
            </div>
          </div>
        `)
      }

      layersRef.current[key] = { poly, glow: glowPoly }
      boundsList.push(...latlngs)
    })

    if (boundsList.length > 0) {
      map.fitBounds(L.latLngBounds(boundsList), { padding: [60, 60], maxZoom: 14.5 })
    }

    return () => {
      Object.values(layersRef.current).forEach(l => {
        Object.values(l).forEach(layer => { try { map.removeLayer(layer) } catch {} })
      })
    }
  }, [routes, activeMode, map, transportMode])

  return null
}

// === POI Layer ===
const POI_COLORS = { hospital: '#ef4444', police: '#3b82f6', landmark: '#f59e0b', transit: '#8b5cf6' }
const POI_ICONS = { hospital: '🏥', police: '🚔', landmark: '🏛️', transit: '🚉' }
const POI_LABELS = { hospital: 'Hospital', police: 'Police Station', landmark: 'Landmark', transit: 'Transit' }

function POILayer({ pois, poiFilter }) {
  const map = useMap()
  const layerRef = useRef(null)

  const filtered = useMemo(() => {
    if (!pois) return []
    if (!poiFilter) return pois
    return pois.filter(p => p.type === poiFilter)
  }, [pois, poiFilter])

  useEffect(() => {
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }
    if (!filtered || filtered.length === 0) return

    const group = L.layerGroup()
    filtered.forEach(p => {
      const color = POI_COLORS[p.type] || '#7a8494'
      const iconEmoji = POI_ICONS[p.type] || '📍'
      const marker = L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div style="
            width:32px;height:32px;
            background:rgba(8,12,20,0.7);
            border:1px solid ${color}44;
            border-radius:8px;
            display:flex;align-items:center;justify-content:center;
            font-size:14px;
            backdrop-filter:blur(4px);
            box-shadow:0 2px 12px rgba(0,0,0,0.4);
            cursor:pointer;
            transition:all 0.2s;
          " onmouseover="this.style.transform='scale(1.12)';this.style.borderColor='${color}'" onmouseout="this.style.transform='scale(1)';this.style.borderColor='${color}44'"
          >${iconEmoji}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -18],
        })
      }).bindPopup(`
        <div style="font-size:12px;min-width:150px">
          <b>${p.name}</b><br/>
          <span style="color:${color};font-size:10px;text-transform:capitalize">${POI_LABELS[p.type] || p.type}</span>
          ${p.address ? `<br/><span style="font-size:9px;color:#4a5568">${p.address}</span>` : ''}
        </div>
      `)
      group.addLayer(marker)
    })
    group.addTo(map)
    layerRef.current = group

    return () => { if (layerRef.current) map.removeLayer(layerRef.current) }
  }, [filtered, map])

  return null
}

// === Compass Control ===
function CompassControl() {
  const map = useMap()
  const [angle, setAngle] = useState(0)
  const [isHovered, setIsHovered] = useState(false)

  const rotateMap = useCallback((deg) => {
    const newAngle = ((angle + deg) % 360 + 360) % 360
    setAngle(newAngle)
    map._rotationAngle = newAngle
    const container = map.getContainer()
    const mapPane = container.querySelector('.leaflet-map-pane')
    if (mapPane) {
      mapPane.style.transformOrigin = '50% 50%'
      mapPane.style.transition = 'transform 0.4s ease-out'
      mapPane.style.transform = `rotate(${newAngle}deg)`
    }
  }, [angle, map])

  const resetRotation = useCallback(() => {
    setAngle(0); map._rotationAngle = 0
    const container = map.getContainer()
    const mapPane = container.querySelector('.leaflet-map-pane')
    if (mapPane) {
      mapPane.style.transition = 'transform 0.4s ease-out'
      mapPane.style.transform = 'rotate(0deg)'
    }
  }, [map])

  return (
    <div className="absolute bottom-32 right-5 z-[1000] flex flex-col items-center gap-1.5"
      onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <button onClick={() => rotateMap(90)}
        onContextMenu={(e) => { e.preventDefault(); rotateMap(-90) }}
        onDoubleClick={(e) => { e.preventDefault(); resetRotation() }}
        title="Click: 90° CW | Right-click: 90° CCW | Double-click: Reset"
        className="w-11 h-11 rounded-2xl glass flex items-center justify-center shadow-lg cursor-pointer select-none transition-all btn-press"
        style={isHovered ? { borderColor: 'rgba(0,255,136,0.2)' } : {}}>
        <svg viewBox="0 0 50 50" className="w-7 h-7" style={{ transform: `rotate(${-angle}deg)`, transition: 'transform 0.4s ease-out' }}>
          <circle cx="25" cy="25" r="22" fill="none" stroke="#2a3040" strokeWidth="1.2" />
          <line x1="25" y1="4" x2="25" y2="46" stroke="#1a1f2e" strokeWidth="0.6" />
          <line x1="4" y1="25" x2="46" y2="25" stroke="#1a1f2e" strokeWidth="0.6" />
          <polygon points="25,5 21.5,20 25,17 28.5,20" fill="#ff3333" />
          <polygon points="25,45 21.5,30 25,33 28.5,30" fill="#2a3040" />
          <circle cx="25" cy="25" r="3" fill="#080c14" stroke="#2a3040" strokeWidth="0.8" />
          <text x="25" y="10" textAnchor="middle" fontSize="6" fill="#ff3333" fontWeight="bold">N</text>
        </svg>
      </button>
      {angle !== 0 && (
        <button onClick={resetRotation} className="text-[10px] text-slate-500 hover:text-white glass rounded-lg px-2.5 py-1 transition-all">
          ↺ Reset
        </button>
      )}
      <div className="text-[9px] text-slate-600">{angle}°</div>
    </div>
  )
}

// === POI Filter (Floating Top Center) ===
function POIFilter({ poiFilter, setPoiFilter }) {
  const types = [
    { value: '', label: 'All', icon: '⊞', color: '#00ff88' },
    { value: 'hospital', label: '🏥', color: '#ef4444' },
    { value: 'police', label: '🚔', color: '#3b82f6' },
    { value: 'landmark', label: '🏛️', color: '#f59e0b' },
    { value: 'transit', label: '🚉', color: '#8b5cf6' },
  ]
  return (
    <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[1000] animate-fadeIn">
      <div className="glass-card flex items-center gap-1 px-2 py-1.5 shadow-2xl">
        {types.map(t => (
          <button key={t.value} onClick={() => setPoiFilter(t.value)}
            className={`px-3 py-2 rounded-xl text-sm font-medium transition-all btn-press ${
              poiFilter === t.value
                ? 'text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
            style={poiFilter === t.value ? { background: `${t.color}15`, color: t.color, boxShadow: `0 0 20px ${t.color}10` } : {}}>
            {t.label || t.icon}
          </button>
        ))}
      </div>
    </div>
  )
}

// === ClickPhaseIndicator ===
function ClickPhaseIndicator({ clickPhase }) {
  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] glass-card px-5 py-2.5 animate-fadeIn">
      <div className="flex items-center gap-3 text-xs">
        <span className={`w-2 h-2 rounded-full ${clickPhase === 'start' ? 'bg-[#00ff66] animate-pulseGlow' : 'bg-[#00ff66]/30'}`}></span>
        <span className={clickPhase === 'start' ? 'text-[#00ff88] font-medium' : 'text-slate-500'}>Start</span>
        <span className="text-slate-600">→</span>
        <span className={`w-2 h-2 rounded-full ${clickPhase === 'end' ? 'bg-[#ff3333] animate-pulseGlow' : 'bg-[#ff3333]/30'}`}></span>
        <span className={clickPhase === 'end' ? 'text-[#ff3333] font-medium' : 'text-slate-500'}>End</span>
        <span className="text-slate-600 ml-2">Click on map to set</span>
      </div>
    </div>
  )
}

// === SOS FAB ===
function SOSFab() {
  return (
    <a href="tel:112"
      className="absolute bottom-20 right-5 z-[1000] w-14 h-14 rounded-full bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-2xl shadow-red-500/30 hover:from-red-500 hover:to-red-600 transition-all btn-press animate-fadeIn"
      title="Emergency — Call 112">
      <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    </a>
  )
}

// === GPSTracker ===
function GPSTracker({ navActive, latestGpsRef, onVerifyTrajectory, routes, activeMode }) {
  const map = useMap()
  const watchIdRef = useRef(null)
  const markerRef = useRef(null)
  const lastCheckRef = useRef(0)

  useEffect(() => {
    if (!navActive) {
      if (watchIdRef.current) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null }
      if (markerRef.current) { try { map.removeLayer(markerRef.current) } catch {}; markerRef.current = null }
      return
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        latestGpsRef.current = { lat: latitude, lng: longitude }

        if (markerRef.current) { try { map.removeLayer(markerRef.current) } catch {} }
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:16px;height:16px;
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            border: 3px solid rgba(10,15,25,0.9);
            border-radius: 50%;
            box-shadow: 0 0 0 5px rgba(59,130,246,0.2), 0 0 30px rgba(59,130,246,0.15);
          "></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        })
        markerRef.current = L.marker([latitude, longitude], { icon }).addTo(map)
        map.setView([latitude, longitude], map.getZoom(), { animate: true })

        const now = Date.now()
        if (onVerifyTrajectory && routes && now - lastCheckRef.current > 30000) {
          lastCheckRef.current = now
          const activeRoute = routes[activeMode]
          if (activeRoute?.path) {
            onVerifyTrajectory(activeRoute.path.map(p => [p.lat, p.lon]), [latitude, longitude]).catch(() => {})
          }
        }
      },
      (err) => console.warn('GPS error:', err.message),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    )

    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [navActive, map, latestGpsRef, onVerifyTrajectory, routes, activeMode])

  return null
}

// === Main MapView ===
export default function MapView({
  routes, activeMode, transportMode,
  onMapClick, mapDark, onToggleDark,
  pois, clickPhase, startCoords, endCoords,
  startName, endName, sidebarOpen,
  navActive, latestGpsRef, onVerifyTrajectory,
}) {
  const defaultCenter = [28.6139, 77.2090]
  const defaultZoom = 12
  const darkTile = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
  const [poiFilter, setPoiFilter] = useState('')

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100vh', width: '100vw' }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url={darkTile}
        />
        <MapClickHandler onMapClick={onMapClick} />
        <StartEndMarkers startCoords={startCoords} endCoords={endCoords} startName={startName} endName={endName} />
        <RouteLayer routes={routes} activeMode={activeMode} transportMode={transportMode} />
        <POILayer pois={pois} poiFilter={poiFilter} />
        <CompassControl />
        <GPSTracker navActive={navActive} latestGpsRef={latestGpsRef} onVerifyTrajectory={onVerifyTrajectory} routes={routes} activeMode={activeMode} />
      </MapContainer>

      {/* Dark overlay for depth */}
      <div className="map-dark-overlay" />

      {/* Top controls */}
      <div className="absolute top-5 left-5 z-[1000] flex gap-2">
        <button onClick={onToggleDark}
          className="glass-card px-3.5 py-2.5 text-xs text-slate-400 hover:text-white transition-all btn-press flex items-center gap-2 shadow-lg">
          {mapDark ? '☀️' : '🌙'} {mapDark ? 'Light' : 'Dark'}
        </button>
        {isNight() && (
          <span className="glass-card px-3.5 py-2.5 text-xs text-[#00ff88]/70 flex items-center gap-1.5 border border-[#00ff88]/10">
            🌙 Night Mode
          </span>
        )}
      </div>

      {/* POI Filter Bar */}
      <POIFilter poiFilter={poiFilter} setPoiFilter={setPoiFilter} />

      {/* Click phase indicator */}
      {!routes && <ClickPhaseIndicator clickPhase={clickPhase} />}

      {/* SOS FAB */}
      <SOSFab />

      {/* Legend */}
      <div className="absolute bottom-5 left-5 z-[1000] glass-card px-3.5 py-2.5 text-xs shadow-lg">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-[#00ff66]"></span> Safe</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-[#ff8800]"></span> Moderate</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-[#ff3333]"></span> Risky</span>
        </div>
      </div>
    </div>
  )
}
