/**
 * Community ADS-B aggregators (adsb.lol, adsb.fi) as a data source.
 *
 * Both are free, keyless and reachable from cloud hosts (unlike OpenSky). Their data is
 * openly licensed (ODbL) and must be attributed. They ask for a descriptive User-Agent and
 * modest request rates, so every provider gets its own queue with >= 1.1 s between requests.
 *
 * Live positions: each query is a circle of at most 250 NM and there is no global query.
 * Wide views are covered with a fixed world grid of cells (one circle each). Cells are
 * cached and shared by every viewport. Each call refreshes only the few oldest cells, so a
 * zoomed-out view fills in over a few polls instead of hammering the APIs.
 *
 * Flight history: adsb.lol publishes per-aircraft traces (~25 h, the same files its map
 * uses). The current leg is converted to OpenSky's track format.
 *
 * States are converted to OpenSky state vectors (same field order, metres, m/s), plus
 * [18] ICAO type code and [19] registration, which OpenSky doesn't send.
 */
const USER_AGENT = 'SkyRadar/0.3 (+https://github.com/vishalraghav0290/FlyingAero)';
const FT = 0.3048;
const KT = 0.514444;
const FPM = 0.00508;
const TIMEOUT_MS = 12_000;
const REQUEST_GAP_MS = 1100; // per provider

// World grid: 5.5° latitude bands; longitude width widened by 1/cos(lat) so every cell is
// roughly square on the ground and fits in one 250 NM circle.
const CELL_LAT = 5.5;
const MAX_CELLS = 48; // wider views cover the 48 busiest cells (all of India fits)
const CELL_STALE_MS = 8000; // cells older than this are refreshed in the background
const CELL_MAX_AGE_MS = 180_000; // older cell data is dropped (positions are estimated meanwhile)
const MAX_INFLIGHT_CELLS = 6; // background refreshes running at once (queued per provider)
// Views with more cells than this ask one provider per cell (alternating) instead of both,
// which leaves rate-limit room for the background warm-up.
const SPLIT_ABOVE_CELLS = 2;
const FIRST_WAIT_MS = 6000; // a brand-new view waits at most this long for its first cells
// Worldwide layer for zoomed-out views (adsb.lol /v2/type), most common types first
const WORLD_TYPES = ['B738', 'A320', 'A20N', 'A321', 'A21N', 'B38M', 'A319', 'B789', 'B77W', 'A359', 'B788', 'E190', 'A333', 'B739', 'E75L', 'AT76', 'CRJ9', 'B744', 'B763', 'A388'];
const TYPE_GAP_MS = 4000;
const TYPE_REFRESH_MS = 120_000;
const TYPE_MAX_AGE_MS = 300_000;

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
const TRACE_URL = (hex) => `https://globe.adsb.lol/data/traces/${hex.slice(-2)}/trace_full_${hex}.json`;

// ADS-B emitter category ("A3") -> OpenSky numeric category
const CATEGORY = { A1: 2, A2: 3, A3: 4, A4: 5, A5: 6, A6: 7, A7: 8, B1: 9, B2: 10, B3: 11, B4: 12, B6: 14, B7: 15, C1: 16, C2: 17, C3: 18 };

const R_NM = 3440.065;
const rad = (d) => (d * Math.PI) / 180;
function distanceNm(lat1, lon1, lat2, lon2) {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.sqrt(h));
}

function cellGeometry(row) {
  const lat0 = -90 + row * CELL_LAT;
  const cLat = Math.min(85, Math.max(-85, lat0 + CELL_LAT / 2));
  const cols = Math.max(1, Math.floor((360 * Math.cos(rad(Math.min(84, Math.abs(cLat))))) / CELL_LAT));
  return { lat0, cLat, cols, width: 360 / cols };
}

