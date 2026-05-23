import { useState } from 'react'

const SAMPLE_LOCATIONS = [
  { name: "Connaught Place", lat: 28.6315, lon: 77.2167 },
  { name: "India Gate", lat: 28.6129, lon: 77.2295 },
  { name: "Lajpat Nagar", lat: 28.5650, lon: 77.2430 },
  { name: "Karol Bagh", lat: 28.6510, lon: 77.1900 },
  { name: "Dwarka", lat: 28.5900, lon: 77.0500 },
  { name: "Rohini", lat: 28.7350, lon: 77.1150 },
  { name: "Saket", lat: 28.5280, lon: 77.2150 },
  { name: "Vasant Kunj", lat: 28.5100, lon: 77.1600 },
  { name: "Chandni Chowk", lat: 28.6560, lon: 77.2300 },
  { name: "Hauz Khas", lat: 28.5490, lon: 77.2050 },
  { name: "Nehru Place", lat: 28.5480, lon: 77.2510 },
  { name: "Pitampura", lat: 28.7010, lon: 77.1400 },
  { name: "Janakpuri", lat: 28.6210, lon: 77.0900 },
  { name: "Mayur Vihar", lat: 28.6100, lon: 77.2900 },
  { name: "Greater Kailash", lat: 28.5570, lon: 77.2400 },
  { name: "Rajendra Nagar", lat: 28.6420, lon: 77.1800 },
  { name: "Patel Nagar", lat: 28.6480, lon: 77.1700 },
  { name: "Rajouri Garden", lat: 28.6470, lon: 77.1200 },
  { name: "Tilak Nagar", lat: 28.6330, lon: 77.0950 },
  { name: "Uttam Nagar", lat: 28.6180, lon: 77.0600 },
  { name: "Paschim Vihar", lat: 28.6670, lon: 77.0950 },
  { name: "Punjabi Bagh", lat: 28.6650, lon: 77.1300 },
  { name: "Shalimar Bagh", lat: 28.7100, lon: 77.1600 },
  { name: "Model Town", lat: 28.7150, lon: 77.1850 },
  { name: "Kingsway Camp", lat: 28.7300, lon: 77.2000 },
  { name: "GTB Nagar", lat: 28.7050, lon: 77.2000 },
  { name: "Kamla Nagar", lat: 28.6850, lon: 77.1950 },
  { name: "Civil Lines", lat: 28.6750, lon: 77.2200 },
  { name: "Daryaganj", lat: 28.6420, lon: 77.2400 },
  { name: "Paharganj", lat: 28.6450, lon: 77.2130 },
  { name: "Sadar Bazar", lat: 28.6650, lon: 77.2100 },
  { name: "Delhi Junction (Old Delhi)", lat: 28.6615, lon: 77.2270 },
  { name: "Kashmere Gate", lat: 28.6680, lon: 77.2300 },
  { name: "ISBT Kashmere Gate", lat: 28.6720, lon: 77.2320 },
  { name: "Red Fort", lat: 28.6560, lon: 77.2410 },
  { name: "Jama Masjid", lat: 28.6510, lon: 77.2330 },
  { name: "Dilshad Garden", lat: 28.6850, lon: 77.3100 },
  { name: "Shahdara", lat: 28.6880, lon: 77.2850 },
  { name: "Krishna Nagar", lat: 28.6550, lon: 77.2700 },
  { name: "Laxmi Nagar", lat: 28.6400, lon: 77.2750 },
  { name: "Preet Vihar", lat: 28.6350, lon: 77.2850 },
  { name: "IP Extension", lat: 28.6250, lon: 77.2850 },
  { name: "Anand Vihar", lat: 28.6480, lon: 77.2950 },
  { name: "Kaushambi", lat: 28.6400, lon: 77.3050 },
  { name: "Vaishali", lat: 28.6480, lon: 77.3200 },
  { name: "Indirapuram", lat: 28.6300, lon: 77.3300 },
  { name: "Sarojini Nagar", lat: 28.5780, lon: 77.1950 },
  { name: "Moti Bagh", lat: 28.5680, lon: 77.1750 },
  { name: "R K Puram", lat: 28.5630, lon: 77.1800 },
  { name: "Chanakyapuri", lat: 28.5900, lon: 77.1850 },
  { name: "Lodhi Colony", lat: 28.5850, lon: 77.2250 },
  { name: "Jor Bagh", lat: 28.5850, lon: 77.2150 },
  { name: "Safdarjung Enclave", lat: 28.5500, lon: 77.1900 },
  { name: "Green Park", lat: 28.5450, lon: 77.2000 },
  { name: "Malviya Nagar", lat: 28.5350, lon: 77.2100 },
  { name: "Chittaranjan Park", lat: 28.5300, lon: 77.2450 },
  { name: "Kalkaji", lat: 28.5450, lon: 77.2550 },
  { name: "Govindpuri", lat: 28.5300, lon: 77.2600 },
  { name: "Okhla", lat: 28.5600, lon: 77.2800 },
  { name: "Jamia Nagar", lat: 28.5650, lon: 77.2800 },
  { name: "New Friends Colony", lat: 28.5650, lon: 77.2650 },
  { name: "Jangpura", lat: 28.5800, lon: 77.2450 },
  { name: "Defence Colony", lat: 28.5700, lon: 77.2300 },
  { name: "Nizamuddin West", lat: 28.5850, lon: 77.2500 },
  { name: "Nizamuddin East", lat: 28.5950, lon: 77.2550 },
  { name: "Munirka", lat: 28.5450, lon: 77.1700 },
  { name: "Vasant Vihar", lat: 28.5500, lon: 77.1600 },
  { name: "Mahipalpur", lat: 28.5400, lon: 77.1300 },
  { name: "Shanti Niketan", lat: 28.5850, lon: 77.1650 },
  { name: "Hauz Khas Village", lat: 28.5550, lon: 77.2000 },
  { name: "Qutub Minar", lat: 28.5245, lon: 77.1850 },
  { name: "Chattarpur", lat: 28.4900, lon: 77.1800 },
  { name: "Mehrauli", lat: 28.5150, lon: 77.1800 },
  { name: "Tughlakabad", lat: 28.5100, lon: 77.2650 },
  { name: "Badarpur", lat: 28.4900, lon: 77.2900 },
  { name: "Sarita Vihar", lat: 28.5300, lon: 77.2850 },
  { name: "Badli", lat: 28.7550, lon: 77.1300 },
  { name: "Samaipur", lat: 28.7400, lon: 77.1400 },
  { name: "Bawana", lat: 28.7800, lon: 77.0700 },
  { name: "Narela", lat: 28.8350, lon: 77.1000 },
  { name: "Loni", lat: 28.7500, lon: 77.2700 },
  { name: "Mukherjee Nagar", lat: 28.7100, lon: 77.2200 },
  { name: "Azadpur", lat: 28.7100, lon: 77.1800 },
  { name: "Jahangirpuri", lat: 28.7350, lon: 77.1600 },
  { name: "Ashok Vihar", lat: 28.6900, lon: 77.1700 },
  { name: "Wazirpur", lat: 28.6900, lon: 77.1550 },
  { name: "Lawrence Road", lat: 28.7150, lon: 77.1400 },
  { name: "Ramesh Nagar", lat: 28.6550, lon: 77.1050 },
  { name: "Hari Nagar", lat: 28.6250, lon: 77.1100 },
  { name: "Mohan Garden", lat: 28.6100, lon: 77.0500 },
  { name: "Najafgarh", lat: 28.6100, lon: 76.9800 },
  { name: "Nangloi", lat: 28.6800, lon: 77.0650 },
  { name: "Delhi Cantt", lat: 28.5700, lon: 77.1200 },
  { name: "Palam", lat: 28.5750, lon: 77.0900 },
  { name: "IGI Airport (T1)", lat: 28.5550, lon: 77.1000 },
  { name: "IGI Airport (T3)", lat: 28.5600, lon: 77.1200 },
  { name: "Vijay Nagar", lat: 28.6900, lon: 77.2050 },
  { name: "Indraprastha", lat: 28.6250, lon: 77.2550 },
  { name: "Noida Sector 15", lat: 28.5850, lon: 77.3200 },
  { name: "Noida Sector 18", lat: 28.5700, lon: 77.3250 },
  { name: "Noida Sector 62", lat: 28.6150, lon: 77.3650 },
  { name: "Gurgaon MG Road", lat: 28.4770, lon: 77.0850 },
  { name: "Gurgaon Sector 29", lat: 28.4700, lon: 77.0700 },
  { name: "Cyber City Gurgaon", lat: 28.4950, lon: 77.0900 },
  { name: "Ghaziabad", lat: 28.6780, lon: 77.4600 },
  { name: "Nehru Stadium", lat: 28.5800, lon: 77.2350 },
  { name: "AIIMS Delhi", lat: 28.5670, lon: 77.2100 },
  { name: "Dhaula Kuan", lat: 28.5950, lon: 77.1700 },
  { name: "ITO", lat: 28.6250, lon: 77.2350 },
  { name: "Mandi House", lat: 28.6250, lon: 77.2300 },
  { name: "Supreme Court", lat: 28.6220, lon: 77.2400 },
  { name: "Parliament House", lat: 28.6170, lon: 77.2080 },
  { name: "Rashtrapati Bhavan", lat: 28.6140, lon: 77.2000 },
  { name: "Lotus Temple", lat: 28.5530, lon: 77.2580 },
  { name: "Akshardham Temple", lat: 28.6120, lon: 77.2750 },
  { name: "Lodhi Garden", lat: 28.5900, lon: 77.2200 },
  { name: "JNU Campus", lat: 28.5400, lon: 77.1700 },
  { name: "IIT Delhi", lat: 28.5450, lon: 77.1900 },
  { name: "Delhi University (North)", lat: 28.6900, lon: 77.2100 },
  { name: "Delhi University (South)", lat: 28.5600, lon: 77.1950 },
]

