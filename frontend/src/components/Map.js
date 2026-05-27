import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

const MODES = ['shortest', 'balanced', 'safest']

function isNight() { const h = new Date().getHours(); return h < 6 || h >= 19 }
function getRouteColor(i) { return ['#3b82f6', '#a855f7', '#22c55e'][i % 3] }
function getRouteGlow(i) { return ['rgba(59,130,246,0.15)', 'rgba(168,85,247,0.15)', 'rgba(34,197,94,0.15)'][i % 3] }

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
        const cosA = Math.cos(rad)
        const sinA = Math.sin(rad)
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

// === Start/End Markers ===
function StartEndMarkers({ startCoords, endCoords, startName, endName }) {
  const map = useMap()
  const markers = useRef([])

  useEffect(() => {
    markers.current.forEach(m => map.removeLayer(m))
    markers.current = []

    if (startCoords) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:20px;height:20px;
          background:#22c55e;
          border:3px solid #1e293b;
          border-radius:50%;
          box-shadow:0 0 0 4px rgba(34,197,94,0.3), 0 2px 8px rgba(0,0,0,0.4);
          animation: markerPulse 2s infinite;
        "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })
      const m = L.marker([startCoords.lat, startCoords.lng], { icon }).addTo(map)
      if (startName) m.bindPopup(`<b style="font-size:13px">${startName}</b><br/><span style="font-size:11px;color:#94a3b8">Start</span>`)
      markers.current.push(m)
    }

    if (endCoords) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:20px;height:20px;
          background: #ef4444;
          border:3px solid #1e293b;
          border-radius:50%;
          box-shadow:0 0 0 4px rgba(239,68,68,0.3), 0 2px 8px rgba(0,0,0,0.4);
          animation: markerPulse 2s infinite;
        "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })
      const m = L.marker([endCoords.lat, endCoords.lng], { icon }).addTo(map)
      if (endName) m.bindPopup(`<b style="font-size:13px">${endName}</b><br/><span style="font-size:11px;color:#94a3b8">Destination</span>`)
      markers.current.push(m)
    }

    return () => { markers.current.forEach(m => map.removeLayer(m)) }
  }, [startCoords, endCoords, startName, endName, map])

  return null
}

