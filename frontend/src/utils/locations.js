export const LOCATION_CATEGORIES = [
  {
    name: '📍 Popular Landmarks',
    locations: [
      { name: 'Red Fort', lat: 28.6560, lon: 77.2410 },
      { name: 'Connaught Place', lat: 28.6315, lon: 77.2167 },
      { name: 'India Gate', lat: 28.6129, lon: 77.2295 },
      { name: 'Qutub Minar', lat: 28.5245, lon: 77.1850 },
      { name: 'Lotus Temple', lat: 28.5530, lon: 77.2580 },
      { name: 'Akshardham Temple', lat: 28.6120, lon: 77.2750 },
      { name: 'Jama Masjid', lat: 28.6510, lon: 77.2330 },
      { name: 'Chandni Chowk', lat: 28.6560, lon: 77.2300 },
      { name: 'Parliament House', lat: 28.6170, lon: 77.2080 },
      { name: 'Rashtrapati Bhavan', lat: 28.6140, lon: 77.2000 },
    ],
  },
  {
    name: '🏙️ Commercial Hubs',
    locations: [
      { name: 'Nehru Place', lat: 28.5480, lon: 77.2510 },
      { name: 'Karol Bagh', lat: 28.6510, lon: 77.1900 },
      { name: 'Lajpat Nagar', lat: 28.5650, lon: 77.2430 },
      { name: 'Hauz Khas', lat: 28.5490, lon: 77.2050 },
      { name: 'Saket', lat: 28.5280, lon: 77.2150 },
      { name: 'Dwarka', lat: 28.5900, lon: 77.0500 },
      { name: 'Rohini', lat: 28.7350, lon: 77.1150 },
      { name: 'Pitampura', lat: 28.7010, lon: 77.1400 },
      { name: 'Janakpuri', lat: 28.6210, lon: 77.0900 },
      { name: 'Rajouri Garden', lat: 28.6470, lon: 77.1200 },
    ],
  },
  {
    name: '🏛️ Government & Institutions',
    locations: [
      { name: 'Supreme Court', lat: 28.6220, lon: 77.2400 },
      { name: 'AIIMS Delhi', lat: 28.5670, lon: 77.2100 },
      { name: 'IIT Delhi', lat: 28.5450, lon: 77.1900 },
      { name: 'Delhi University (North)', lat: 28.6900, lon: 77.2100 },
      { name: 'JNU Campus', lat: 28.5400, lon: 77.1700 },
      { name: 'ITO', lat: 28.6250, lon: 77.2350 },
      { name: 'Mandi House', lat: 28.6250, lon: 77.2300 },
      { name: 'Dhaula Kuan', lat: 28.5950, lon: 77.1700 },
    ],
  },
  {
    name: '🚉 Transport Hubs',
    locations: [
      { name: 'Delhi Junction (Old Delhi)', lat: 28.6615, lon: 77.2270 },
      { name: 'Kashmere Gate', lat: 28.6680, lon: 77.2300 },
      { name: 'ISBT Kashmere Gate', lat: 28.6720, lon: 77.2320 },
      { name: 'IGI Airport (T3)', lat: 28.5600, lon: 77.1200 },
      { name: 'IGI Airport (T1)', lat: 28.5550, lon: 77.1000 },
      { name: 'Nizamuddin Railway Station', lat: 28.5850, lon: 77.2550 },
      { name: 'Anand Vihar Terminal', lat: 28.6480, lon: 77.2950 },
    ],
  },
  {
    name: '🏘️ Residential Areas',
    locations: [
      { name: 'Greater Kailash', lat: 28.5570, lon: 77.2400 },
      { name: 'Defence Colony', lat: 28.5700, lon: 77.2300 },
      { name: 'Vasant Kunj', lat: 28.5100, lon: 77.1600 },
      { name: 'Mayur Vihar', lat: 28.6100, lon: 77.2900 },
      { name: 'Patel Nagar', lat: 28.6480, lon: 77.1700 },
      { name: 'Tilak Nagar', lat: 28.6330, lon: 77.0950 },
      { name: 'Paschim Vihar', lat: 28.6670, lon: 77.0950 },
      { name: 'Shalimar Bagh', lat: 28.7100, lon: 77.1600 },
      { name: 'Model Town', lat: 28.7150, lon: 77.1850 },
      { name: 'Sarojini Nagar', lat: 28.5780, lon: 77.1950 },
      { name: 'Lodhi Colony', lat: 28.5850, lon: 77.2250 },
      { name: 'Chanakyapuri', lat: 28.5900, lon: 77.1850 },
      { name: 'Malviya Nagar', lat: 28.5350, lon: 77.2100 },
      { name: 'Green Park', lat: 28.5450, lon: 77.2000 },
    ],
  },
  {
    name: '🌆 NCR Cities',
    locations: [
      { name: 'Noida Sector 18', lat: 28.5700, lon: 77.3250 },
      { name: 'Noida Sector 62', lat: 28.6150, lon: 77.3650 },
      { name: 'Gurgaon MG Road', lat: 28.4770, lon: 77.0850 },
      { name: 'Cyber City Gurgaon', lat: 28.4950, lon: 77.0900 },
      { name: 'Ghaziabad', lat: 28.6780, lon: 77.4600 },
      { name: 'Indirapuram', lat: 28.6300, lon: 77.3300 },
      { name: 'Vaishali', lat: 28.6480, lon: 77.3200 },
    ],
  },
];

