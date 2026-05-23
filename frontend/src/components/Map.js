import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

function getSafetyColor(score) {
  if (score > 75) return '#22c55e'
  if (score >= 45) return '#eab308'
  return '#ef4444'
}

function getSafetyWeight(score) {
  if (score > 75) return 3
  if (score >= 45) return 2.5
  return 3.5
}

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

function MapBoundsUpdater({ edges, mode }) {
  const map = useMap()
  const boundsSet = useRef(false)

  useEffect(() => {
    if (edges && edges.features && edges.features.length > 0 && !boundsSet.current) {
      try {
        const geoLayer = L.geoJSON(edges)
        const bounds = geoLayer.getBounds()
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [30, 30] })
          boundsSet.current = true
        }
      } catch (e) {
        console.warn('Could not fit bounds:', e)
      }
    }
  }, [edges, map])

  return null
}

function EdgeLayer({ edges, onEdgeClick }) {
  const map = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    if (!edges || !edges.features) return
    if (layerRef.current) map.removeLayer(layerRef.current)

    // Only show safe roads on map
    layerRef.current = L.geoJSON(edges, {
      filter: feature => feature.properties.safety_score > 75,
      style: feature => ({
        color: getSafetyColor(feature.properties.safety_score),
        weight: getSafetyWeight(feature.properties.safety_score),
        opacity: 0.8,
      }),
      onEachFeature: (feature, layer) => {
        layer.on({ click: () => { if (onEdgeClick) onEdgeClick(feature) } })
        layer.bindTooltip(
          `<div style="font-size:12px">
            <b>${feature.properties.name}</b><br/>
            Safety: ${feature.properties.safety_score}/100<br/>
            Type: ${feature.properties.type}<br/>
            Length: ${feature.properties.length_km?.toFixed(2) || '?'} km
          </div>`,
          { sticky: true }
        )
      },
    }).addTo(map)

    return () => { if (layerRef.current) map.removeLayer(layerRef.current) }
  }, [edges, map, onEdgeClick])

  return null
}

function RouteLayer({ routes, activeMode }) {
  const map = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    if (layerRef.current) map.removeLayer(layerRef.current)
    if (!routes || !routes[activeMode]) return

    const route = routes[activeMode]
    if (!route.path || route.path.length < 2) return

    const latlngs = route.path.map(p => [p.lat, p.lon])
    const polyline = L.polyline(latlngs, {
      color: getRouteColor(activeMode),
      weight: 5, opacity: 0.9,
      dashArray: activeMode === 'balanced' ? '10, 6' : null,
    }).addTo(map)

    if (route.total_distance_km && route.avg_safety_score) {
      polyline.bindPopup(
        `<div style="font-size:13px; min-width:180px">
          <b>${activeMode.toUpperCase()} Route</b><br/>
          Distance: ${route.total_distance_km} km<br/>
          Safety: ${route.avg_safety_score}/100<br/>
          Edges: ${route.path_edges?.length || 0}
        </div>`
      )
    }

    layerRef.current = polyline

    const first = route.path[0], last = route.path[route.path.length - 1]
    L.marker([first.lat, first.lon], { icon: L.divIcon({ className: 'custom-marker start', iconSize: [16, 16] }) }).addTo(map).bindTooltip('Start', { permanent: false })
    L.marker([last.lat, last.lon], { icon: L.divIcon({ className: 'custom-marker end', iconSize: [16, 16] }) }).addTo(map).bindTooltip('End', { permanent: false })

    return () => { if (layerRef.current) map.removeLayer(layerRef.current) }
  }, [routes, activeMode, map])

  return null
}

export default function MapView({
  edges, routes, activeMode,
  onMapClick, onEdgeClick, mapDark, onToggleDark,
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
        <MapBoundsUpdater edges={edges} mode={activeMode} />
        <EdgeLayer edges={edges} onEdgeClick={onEdgeClick} />
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

      {routes && routes[activeMode] && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur rounded-lg border border-slate-700 px-4 py-2 text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 rounded" style={{ background: getRouteColor(activeMode) }}></span>
              <span className="capitalize text-slate-300">{activeMode}</span>
            </div>
            <span className="text-slate-400">{routes[activeMode].total_distance_km} km</span>
            <span className="text-slate-400">Safety: {routes[activeMode].avg_safety_score}/100</span>
          </div>
        </div>
      )}


    </div>
  )
}