// === RouteLayer ===
function RouteLayer({ routes, activeMode, transportMode }) {
  const map = useMap()
  const layersRef = useRef({})
  const animRef = useRef(null)

  useEffect(() => {
    Object.values(layersRef.current).forEach(l => {
      if (l.group) map.removeLayer(l.group)
      if (l.glow) map.removeLayer(l.glow)
      if (l.path) map.removeLayer(l.path)
    })
    layersRef.current = {}
    if (animRef.current) { clearTimeout(animRef.current); animRef.current = null }
    if (!routes) return

    const unique = getUniqueRoutes(routes)
    const multiple = unique.length > 1
    const boundsList = []

    unique.forEach((route, i) => {
      const latlngs = route.path.map(p => [p.lat, p.lon])
      const isActive = route._key === activeMode
      const color = getRouteColor(i)
      const weight = isActive ? 6 : 3
      const opacity = isActive ? 0.95 : 0.4

      // Glow layer
      const glowPoly = L.polyline(latlngs, {
        color: color,
        weight: weight + 8,
        opacity: 0.12,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map)
      layersRef.current[`${route._key}_glow`] = glowPoly

      // Main path
      const poly = L.polyline(latlngs, {
        color,
        weight,
        opacity,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: multiple && i === 1 ? '8, 5' : null,
      }).addTo(map)

      // Add distance markers along route
      const totalKm = route.total_distance_km || 0
      if (totalKm > 1) {
        const interval = totalKm > 5 ? 2 : 1
        for (let d = interval; d < totalKm; d += interval) {
          const frac = d / totalKm
          const idx = Math.floor(frac * (latlngs.length - 1))
          if (idx > 0 && idx < latlngs.length - 1) {
            const p = latlngs[idx]
            const divIcon = L.divIcon({
              className: 'distance-marker',
              html: `${d} km`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            })
            L.marker(p, { icon: divIcon, interactive: false }).addTo(map)
          }
        }
      }

      if (route.total_distance_km && route.avg_safety_score) {
        const speed = { car: 20, motorcycle: 25, walk: 5 }[transportMode] || 20
        const time = route.estimated_time_min || Math.round((route.total_distance_km / speed) * 60)
        const label = multiple ? (route._key === 'shortest' ? 'Standard' : route._key === 'safest' ? 'Safest' : 'Balanced') : 'Route'
        poly.bindPopup(`
          <div style="font-size:13px;min-width:170px">
            <b style="color:${color}">${label}</b><br/>
            <div style="display:flex;justify-content:space-between;margin-top:6px;gap:12px">
              <span>📏 ${route.total_distance_km} km</span>
              <span>⏱ ~${time} min</span>
              <span style="color:${route.avg_safety_score > 75 ? '#22c55e' : route.avg_safety_score > 55 ? '#eab308' : '#ef4444'}">🛡️ ${route.avg_safety_score}/100</span>
            </div>
          </div>
        `)
      }

      layersRef.current[route._key] = { group: poly, glow: glowPoly }
      boundsList.push(...latlngs)
    })

    if (boundsList.length > 0) {
      map.fitBounds(L.latLngBounds(boundsList), { padding: [50, 50], maxZoom: 15 })
    }

    return () => {
      Object.values(layersRef.current).forEach(l => {
        if (l.group) map.removeLayer(l.group)
        if (l.glow) map.removeLayer(l.glow)
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
      const color = POI_COLORS[p.type] || '#94a3b8'
      const iconEmoji = POI_ICONS[p.type] || '📍'
      const marker = L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div style="
            width:34px;height:34px;
            background:${color}18;
            border:2px solid ${color}66;
            border-radius:10px;
            display:flex;align-items:center;justify-content:center;
            font-size:15px;
            backdrop-filter:blur(4px);
            box-shadow:0 2px 12px ${color}33, 0 1px 3px rgba(0,0,0,0.3);
            cursor:pointer;
            transition:all 0.2s;
          " onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'"
          >${iconEmoji}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          popupAnchor: [0, -20],
        })
      }).bindPopup(`
        <div style="font-size:13px;min-width:160px">
          <b>${p.name}</b><br/>
          <span style="color:${color};font-size:11px;text-transform:capitalize">${POI_LABELS[p.type] || p.type}</span>
          ${p.address ? `<br/><span style="font-size:10px;color:#64748b">${p.address}</span>` : ''}
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
    setAngle(0)
    map._rotationAngle = 0
    const container = map.getContainer()
    const mapPane = container.querySelector('.leaflet-map-pane')
    if (mapPane) {
      mapPane.style.transition = 'transform 0.4s ease-out'
      mapPane.style.transform = 'rotate(0deg)'
    }
  }, [map])

  return (
    <div className="absolute bottom-20 right-4 z-[1000] flex flex-col items-center gap-1.5"
      onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <button onClick={() => rotateMap(90)}
        onContextMenu={(e) => { e.preventDefault(); rotateMap(-90) }}
        onDoubleClick={(e) => { e.preventDefault(); resetRotation() }}
        title="Click: 90° CW | Right-click: 90° CCW | Double-click: Reset"
        className={`w-12 h-12 rounded-2xl glass flex items-center justify-center shadow-lg cursor-pointer select-none transition-all ${isHovered ? 'border-blue-500/40' : ''} btn-press`}>
        <svg viewBox="0 0 50 50" className="w-8 h-8" style={{ transform: `rotate(${-angle}deg)`, transition: 'transform 0.4s ease-out' }}>
          <circle cx="25" cy="25" r="22" fill="none" stroke="#475569" strokeWidth="1.2" />
          <line x1="25" y1="4" x2="25" y2="46" stroke="#334155" strokeWidth="0.6" />
          <line x1="4" y1="25" x2="46" y2="25" stroke="#334155" strokeWidth="0.6" />
          <polygon points="25,5 21.5,20 25,17 28.5,20" fill="#ef4444" />
          <polygon points="25,45 21.5,30 25,33 28.5,30" fill="#475569" />
          <circle cx="25" cy="25" r="3" fill="#0f172a" stroke="#475569" strokeWidth="0.8" />
          <text x="25" y="10" textAnchor="middle" fontSize="6" fill="#ef4444" fontWeight="bold">N</text>
        </svg>
      </button>
      {angle !== 0 && (
        <button onClick={resetRotation} className="text-[10px] text-slate-400 hover:text-white glass rounded-lg px-2.5 py-1 transition-all">
          ↺ Reset
        </button>
      )}
      <div className="text-[10px] text-slate-600">{angle}°</div>
    </div>
  )
}

// === POI Filter ===
function POIFilter({ poiFilter, setPoiFilter }) {
  const types = [
    { value: '', label: 'All', color: '#94a3b8' },
    { value: 'hospital', label: '🏥', color: '#ef4444' },
    { value: 'police', label: '🚔', color: '#3b82f6' },
    { value: 'landmark', label: '🏛️', color: '#f59e0b' },
    { value: 'transit', label: '🚉', color: '#8b5cf6' },
  ]
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex gap-1 bg-slate-900/80 backdrop-blur-lg rounded-xl border border-slate-700/50 px-2 py-1.5 shadow-2xl">
      {types.map(t => (
        <button key={t.value} onClick={() => setPoiFilter(t.value)}
          className={`px-2.5 py-1.5 rounded-lg text-xs transition-all btn-press ${poiFilter === t.value ? 'bg-slate-700/80 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
          style={poiFilter === t.value ? { borderLeft: `2px solid ${t.color}` } : {}}>
          {t.label || 'All'}
        </button>
      ))}
    </div>
  )
}

