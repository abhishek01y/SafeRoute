import { useEffect, useRef } from 'react'
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
  useMapEvents({
    click(e) {
      if (onMapClick) onMapClick(e.latlng)
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

export default function MapView({
  routes, activeMode, transportMode,
  onMapClick, mapDark, onToggleDark,
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
      </MapContainer>

      <div className="absolute top-4 left-4 z-[1000] flex gap-2">
        <button
          onClick={onToggleDark}
          className="bg-slate-900/80 backdrop-blur rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 transition flex items-center gap-2"
        >
          {mapDark ? '☀️ Light' : '🌙 Dark'}
        </button>
        {isNight() && (
          <span className="bg-indigo-900/80 backdrop-blur rounded-lg border border-indigo-700 px-3 py-2 text-xs text-indigo-300 flex items-center gap-1.5">
            🌙 Night
          </span>
        )}
      </div>

    </div>
  )
}
