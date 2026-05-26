import { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Sidebar from '../components/Sidebar'
import XAIPanel from '../components/XAIPanel'
import RouteInfo from '../components/RouteInfo'
import { compareRoutes, getXAI, getPOIs } from '../utils/api'
import { QUICK_ROUTES } from '../utils/locations'

const MapView = dynamic(() => import('../components/Map'), { ssr: false })

export default function Home() {
  const [startCoords, setStartCoords] = useState(null)
  const [endCoords, setEndCoords] = useState(null)
  const [startName, setStartName] = useState('')
  const [endName, setEndName] = useState('')
  const [transportMode, setTransportMode] = useState('car')
  const [activeMode, setActiveMode] = useState('balanced')
  const [routes, setRoutes] = useState(null)
  const [xaiData, setXaiData] = useState(null)
  const [mapDark, setMapDark] = useState(true)
  const [loading, setLoading] = useState(false)
  const [xaiLoading, setXaiLoading] = useState(false)
  const [clickPhase, setClickPhase] = useState('start')
  const [pois, setPois] = useState([])
  const [poiFilter, setPoiFilter] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [recentRoutes, setRecentRoutes] = useState([])
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    getPOIs().then(setPois).catch(() => {})
    try {
      const saved = JSON.parse(localStorage.getItem('recentRoutes') || '[]')
      setRecentRoutes(saved.slice(0, 5))
    } catch {}
    setTimeout(() => setMapReady(true), 500)
  }, [])

  const saveToRecent = useCallback((start, end, transport) => {
    const entry = { start, end, transport, ts: Date.now() }
    const updated = [entry, ...recentRoutes.filter(r => r.start !== start || r.end !== end)].slice(0, 5)
    setRecentRoutes(updated)
    try { localStorage.setItem('recentRoutes', JSON.stringify(updated)) } catch {}
  }, [recentRoutes])

  const handleMapClick = useCallback((latlng) => {
    const coords = { lat: latlng.lat, lng: latlng.lng }
    if (clickPhase === 'start') {
      setStartCoords(coords)
      setStartName(`${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`)
      setClickPhase('end')
    } else {
      setEndCoords(coords)
      setEndName(`${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`)
      setClickPhase('start')
    }
  }, [clickPhase])

  const handleLocSelect = useCallback((type, loc) => {
    const coords = { lat: loc.lat, lng: loc.lon }
    if (type === 'start') {
      setStartCoords(coords)
      setStartName(loc.name)
      setClickPhase('end')
    } else {
      setEndCoords(coords)
      setEndName(loc.name)
      setClickPhase('start')
    }
  }, [])

  const handleQuickRoute = useCallback((qr) => {
    setStartCoords({ lat: qr.slat, lng: qr.slon })
    setStartName(qr.start)
    setEndCoords({ lat: qr.elat, lng: qr.elon })
    setEndName(qr.end)
    setClickPhase('start')
  }, [])

  async function handleFindRoute() {
    if (!startCoords || !endCoords) return
    setLoading(true)
    setXaiLoading(true)
    setRoutes(null)
    setXaiData(null)

    try {
      const routeData = await compareRoutes(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng, transportMode)
      setRoutes(routeData)
      saveToRecent(startName || `${startCoords.lat.toFixed(4)},${startCoords.lng.toFixed(4)}`,
                   endName || `${endCoords.lat.toFixed(4)},${endCoords.lng.toFixed(4)}`, transportMode)
    } catch (err) {
      console.error('Route error:', err)
    } finally {
      setLoading(false)
    }

    try {
      const xaiResult = await getXAI(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng, activeMode, transportMode)
      setXaiData(xaiResult)
    } catch (err) {
      console.error('XAI error:', err)
    } finally {
      setXaiLoading(false)
    }
  }

  const handleSwap = useCallback(() => {
    const tmpCoords = startCoords
    const tmpName = startName
    setStartCoords(endCoords)
    setStartName(endName)
    setEndCoords(tmpCoords)
    setEndName(tmpName)
  }, [startCoords, endCoords, startName, endName])

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-3 left-3 z-[2000] w-10 h-10 rounded-xl glass flex items-center justify-center text-slate-300 hover:text-white"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sidebarOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} /></svg>
      </button>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 transition-transform duration-300 ease-in-out fixed lg:relative z-[1001] lg:z-auto h-full`}>
          <Sidebar
            startCoords={startCoords}
            endCoords={endCoords}
            startName={startName}
            endName={endName}
            setStartCoords={setStartCoords}
            setEndCoords={setEndCoords}
            setStartName={setStartName}
            setEndName={setEndName}
            transportMode={transportMode}
            setTransportMode={setTransportMode}
            onFindRoute={handleFindRoute}
            loading={loading}
            onLocSelect={handleLocSelect}
            onQuickRoute={handleQuickRoute}
            quickRoutes={QUICK_ROUTES}
            recentRoutes={recentRoutes}
            onSwap={handleSwap}
            onClose={() => setSidebarOpen(false)}
          />
        </div>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div onClick={() => setSidebarOpen(false)} className="lg:hidden fixed inset-0 bg-black/50 z-[1000]" />
        )}

        {/* Map + panels */}
        <div className="flex-1 flex flex-col relative">
          {!mapReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-400 text-sm">Loading map...</p>
              </div>
            </div>
          )}

          <MapView
            routes={routes}
            activeMode={activeMode}
            transportMode={transportMode}
            mapDark={mapDark}
            onToggleDark={() => setMapDark(!mapDark)}
            onMapClick={handleMapClick}
            pois={pois}
            poiFilter={poiFilter}
            clickPhase={clickPhase}
            startCoords={startCoords}
            endCoords={endCoords}
            startName={startName}
            endName={endName}
            sidebarOpen={sidebarOpen}
          />

          {routes && (
            <div className="animate-fadeInUp">
              <RouteInfo
                routes={routes}
                activeMode={activeMode}
                setActiveMode={setActiveMode}
                transportMode={transportMode}
                startName={startName}
                endName={endName}
              />
            </div>
          )}

          <XAIPanel xaiData={xaiData} loading={xaiLoading} />
        </div>
      </div>
    </div>
  )
}
