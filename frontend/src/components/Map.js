import { useEffect, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

const MODES = ['shortest', 'balanced', 'safest']

function isNight() {
  const h = new Date().getHours()
  return h < 6 || h >= 19
}

function getRouteColor(i) {
  const colors = ['#3b82f6', '#a855f7', '#22c55e']
  return colors[i % colors.length]
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

function RouteLayer({ routes, activeMode, transportMode }) {
  const map = useMap()
  const layersRef = useRef({})

  useEffect(() => {
    Object.values(layersRef.current).forEach(l => map.removeLayer(l))
    layersRef.current = {}
    if (!routes) return

    const unique = getUniqueRoutes(routes)
    const multiple = unique.length > 1
    const boundsList = []

    unique.forEach((route, i) => {
      const latlngs = route.path.map(p => [p.lat, p.lon])
      const isActive = route._key === activeMode

      const polyline = L.polyline(latlngs, {
        color: getRouteColor(i),
        weight: isActive ? 6 : 3,
        opacity: isActive ? 0.9 : 0.4,
        dashArray: i === 1 ? '10, 6' : null,
      }).addTo(map)

      if (route.total_distance_km && route.avg_safety_score) {
        const speed = { car: 20, motorcycle: 25, walk: 5 }[transportMode] || 20
        const time = route.estimated_time_min || Math.round((route.total_distance_km / speed) * 60)
        const label = multiple ? `Route ${i + 1}` : 'Route'
        polyline.bindPopup(
          `<div style="font-size:13px; min-width:180px">
            <b>${label}</b><br/>
            Distance: ${route.total_distance_km} km<br/>
            Time: ~${time} min<br/>
            Safety: ${route.avg_safety_score}/100
          </div>`
        )
      }

      layersRef.current[route._key] = polyline
      boundsList.push(...latlngs)
    })

    if (boundsList.length > 0) {
      map.fitBounds(L.latLngBounds(boundsList), { padding: [40, 40] })
    }

    return () => { Object.values(layersRef.current).forEach(l => map.removeLayer(l)) }
  }, [routes, activeMode, map])

  return null
}

const POI_COLORS = { hospital: '#ef4444', police: '#3b82f6', landmark: '#f59e0b', transit: '#8b5cf6' }
const POI_ICONS = { hospital: '🏥', police: '🚔', landmark: '🏛️', transit: '🚉' }

function POILayer({ pois }) {
  const map = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }
    if (!pois || pois.length === 0) return

    const group = L.layerGroup()
    pois.forEach(p => {
      const color = POI_COLORS[p.type] || '#94a3b8'
      const icon = POI_ICONS[p.type] || '📍'
      const marker = L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div style="
            width:32px;height:32px;
            background:${color}22;
            border:2px solid ${color};
            border-radius:8px;
            display:flex;align-items:center;justify-content:center;
            font-size:14px;
            box-shadow:0 2px 8px ${color}44, 0 1px 3px rgba(0,0,0,0.3);
            transform:rotateX(5deg);
            transition:transform 0.2s;
            cursor:pointer;
          ">${icon}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -20],
        })
      }).bindPopup(`
        <div style="font-size:13px;min-width:140px">
          <b>${p.name}</b><br/>
          <span style="color:${color};text-transform:capitalize;font-size:11px">${p.type}</span>
        </div>
      `)
      group.addLayer(marker)
    })
    group.addTo(map)
    layerRef.current = group

    return () => { if (layerRef.current) map.removeLayer(layerRef.current) }
  }, [pois, map])

  return null
}