/** Grid cells (with their query circle) intersecting a bounding box. */
export function cellsFor(bbox) {
  const out = [];
  const r0 = Math.max(0, Math.floor((bbox.lamin + 90) / CELL_LAT));
  const r1 = Math.min(Math.floor(180 / CELL_LAT) - 1, Math.floor((bbox.lamax + 90) / CELL_LAT));
  for (let row = r0; row <= r1; row++) {
    const { lat0, cLat, cols, width } = cellGeometry(row);
    const c0 = Math.max(0, Math.floor((bbox.lomin + 180) / width));
    const c1 = Math.min(cols - 1, Math.floor((bbox.lomax + 180) / width));
    for (let col = c0; col <= c1; col++) {
      const cLon = -180 + col * width + width / 2;
      const nm = Math.min(250, Math.ceil(distanceNm(cLat, cLon, lat0 + CELL_LAT, cLon + width / 2)) + 10);
      out.push({ key: `${row}:${col}`, lat: +cLat.toFixed(3), lon: +cLon.toFixed(3), nm });
    }
  }
  const cLat = (bbox.lamin + bbox.lamax) / 2;
  const cLon = (bbox.lomin + bbox.lomax) / 2;
  const dist = (c) => distanceNm(cLat, cLon, c.lat, c.lon);
  out.sort((a, b) => dist(a) - dist(b));
  if (out.length <= MAX_CELLS) return { cells: out, clipped: false };
  // Too wide to refresh everything: follow the warm-up priority (India from Delhi
  // outwards, around India, Dubai, Europe, US), then the busiest remaining cells.
  // The order is kept: it's also the order cells get refreshed in.
  const rank = priorityRank();
  const prioritised = [...out].sort(
    (a, b) =>
      (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity) ||
      (density.get(b.key) ?? 0) - (density.get(a.key) ?? 0) ||
      dist(a) - dist(b),
  );
  return { cells: prioritised.slice(0, MAX_CELLS), clipped: true, ordered: true };
}

let rankCache = null;
/** cell key -> position in the warm-up order (built once airport density is known). */
function priorityRank() {
  if (rankCache && rankCache.size) return rankCache;
  rankCache = new Map();
  if (!density.size) return rankCache;
  warmPlan().flatMap((r) => r.cells).forEach((c, i) => rankCache.set(c.key, i));
  return rankCache;
}

/**
 * Regions kept warm in the background, so they show instantly when someone looks there.
 * The free APIs allow about one request per second each, so regions load one after
 * another: India from New Delhi outwards, then the area around India, Dubai, Europe, US.
 */
const DELHI = { lat: 28.56, lon: 77.1 };
const WARM_REGIONS = [
  // strict priority: a region only starts once everything before it is loaded
  { name: 'India', bbox: { lamin: 6, lamax: 36, lomin: 66, lomax: 98 }, from: DELHI, max: 48 },
  { name: 'Around India', bbox: { lamin: -5, lamax: 45, lomin: 45, lomax: 110 }, from: DELHI, max: 30 },
  { name: 'Dubai / Gulf', bbox: { lamin: 22, lamax: 29, lomin: 49, lomax: 59 }, from: { lat: 25.25, lon: 55.36 }, max: 6 },
  { name: 'Europe', bbox: { lamin: 36, lamax: 60, lomin: -10, lomax: 30 }, from: { lat: 50.03, lon: 8.57 }, max: 20 },
  { name: 'United States', bbox: { lamin: 25, lamax: 49, lomin: -125, lomax: -67 }, from: { lat: 39.5, lon: -95 }, max: 24 },
];
// Warm cells nobody is looking at refresh less often, so the queue reaches later regions.
// (Cells in someone's view refresh every CELL_STALE_MS regardless.)
const WARM_STALE_MS = 90_000;

function warmPlan() {
  const seen = new Set();
  return WARM_REGIONS.map((r) => {
    const all = [];
    const r0 = Math.max(0, Math.floor((r.bbox.lamin + 90) / CELL_LAT));
    const r1 = Math.floor((r.bbox.lamax + 90) / CELL_LAT);
    for (let row = r0; row <= r1; row++) {
      const { lat0, cLat, cols, width } = cellGeometry(row);
      const c0 = Math.max(0, Math.floor((r.bbox.lomin + 180) / width));
      const c1 = Math.min(cols - 1, Math.floor((r.bbox.lomax + 180) / width));
      for (let col = c0; col <= c1; col++) {
        const cLon = -180 + col * width + width / 2;
        const nm = Math.min(250, Math.ceil(distanceNm(cLat, cLon, lat0 + CELL_LAT, cLon + width / 2)) + 10);
        all.push({ key: `${row}:${col}`, lat: +cLat.toFixed(3), lon: +cLon.toFixed(3), nm });
      }
    }
    // nearest to the region's start point first (rings outward); big regions keep the busiest
    const d = (c) => distanceNm(r.from.lat, r.from.lon, c.lat, c.lon);
    let cells = all.sort((a, b) => d(a) - d(b));
    if (cells.length > r.max) {
      const keep = new Set([...cells].sort((a, b) => (density.get(b.key) ?? 0) - (density.get(a.key) ?? 0)).slice(0, r.max).map((c) => c.key));
      cells = cells.filter((c) => keep.has(c.key));
    }
    cells = cells.filter((c) => !seen.has(c.key) && seen.add(c.key));
    return { name: r.name, cells };
  });
}