export const FLAT_LOCATIONS = LOCATION_CATEGORIES.flatMap(c => c.locations);

export const QUICK_ROUTES = [
  { name: 'Red Fort → CP', start: 'Red Fort', end: 'Connaught Place', slat: 28.6560, slon: 77.2410, elat: 28.6315, elon: 77.2167 },
  { name: 'CP → India Gate', start: 'Connaught Place', end: 'India Gate', slat: 28.6315, slon: 77.2167, elat: 28.6129, elon: 77.2295 },
  { name: 'Airport → CP', start: 'IGI Airport (T3)', end: 'Connaught Place', slat: 28.5600, slon: 77.1200, elat: 28.6315, elon: 77.2167 },
  { name: 'Delhi Jn → Chandni Chowk', start: 'Delhi Junction (Old Delhi)', end: 'Chandni Chowk', slat: 28.6615, slon: 77.2270, elat: 28.6560, elon: 77.2300 },
  { name: 'Qutub → Lotus Temple', start: 'Qutub Minar', end: 'Lotus Temple', slat: 28.5245, slon: 77.1850, elat: 28.5530, elon: 77.2580 },
  { name: 'Hauz Khas → Saket', start: 'Hauz Khas', end: 'Saket', slat: 28.5490, slon: 77.2050, elat: 28.5280, elon: 77.2150 },
];

export function getSafetyColor(score) {
  if (score > 75) return 'text-green-400';
  if (score >= 55) return 'text-yellow-400';
  return 'text-red-400';
}

export function getSafetyBg(score) {
  if (score > 75) return 'bg-green-500';
  if (score >= 55) return 'bg-yellow-500';
  return 'bg-red-500';
}

export function calcTime(distKm, transport) {
  const speed = { car: 20, motorcycle: 25, walk: 5 }[transport] || 20;
  return distKm ? Math.round((distKm / speed) * 60) : null;
}

export function bearing(p1, p2) {
  const dLon = ((p2.lon || p2.lng || 0) - (p1.lon || p1.lng || 0)) * Math.PI / 180;
  const lat1 = (p1.lat || 0) * Math.PI / 180;
  const lat2 = (p2.lat || 0) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return Math.atan2(y, x) * 180 / Math.PI;
}

export function computeTurns(path, threshold = 30) {
  if (!path || path.length < 3) return 0;
  let turns = 0;
  for (let i = 2; i < path.length; i++) {
    const b1 = bearing(path[i - 2], path[i - 1]);
    const b2 = bearing(path[i - 1], path[i]);
    const diff = Math.abs(b1 - b2);
    if (diff > threshold && diff < 330) turns++;
  }
  return turns;
}