function CompassControl() {
  const map = useMap()
  const [angle, setAngle] = useState(0)

  const rotateMap = useCallback((deg) => {
    const newAngle = ((angle + deg) % 360 + 360) % 360
    setAngle(newAngle)
    map._rotationAngle = newAngle
    const container = map.getContainer()
    const mapPane = container.querySelector('.leaflet-map-pane')
    if (mapPane) {
      mapPane.style.transformOrigin = '50% 50%'
      mapPane.style.transform = `rotate(${newAngle}deg)`
    }
  }, [angle, map])

  const resetRotation = useCallback(() => {
    setAngle(0)
    map._rotationAngle = 0
    const container = map.getContainer()
    const mapPane = container.querySelector('.leaflet-map-pane')
    if (mapPane) {
      mapPane.style.transformOrigin = '50% 50%'
      mapPane.style.transform = 'rotate(0deg)'
    }
  }, [map])

  return (
    <div className="absolute bottom-20 right-4 z-[1000] flex flex-col items-center gap-1">
      <button
        onClick={() => rotateMap(90)}
        onContextMenu={(e) => { e.preventDefault(); rotateMap(-90) }}
        onDoubleClick={(e) => { e.preventDefault(); resetRotation() }}
        title="Click: 90° CW | Right-click: 90° CCW | Double-click: Reset"
        className="w-12 h-12 rounded-full bg-slate-900/90 backdrop-blur border border-slate-600 hover:border-blue-500 transition-all flex items-center justify-center shadow-lg cursor-pointer select-none"
      >
        <svg viewBox="0 0 50 50" className="w-8 h-8" style={{ transform: `rotate(${-angle}deg)` }}>
          <circle cx="25" cy="25" r="23" fill="none" stroke="#475569" strokeWidth="1.5" />
          <line x1="25" y1="3" x2="25" y2="47" stroke="#475569" strokeWidth="0.8" />
          <line x1="3" y1="25" x2="47" y2="25" stroke="#475569" strokeWidth="0.8" />
          <polygon points="25,4 21,20 25,17 29,20" fill="#ef4444" />
          <polygon points="25,46 21,30 25,33 29,30" fill="#94a3b8" />
          <circle cx="25" cy="25" r="3" fill="#1e293b" stroke="#475569" strokeWidth="1" />
          <text x="25" y="10" textAnchor="middle" fontSize="6" fill="#ef4444" fontWeight="bold">N</text>
        </svg>
      </button>
      {angle !== 0 && (
        <button onClick={resetRotation} className="text-[10px] text-slate-400 hover:text-white bg-slate-800/80 rounded px-2 py-0.5 border border-slate-600">
          Reset
        </button>
      )}
    </div>
  )
}

export default function MapView({
  routes, activeMode, transportMode,
  onMapClick, mapDark, onToggleDark,
  pois,
}) {
  const defaultCenter = [28.6139, 77.2090]
  const defaultZoom = 12

  const darkTile = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
  const lightTile = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"

  return (
    <div className="flex-1 relative">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url={mapDark ? darkTile : lightTile}
        />
        <MapClickHandler onMapClick={onMapClick} />
        <RouteLayer routes={routes} activeMode={activeMode} transportMode={transportMode} />
        <POILayer pois={pois} />
        <CompassControl />
      </MapContainer>

      <div className="absolute top-4 left-4 z-[1000] flex gap-2">
        <button
          onClick={onToggleDark}
          className="bg-slate-900/80 backdrop-blur rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 transition flex items-center gap-2 shadow-lg"
        >
          {mapDark ? '☀️ Light' : '🌙 Dark'}
        </button>
        {isNight() && (
          <span className="bg-indigo-900/80 backdrop-blur rounded-lg border border-indigo-700 px-3 py-2 text-xs text-indigo-300 flex items-center gap-1.5 shadow-lg">
            🌙 Night
          </span>
        )}
      </div>

      <div className="absolute bottom-4 left-4 z-[1000] flex items-center gap-3 bg-slate-900/80 backdrop-blur rounded-lg border border-slate-700 px-3 py-2 text-xs shadow-lg">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Route</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Hospital</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400"></span> Police</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Landmark</span>
        <span className="text-slate-500 ml-1">Click map to set start/end</span>
      </div>
    </div>
  )
}