/** Grid cell key containing a point. */
function cellKey(lat, lon) {
  const row = Math.min(Math.floor(180 / CELL_LAT) - 1, Math.max(0, Math.floor((lat + 90) / CELL_LAT)));
  const { cols, width } = cellGeometry(row);
  return `${row}:${Math.min(cols - 1, Math.max(0, Math.floor((lon + 180) / width)))}`;
}

// cell key -> estimated traffic weight (large airport 10, medium 2, small 1)
const density = new Map();
export function setAirportDensity(rows) {
  density.clear();
  for (const r of rows) {
    const k = cellKey(r[3], r[4]);
    density.set(k, (density.get(k) ?? 0) + ([10, 2, 1][r[6]] ?? 1));
  }
}

function toState(a, nowSec) {
  if (a.lat == null || a.lon == null) return null;
  const ground = a.alt_baro === 'ground';
  const baro = typeof a.alt_baro === 'number' ? a.alt_baro * FT : null;
  const geom = typeof a.alt_geom === 'number' ? a.alt_geom * FT : null;
  const rate = a.baro_rate ?? a.geom_rate;
  const type = String(a.type || '');
  return [
    String(a.hex || '').replace(/^~/, '').toLowerCase(), // ~ = non-ICAO / TIS-B address
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

/** Keeps the freshest state per aircraft, filling type / registration from the others. */
function mergeStates(lists) {
  const byHex = new Map();
  for (const list of lists) {
    for (const s of list) {
      const prev = byHex.get(s[0]);
      if (!prev) byHex.set(s[0], s);
      else if (s[3] > prev[3]) {
        const next = [...s];
        next[18] ||= prev[18];
        next[19] ||= prev[19];
        byHex.set(s[0], next);
      } else {
        prev[18] ||= s[18];
        prev[19] ||= s[19];
      }
    }
  }
  return [...byHex.values()];
}

export class AdsbClient {
  constructor() {
    this.kind = 'adsb';
    this.authenticated = false;
    this.credits = { states: null, tracks: null, flights: null };
    this.provider = PROVIDERS.map((p) => p.name).join(' + ');
    this.queues = new Map(); // provider / host -> promise chain
    this.cells = new Map(); // cell key -> { at, states, sources }
    this.cellInflight = new Map();
    this.types = new Map(); // type code -> { at, states }
    this.typeInflight = null;
    this.typeNextAt = 0;
    this.warm = null; // built lazily (needs airport density)
    this.warmTurn = 0;
    // long-running servers keep warming between requests; on serverless each request does it
    setInterval(() => this.warmTick(), 1500).unref?.();
  }

  /**
   * Fills spare request slots with warm-region cells in strict priority order: the first
   * stale cell of the first region that has one (India before anything else). Requests the
   * map is waiting for always go first: this only uses the slots they leave free.
   */
  warmTick() {
    const now = Date.now();
    if (now - (this.lastActivityAt ?? 0) > 5 * 60_000) return; // nobody on the site
    this.warm ??= warmPlan();
    const queue = this.warm.flatMap((r) => r.cells).filter(
      (c) => !this.cellInflight.has(c.key) && now - (this.cells.get(c.key)?.at ?? 0) > WARM_STALE_MS,
    );
    for (const cell of queue) {
      if (this.cellInflight.size >= MAX_INFLIGHT_CELLS - 2) break;
      this._refreshCell(cell, true, this.warmTurn++).catch(() => {});
    }
  }

  /** Which warm regions are loaded (for /api/health). */
  warmStatus() {
    this.warm ??= warmPlan();
    const now = Date.now();
    return this.warm.map((r) => ({
      region: r.name,
      cells: r.cells.length,
      fresh: r.cells.filter((c) => now - (this.cells.get(c.key)?.at ?? 0) < CELL_MAX_AGE_MS).length,
    }));
  }

  /** Runs requests to one host one at a time, REQUEST_GAP_MS apart. */
  _queued(name, fn) {
    const prev = this.queues.get(name) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.queues.set(name, run.then(() => new Promise((r) => setTimeout(r, REQUEST_GAP_MS)), () => new Promise((r) => setTimeout(r, REQUEST_GAP_MS))));
    return run;
  }

  async _get(name, url) {
    return this._queued(name, async () => {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
      if (!res.ok) throw Object.assign(new Error(`${name} ${res.status}`), { status: res.status });
      return res.json();
    });
  }

  /** One query (circle or hex) against both providers, merged. Fails only if both fail. */
  async _both(build) {
    const results = await Promise.allSettled(
      PROVIDERS.map(async (p) => {
        const j = await this._get(p.name, build(p));
        const nowSec = (j.now ?? Date.now()) / 1000;
        return { name: p.name, nowSec, states: (j.ac ?? j.aircraft ?? []).map((a) => toState(a, nowSec)).filter(Boolean) };
      }),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (!ok.length) {
      const err = results.find((r) => r.status === 'rejected')?.reason;
      throw Object.assign(new Error(`ADS-B sources unavailable: ${err?.message}`), { status: err?.status ?? 0 });
    }
    return { time: Math.floor(Math.max(...ok.map((r) => r.nowSec))), sources: ok.map((r) => r.name), states: mergeStates(ok.map((r) => r.states)) };
  }

  /** One query against a single provider, falling back to the other if it fails. */
  async _single(index, build) {
    const order = [PROVIDERS[index % PROVIDERS.length], PROVIDERS[(index + 1) % PROVIDERS.length]];
    let lastErr;
    for (const p of order) {
      try {
        const j = await this._get(p.name, build(p));
        const nowSec = (j.now ?? Date.now()) / 1000;
        return { time: Math.floor(nowSec), sources: [p.name], states: (j.ac ?? j.aircraft ?? []).map((a) => toState(a, nowSec)).filter(Boolean) };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  /**
   * Small views ask both providers per cell (their coverage differs by region). Wide views
   * split cells between providers instead, which fills the view twice as fast.
   */
  _refreshCell(cell, split = false, index = 0) {
    if (this.cellInflight.has(cell.key)) return this.cellInflight.get(cell.key);
    const build = (pr) => pr.point(cell.lat, cell.lon, cell.nm);
    const p = (split ? this._single(index, build) : this._both(build))
      .then((r) => {
        this.cells.set(cell.key, { at: Date.now(), states: r.states, sources: r.sources, lat: cell.lat, lon: cell.lon });
        if (this.cells.size > 400) this.cells.delete(this.cells.keys().next().value);
        return r;
      })
      .finally(() => this.cellInflight.delete(cell.key));
    this.cellInflight.set(cell.key, p);
    return p;
  }

  /** Background work still running (route handlers keep the function alive for it). */
  pending() {
    return Promise.allSettled([...this.cellInflight.values(), this.typeInflight].filter(Boolean));
  }

  /**
   * Worldwide layer for very zoomed-out views: adsb.lol's /v2/type/{type} returns every
   * aircraft of one type. It's heavily rate-limited, so one type is refreshed at a time,
   * with long pauses (and a minute's back-off after a 429).
   */
  _typeLayer(bbox) {
    const now = Date.now();
    if (!this.typeInflight && now >= this.typeNextAt) {
      const due = WORLD_TYPES.map((t) => [t, this.types.get(t)?.at ?? 0]).sort((a, b) => a[1] - b[1])[0];
      if (now - due[1] > TYPE_REFRESH_MS) {
        this.typeInflight = this._get('adsb.lol', `https://api.adsb.lol/v2/type/${due[0]}`)
          .then((j) => {
            const nowSec = (j.now ?? Date.now()) / 1000;
            this.types.set(due[0], { at: Date.now(), states: (j.ac ?? []).map((a) => toState(a, nowSec)).filter(Boolean) });
            this.typeNextAt = Date.now() + TYPE_GAP_MS;
          })
          .catch((err) => {
            // the type endpoint is rate-limited hard: back off for 5 min after a 429
            this.typeNextAt = Date.now() + (err.status === 429 ? 300_000 : TYPE_GAP_MS);
          })
          .finally(() => (this.typeInflight = null));
      }
    }
    const inBox = (s) => s[6] >= bbox.lamin && s[6] <= bbox.lamax && s[5] >= bbox.lomin && s[5] <= bbox.lomax;
    return [...this.types.values()]
      .filter((e) => Date.now() - e.at < TYPE_MAX_AGE_MS)
      .map((e) => e.states.filter(inBox));
  }

  /**
   * States in a bounding box, answered straight from the cell cache so the map never loses
   * aircraft while a view fills in. Missing / stale cells (centre first) are refreshed in
   * the background. Only a view with nothing cached waits briefly for its first cells.
   */
  async getStates(bbox) {
    const box = bbox ?? { lamin: -60, lamax: 75, lomin: -180, lomax: 180 };
    const { cells, clipped } = cellsFor(box);
    const now = Date.now();
    const age = (c) => now - (this.cells.get(c.key)?.at ?? 0);
    // missing cells first (they're already sorted centre-out), then the oldest
    // missing cells first, then the oldest; wide views keep their priority order (India first)
    const stale = cells
      .filter((c) => age(c) > CELL_STALE_MS)
      .sort((a, b) => (this.cells.has(a.key) - this.cells.has(b.key)) || (this.cells.has(a.key) ? age(b) - age(a) : 0));
    const split = cells.length > SPLIT_ABOVE_CELLS;
    let n = 0;
    for (const c of stale) {
      if (this.cellInflight.size >= MAX_INFLIGHT_CELLS) break;
      if (!this.cellInflight.has(c.key)) this._refreshCell(c, split, n++).catch(() => {});
    }
    this.lastActivityAt = Date.now();
    this.warmTick(); // spare slots go to the warm regions
    if (!cells.some((c) => this.cells.has(c.key))) {
      const first = cells.slice(0, 4).map((c) => this.cellInflight.get(c.key)).filter(Boolean);
      const results = await Promise.race([
        Promise.allSettled(first),
        new Promise((r) => setTimeout(() => r(null), FIRST_WAIT_MS)),
      ]);
      if (results && results.length && results.every((r) => r.status === 'rejected')) throw results[0].reason;
    }
    const live = (e) => e && Date.now() - e.at < CELL_MAX_AGE_MS;
    const fresh = cells.map((c) => this.cells.get(c.key)).filter(live);
    // Show every cached cell inside the view, including ones loaded by the warm-up or by
    // other visitors, not just the cells this view refreshes.
    const pad = 4; // cell centre may sit just outside the box while its aircraft are inside
    const shown = [...this.cells.values()].filter(
      (e) => live(e) && e.lat >= box.lamin - pad && e.lat <= box.lamax + pad && e.lon >= box.lomin - pad * 1.5 && e.lon <= box.lomax + pad * 1.5,
    );
    const lists = shown.map((e) => e.states);
    if (clipped) lists.unshift(...this._typeLayer(box)); // cell data (fresher) wins on merge
    const sources = new Set(fresh.flatMap((e) => e.sources));
    this.provider = [...sources].join(' + ') || this.provider;
    return {
      time: Math.floor(Date.now() / 1000),
      states: mergeStates(lists),
      coverage: { cells: cells.length, loaded: fresh.length, clipped, worldTypes: clipped ? this.types.size : 0 },
    };
  }

  async getStatesByIcao([hex]) {
    return this._both((p) => p.hex(hex));
  }

  /**
   * Flight history from adsb.lol's trace file, current leg only, in OpenSky track format:
   * { icao24, startTime, endTime, path: [[t, lat, lon, baroAltM, track, onGround], ...] }
   * Trace points: [secondsAfterTimestamp, lat, lon, alt ft | "ground", gs, track, flags, ...]
   * flags & 2 marks the start of a new leg.
   */
  async getTrack(icao24) {
    const hex = String(icao24).toLowerCase();
    let j;
    try {
      j = await this._get('globe.adsb.lol', TRACE_URL(hex));
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
    const pts = Array.isArray(j?.trace) ? j.trace : [];
    if (!pts.length) return null;
    // current leg: back from the end until a leg start or a 20 min gap
    let start = pts.length - 1;
    while (start > 0) {
      if (pts[start][6] & 2) break;
      if (pts[start][0] - pts[start - 1][0] > 1200) break;
      start--;
    }
    // drop a long parked stretch before departure (keep the last 10 min of ground time)
    const firstAir = pts.findIndex((p, i) => i >= start && p[3] !== 'ground');
    if (firstAir > start) {
      const keepFrom = pts[firstAir][0] - 600;
      while (start < firstAir && pts[start][0] < keepFrom) start++;
    }
    const base = j.timestamp;
    const leg = pts.slice(start);
    const step = Math.ceil(leg.length / 1500); // keep at most ~1500 points
    const path = leg
      .filter((_, i) => i % step === 0 || i === leg.length - 1)
      .map((p) => {
        const ground = p[3] === 'ground';
        return [Math.round(base + p[0]), p[1], p[2], ground ? 0 : typeof p[3] === 'number' ? Math.round(p[3] * FT) : null, p[5] ?? null, ground];
      });
    return { icao24: hex, startTime: path[0][0], endTime: path.at(-1)[0], path };
  }
}