const TRANSPORT_MODES = [
  { value: 'car', label: 'Car / 4-Wheeler', icon: '🚗', desc: 'All cars, SUVs, autos' },
  { value: 'motorcycle', label: 'Motorcycle / 2-Wheeler', icon: '🏍️', desc: 'Bikes, scooters, cycles' },
  { value: 'walk', label: 'Walk', icon: '🚶', desc: 'Pedestrian routes' },
]

export default function Sidebar({
  startCoords, setStartCoords,
  endCoords, setEndCoords,
  transportMode, setTransportMode,
  onFindRoute,
  loading,
  routeResult,
}) {
  const [startInput, setStartInput] = useState('')
  const [endInput, setEndInput] = useState('')
  const [showStartSuggestions, setShowStartSuggestions] = useState(false)
  const [showEndSuggestions, setShowEndSuggestions] = useState(false)

  const filteredStarts = SAMPLE_LOCATIONS.filter(l =>
    l.name.toLowerCase().includes(startInput.toLowerCase())
  )
  const filteredEnds = SAMPLE_LOCATIONS.filter(l =>
    l.name.toLowerCase().includes(endInput.toLowerCase())
  )

  function handleStartSelect(loc) {
    setStartCoords({ lat: loc.lat, lon: loc.lon })
    setStartInput(loc.name)
    setShowStartSuggestions(false)
  }

  function handleEndSelect(loc) {
    setEndCoords({ lat: loc.lat, lon: loc.lon })
    setEndInput(loc.name)
    setShowEndSuggestions(false)
  }

  function getSafetyColor(score) {
    if (score > 75) return 'text-green-400'
    if (score >= 45) return 'text-yellow-400'
    return 'text-red-400'
  }

  function getSafetyBar(score) {
    if (score > 75) return 'bg-green-500'
    if (score >= 45) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  return (
    <div className="w-96 bg-slate-900 border-r border-slate-700 flex flex-col h-full overflow-hidden">
      <div className="p-5 border-b border-slate-700">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <span>🛡️</span> Delhi Safe Route
        </h1>
        <p className="text-slate-400 text-sm mt-1">AI-Powered Smart Navigation</p>
      </div>

      <div className="p-5 space-y-4 flex-1 overflow-y-auto">
        <div>
          <label className="text-sm text-slate-400 block mb-1">Start Location</label>
          <div className="relative">
            <input
              type="text"
              value={startInput}
              onChange={e => { setStartInput(e.target.value); setShowStartSuggestions(true) }}
              onFocus={() => setShowStartSuggestions(true)}
              onBlur={() => setTimeout(() => setShowStartSuggestions(false), 200)}
              placeholder="Search or pick on map..."
              className="w-full bg-slate-800 text-white px-3 py-2 rounded border border-slate-600 focus:border-blue-500 outline-none text-sm"
            />
            {showStartSuggestions && startInput && (
              <div className="absolute z-20 w-full bg-slate-800 border border-slate-600 rounded mt-1 max-h-48 overflow-y-auto">
                {filteredStarts.map(loc => (
                  <button
                    key={loc.name}
                    className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                    onMouseDown={() => handleStartSelect(loc)}
                  >
                    {loc.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm text-slate-400 block mb-1">Destination</label>
          <div className="relative">
            <input
              type="text"
              value={endInput}
              onChange={e => { setEndInput(e.target.value); setShowEndSuggestions(true) }}
              onFocus={() => setShowEndSuggestions(true)}
              onBlur={() => setTimeout(() => setShowEndSuggestions(false), 200)}
              placeholder="Search or pick on map..."
              className="w-full bg-slate-800 text-white px-3 py-2 rounded border border-slate-600 focus:border-blue-500 outline-none text-sm"
            />
            {showEndSuggestions && endInput && (
              <div className="absolute z-20 w-full bg-slate-800 border border-slate-600 rounded mt-1 max-h-48 overflow-y-auto">
                {filteredEnds.map(loc => (
                  <button
                    key={loc.name}
                    className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                    onMouseDown={() => handleEndSelect(loc)}
                  >
                    {loc.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {startCoords && (
          <div className="text-xs text-slate-500">
            Start: {startCoords.lat.toFixed(4)}, {startCoords.lon.toFixed(4)}
          </div>
        )}
        {endCoords && (
          <div className="text-xs text-slate-500">
            End: {endCoords.lat.toFixed(4)}, {endCoords.lon.toFixed(4)}
          </div>
        )}

        <div>
          <label className="text-sm text-slate-400 block mb-2">Transport Mode</label>
          <div className="grid grid-cols-3 gap-1.5">
            {TRANSPORT_MODES.map(tm => (
              <button
                key={tm.value}
                onClick={() => setTransportMode(tm.value)}
                className={`text-center px-2 py-2 rounded border text-xs transition-all ${
                  transportMode === tm.value
                    ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                    : 'border-slate-600 bg-slate-800 text-slate-400 hover:border-slate-500'
                }`}
              >
                <div className="text-base">{tm.icon}</div>
                <div className="font-medium mt-0.5">{tm.label.split('/')[0].trim()}</div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onFindRoute}
          disabled={!startCoords || !endCoords || loading}
          className={`w-full py-3 rounded-lg font-medium text-sm transition-all ${
            loading
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700'
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></span>
              Calculating...
            </span>
          ) : (
            'Find Route'
          )}
        </button>

        

        
      </div>

      <div className="p-3 border-t border-slate-700"></div>
    </div>
  )
}
