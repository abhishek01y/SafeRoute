import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

function getRouteColor(mode) {
  switch (mode) {
    case 'shortest': return '#3b82f6'
    case 'safest': return '#22c55e'
    case 'balanced': return '#a855f7'
    default: return '#3b82f6'
  }
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      if (onMapClick) onMapClick(e.latlng)
    },
  })
  return null
}

function RouteLayer({ routes, activeMode }) {
  const map = useMap()
  const layersRef = useRef({})

  useEffect(() => {
    Object.values(layersRef.current).forEach(l => map.removeLayer(l))
    layersRef.current = {}
    if (!routes) return

    const modes = ['shortest', 'balanced', 'safest']
    const available = modes.filter(m => routes[m] && routes[m].path && routes[m].path.length >= 2)
    const multiple = available.length > 1
    const boundsList = []

    available.forEach((mode, i) => {
      const route = routes[mode]
      if (!route || !route.path || route.path.length < 2) return

      const latlngs = route.path.map(p => [p.lat, p.lon])
      const isActive = mode === activeMode

      const polyline = L.polyline(latlngs, {
        color: getRouteColor(mode),
        weight: isActive ? 6 : 3,
        opacity: isActive ? 0.9 : 0.4,
        dashArray: mode === 'balanced' ? '10, 6' : null,
      }).addTo(map)

      if (route.total_distance_km && route.avg_safety_score) {
        const time = route.estimated_time_min || Math.round((route.total_distance_km / 35) * 60)
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

      layersRef.current[mode] = polyline
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
  routes, activeMode,
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
        <RouteLayer routes={routes} activeMode={activeMode} />
      </MapContainer>

      <div className="absolute top-4 left-4 z-[1000]">
        <button
          onClick={onToggleDark}
          className="bg-slate-900/80 backdrop-blur rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 transition flex items-center gap-2"
        >
          {mapDark ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

    </div>
  )
}
