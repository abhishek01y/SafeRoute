import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import Sidebar from '../components/Sidebar'
import XAIPanel from '../components/XAIPanel'
import RouteInfo from '../components/RouteInfo'
import { getEdges, compareRoutes, getXAI, getSystemReport } from '../utils/api'

const MapView = dynamic(() => import('../components/Map'), { ssr: false })

export default function Home() {
  const [edges, setEdges] = useState(null)
  const [startCoords, setStartCoords] = useState(null)
  const [endCoords, setEndCoords] = useState(null)
  const [routeMode, setRouteMode] = useState('balanced')
  const [transportMode, setTransportMode] = useState('car')
  const [activeMode, setActiveMode] = useState('balanced')
  const [routes, setRoutes] = useState(null)
  const [xaiData, setXaiData] = useState(null)
  const [systemReport, setSystemReport] = useState(null)
  const [mapDark, setMapDark] = useState(true)
  const [loading, setLoading] = useState(false)
  const [xaiLoading, setXaiLoading] = useState(false)
  const [clickPhase, setClickPhase] = useState('start')

  useEffect(() => {
    loadEdges()
    loadSystemReport()
  }, [])

  async function loadEdges() {
    try {
      const data = await getEdges()
      setEdges(data)
    } catch (err) {
      console.warn('Could not load edges:', err.message)
      setEdges({ type: 'FeatureCollection', features: [] })
    }
  }

  async function loadSystemReport() {
    try {
      const report = await getSystemReport()
      setSystemReport(report)
    } catch (err) {
      console.warn('Could not load system report')
    }
  }

  const handleMapClick = useCallback((latlng) => {
    const coords = { lat: latlng.lat, lon: latlng.lng }
    if (clickPhase === 'start') {
      setStartCoords(coords)
      setClickPhase('end')
    } else {
      setEndCoords(coords)
      setClickPhase('start')
    }
  }, [clickPhase])

  const handleEdgeClick = useCallback((feature) => {
    console.log('Edge clicked:', feature.properties)
  }, [])

  async function handleFindRoute() {
    if (!startCoords || !endCoords) return
    setLoading(true)
    setXaiLoading(true)

    try {
      const [routeData, xaiResult] = await Promise.all([
        compareRoutes(startCoords.lat, startCoords.lon, endCoords.lat, endCoords.lon, transportMode),
        getXAI(startCoords.lat, startCoords.lon, endCoords.lat, endCoords.lon, routeMode, transportMode),
      ])
      setRoutes(routeData)
      setActiveMode(routeMode)
      setXaiData(xaiResult)
    } catch (err) {
      console.error('Route error:', err)
      setRoutes(null)
      setXaiData(null)
    } finally {
      setLoading(false)
      setXaiLoading(false)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          startCoords={startCoords}
          setStartCoords={setStartCoords}
          endCoords={endCoords}
          setEndCoords={setEndCoords}
          routeMode={routeMode}
          setRouteMode={setRouteMode}
          transportMode={transportMode}
          setTransportMode={setTransportMode}
          onFindRoute={handleFindRoute}
          loading={loading}
          routeResult={routes?.[routeMode]}
          systemReport={systemReport}
        />

        <div className="flex-1 flex flex-col">
          <MapView
            edges={edges}
            routes={routes}
            activeMode={activeMode}
            mapDark={mapDark}
            onToggleDark={() => setMapDark(!mapDark)}
            onMapClick={handleMapClick}
            onEdgeClick={handleEdgeClick}
          />

          {routes && (
            <RouteInfo
              routes={routes}
              activeMode={activeMode}
              setActiveMode={setActiveMode}
            />
          )}

          <XAIPanel xaiData={xaiData} loading={xaiLoading} />
        </div>
      </div>
    </div>
  )
}