// === ClickPhaseIndicator ===
function ClickPhaseIndicator({ clickPhase }) {
  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] glass rounded-xl px-4 py-2 shadow-2xl animate-fadeIn">
      <div className="flex items-center gap-2.5 text-xs">
        <span className={`w-2 h-2 rounded-full ${clickPhase === 'start' ? 'bg-green-500 animate-pulseGlow' : 'bg-green-500/40'}`}></span>
        <span className={`${clickPhase === 'start' ? 'text-green-400' : 'text-slate-500'}`}>Start</span>
        <span className="text-slate-600">→</span>
        <span className={`w-2 h-2 rounded-full ${clickPhase === 'end' ? 'bg-red-500 animate-pulseGlow' : 'bg-red-500/40'}`}></span>
        <span className={`${clickPhase === 'end' ? 'text-red-400' : 'text-slate-500'}`}>End</span>
        <span className="text-slate-600 ml-2">Click on map to set</span>
      </div>
    </div>
  )
}

// === SOS FAB ===
function SOSFab() {
  return (
    <a href="tel:112"
      className="absolute bottom-36 right-4 z-[1000] w-14 h-14 rounded-full bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-2xl shadow-red-500/40 hover:from-red-500 hover:to-red-600 transition-all btn-press animate-fadeIn"
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
  const pathRef = useRef(null)
  const lastCheckRef = useRef(0)

  useEffect(() => {
    if (!navActive) {
      if (watchIdRef.current) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null }
      if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null }
      if (pathRef.current) { map.removeLayer(pathRef.current); pathRef.current = null }
      return
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        latestGpsRef.current = { lat: latitude, lng: longitude }

        // Update marker
        if (markerRef.current) map.removeLayer(markerRef.current)
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:14px;height:14px;
            background:#3b82f6;
            border:3px solid #1e293b;
            border-radius:50%;
            box-shadow:0 0 0 4px rgba(59,130,246,0.3);
          "></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        })
        markerRef.current = L.marker([latitude, longitude], { icon }).addTo(map)
        map.setView([latitude, longitude], map.getZoom(), { animate: true })

        // Route deviation check (every 30s)
        const now = Date.now()
        if (onVerifyTrajectory && routes && now - lastCheckRef.current > 30000) {
          lastCheckRef.current = now
          const activeRoute = routes[activeMode]
          if (activeRoute?.path) {
            onVerifyTrajectory(
              activeRoute.path.map(p => [p.lat, p.lon]),
              [latitude, longitude],
            ).catch(() => {})
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
  const lightTile = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
  const [poiFilter, setPoiFilter] = useState('')

  return (
    <div className="flex-1 relative">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url={mapDark ? darkTile : lightTile}
        />
        <MapClickHandler onMapClick={onMapClick} />
        <StartEndMarkers startCoords={startCoords} endCoords={endCoords} startName={startName} endName={endName} />
        <RouteLayer routes={routes} activeMode={activeMode} transportMode={transportMode} />
        <POILayer pois={pois} poiFilter={poiFilter} />
        <CompassControl />
        <GPSTracker navActive={navActive} latestGpsRef={latestGpsRef} onVerifyTrajectory={onVerifyTrajectory} routes={routes} activeMode={activeMode} />
      </MapContainer>

      {/* SOS FAB */}
      <SOSFab />

      {/* Top controls */}
      <div className="absolute top-4 left-4 z-[1000] flex gap-2">
        <button onClick={onToggleDark}
          className="glass rounded-xl px-3.5 py-2.5 text-xs text-slate-300 hover:text-white transition-all btn-press flex items-center gap-2 shadow-lg">
          {mapDark ? '☀️ Light' : '🌙 Dark'}
        </button>
        {isNight() && (
          <span className="glass rounded-xl px-3.5 py-2.5 text-xs text-indigo-300 flex items-center gap-1.5 shadow-lg border border-indigo-700/30">
            🌙 Night Mode Active
          </span>
        )}
      </div>

      {/* POI Filter */}
      <POIFilter poiFilter={poiFilter} setPoiFilter={setPoiFilter} />

      {/* Click phase indicator */}
      {!routes && <ClickPhaseIndicator clickPhase={clickPhase} />}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] glass rounded-xl px-3 py-2.5 text-xs shadow-lg">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded bg-blue-500"></span> Route</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 shadow-sm"></span> Hospital</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 shadow-sm"></span> Police</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 shadow-sm"></span> Landmark</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500 shadow-sm"></span> Transit</span>
        </div>
      </div>
    </div>
  )
}
