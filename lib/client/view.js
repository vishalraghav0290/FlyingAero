// Initial map view: URL (FR24 style "#lat,lon/zoom", Google zoom scale) -> last view -> region
// guessed from the browser time zone (no location permission or IP lookup needed).
const STORAGE_KEY = 'skyradar.view';

const REGIONS = [
  [/^Asia\/(Kolkata|Calcutta|Colombo|Kathmandu|Dhaka|Thimphu)/, 21.5, 78.5, 6],
  [/^Asia\/(Dubai|Muscat|Qatar|Bahrain|Riyadh|Kuwait|Tehran|Baghdad|Karachi)/, 25.3, 51.5, 7],
  [/^Asia\/(Shanghai|Hong_Kong|Taipei|Chongqing|Macau)/, 31.2, 117, 6],
  [/^Asia\/(Tokyo|Seoul)/, 36, 137, 7],
  [/^Asia\/(Singapore|Kuala_Lumpur|Jakarta|Bangkok|Manila|Ho_Chi_Minh|Yangon)/, 6, 104, 6],
  [/^Australia\//, -33.9, 151.2, 7],
  [/^Pacific\/Auckland/, -37, 174.8, 7],
  [/^Europe\/(London|Dublin|Lisbon)/, 51.5, -0.5, 8],
  [/^Europe\//, 50.1, 8.6, 7],
  [/^America\/(New_York|Toronto|Detroit|Montreal|Indiana)/, 40.7, -74, 8],
  [/^America\/(Chicago|Winnipeg|Mexico_City)/, 41.9, -87.9, 8],
  [/^America\/(Los_Angeles|Vancouver|Tijuana)/, 34, -118.4, 8],
  [/^America\/(Denver|Phoenix|Edmonton)/, 39.8, -104.7, 8],
  [/^America\/(Sao_Paulo|Buenos_Aires|Santiago|Bogota|Lima)/, -23.5, -46.6, 7],
  [/^Africa\//, 6, 20, 5],
];
const FALLBACK = { lat: 50.1, lon: 8.6, zoom: 7 };

const valid = (v) => v && Math.abs(v.lat) <= 85 && Math.abs(v.lon) <= 180 && v.zoom >= 2 && v.zoom <= 20;

export function initialView() {
  const m = location.hash.match(/^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (m) {
    const v = { lat: Number(m[1]), lon: Number(m[2]), zoom: Number(m[3]) };
    if (valid(v)) return v;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (valid(saved)) return saved;
  } catch {
    // ignore unreadable storage
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const region = REGIONS.find(([re]) => re.test(tz));
  return region ? { lat: region[1], lon: region[2], zoom: region[3] } : FALLBACK;
}

export function saveView(map) {
  const c = map.getCenter().wrap();
  const v = { lat: +c.lat.toFixed(2), lon: +c.lng.toFixed(2), zoom: +(map.getZoom() + 1).toFixed(1) };
  history.replaceState(null, '', `#${v.lat},${v.lon}/${v.zoom}`);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // storage may be disabled
  }
}
