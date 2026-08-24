/**
 * Community ADS-B aggregators (adsb.lol, adsb.fi) as a data source.
 *
 * Both are free, keyless and reachable from cloud hosts (unlike OpenSky). Their data is
 * openly licensed (ODbL), so it must be attributed. They ask for a descriptive
 * User-Agent with contact info and modest request rates (about 1 request / second).
 *
 * Responses are converted to OpenSky state vectors (same field order and units: metres,
 * m/s), so the feed, cache and browser code don't care which source answered. Two extra
 * columns carry what OpenSky doesn't send: [18] ICAO type code and [19] registration.
 */
const USER_AGENT = 'SkyRadar/0.3 (+https://github.com/vishalraghav0290/FlyingAero)';
const FT = 0.3048;
const KT = 0.514444;
const FPM = 0.00508;
export const MAX_RADIUS_NM = 250;
const TIMEOUT_MS = 12_000;

const PROVIDERS = [
  {
    name: 'adsb.lol',
    point: (lat, lon, nm) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${nm}`,
    hex: (hex) => `https://api.adsb.lol/v2/hex/${hex}`,
  },
  {
    name: 'adsb.fi',
    point: (lat, lon, nm) => `https://opendata.adsb.fi/api/v3/lat/${lat}/lon/${lon}/dist/${nm}`,
    hex: (hex) => `https://opendata.adsb.fi/api/v2/hex/${hex}`,
  },
];

// ADS-B emitter category ("A3") -> OpenSky numeric category
const CATEGORY = { A1: 2, A2: 3, A3: 4, A4: 5, A5: 6, A6: 7, A7: 8, B1: 9, B2: 10, B3: 11, B4: 12, B6: 14, B7: 15, C1: 16, C2: 17, C3: 18 };

const R_NM = 3440.065;
const rad = (d) => (d * Math.PI) / 180;
function distanceNm(lat1, lon1, lat2, lon2) {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.sqrt(h));
}

/** Circle (centre + radius) covering a bounding box, capped at the API maximum. */
export function circleFor(bbox) {
  const lat = (bbox.lamin + bbox.lamax) / 2;
  const lon = (bbox.lomin + bbox.lomax) / 2;
  const nm = Math.ceil(distanceNm(lat, lon, bbox.lamax, bbox.lomax)) + 5;
  return { lat: +lat.toFixed(4), lon: +lon.toFixed(4), nm: Math.min(MAX_RADIUS_NM, Math.max(5, nm)) };
}

function toState(a, nowSec) {
  if (a.lat == null || a.lon == null) return null;
  const ground = a.alt_baro === 'ground';
  const baro = typeof a.alt_baro === 'number' ? a.alt_baro * FT : null;
  const geom = typeof a.alt_geom === 'number' ? a.alt_geom * FT : null;
  const rate = a.baro_rate ?? a.geom_rate;
  const type = String(a.type || '');
  return [
    String(a.hex || '').replace(/^~/, '').toLowerCase(), // icao24 (~ = non-ICAO / TIS-B address)
    (a.flight || '').trim(),
    '', // origin country: not provided
    Math.round(nowSec - (a.seen_pos ?? a.seen ?? 0)),
    Math.round(nowSec - (a.seen ?? 0)),
    a.lon,
    a.lat,
    ground ? null : baro,
    ground,
    typeof a.gs === 'number' ? a.gs * KT : null,
    a.track ?? a.true_heading ?? null,
    typeof rate === 'number' ? rate * FPM : null,
    null,
    ground ? null : geom,
    a.squawk ?? null,
    Boolean(a.spi),
    type.startsWith('mlat') ? 2 : type.startsWith('adsb') || type.startsWith('adsr') ? 0 : 3,
    CATEGORY[a.category] ?? 0,
    (a.t || '').toUpperCase(),
    (a.r || '').toUpperCase(),
  ];
}

export class AdsbClient {
  constructor() {
    this.kind = 'adsb';
    this.authenticated = false;
    this.credits = { states: null, tracks: null, flights: null };
    this.provider = PROVIDERS[0].name;
  }

  async _query(build) {
    let lastErr;
    for (const p of PROVIDERS) {
      try {
        const res = await fetch(build(p), {
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: 'no-store',
        });
        if (!res.ok) throw Object.assign(new Error(`${p.name} ${res.status}`), { status: res.status });
        const j = await res.json();
        const nowSec = (j.now ?? Date.now()) / 1000;
        const list = j.ac ?? j.aircraft ?? [];
        this.provider = p.name;
        return { time: Math.floor(nowSec), states: list.map((a) => toState(a, nowSec)).filter(Boolean) };
      } catch (err) {
        lastErr = err; // try the next provider
      }
    }
    throw Object.assign(new Error(`ADS-B sources unavailable: ${lastErr?.message}`), { status: lastErr?.status ?? 0 });
  }

  /** bbox omitted: the API has no global query, so callers always pass a box. */
  getStates(bbox) {
    const c = circleFor(bbox ?? { lamin: -10, lamax: 10, lomin: -10, lomax: 10 });
    return this._query((p) => p.point(c.lat, c.lon, c.nm));
  }

  getStatesByIcao([hex]) {
    return this._query((p) => p.hex(hex));
  }

  /** No flight-history endpoint: trails come from positions the server has seen. */
  async getTrack() {
    return null;
  }
}
