/**
 * Shared live feed.
 *
 * FR24 polls every 6 s per browser. OpenSky's free tier (4,000 /states credits per day,
 * 1-4 credits per call depending on area) can't afford that, so the server:
 *  - expands each viewport to the largest area that costs the same credits
 *    (<= 25 sq° = 1, <= 100 = 2, <= 400 = 3, larger/global = 4),
 *  - caches those areas and answers any viewport inside a fresh one without calling OpenSky,
 *  - coalesces concurrent requests, and
 *  - polls slower for bigger areas and when the daily balance gets low.
 */
import { OpenSkyError } from './opensky.js';
import { destination } from './geo.js';

const TIERS = [
  { maxArea: 25, cost: 1, factor: 1 },
  { maxArea: 100, cost: 2, factor: 1.5 },
  { maxArea: 400, cost: 3, factor: 2 },
];
const GLOBAL = { maxArea: Infinity, cost: 4, factor: 3 };
const MAX_CACHE_ENTRIES = 8;
const MIN_UPSTREAM_GAP_MS = 3000; // never hit OpenSky more often than this
// Estimated positions (FR24 "estimated" visibility): an airborne aircraft whose position
// hasn't been updated is moved along its last track and speed, up to MAX_ESTIMATE_S.
// The browser decides how much of that window to show (its estimation setting).
const ESTIMATE_AFTER_S = 20;
export const MAX_ESTIMATE_S = 300;
const MAX_GROUND_AGE_S = 60; // ground traffic is never estimated
// Below this an aircraft that goes silent is almost always on approach / landing (receivers
// lose low traffic first). Projecting it forward would fly it past the runway, so it's
// held at its last real position instead and removed after MAX_LOW_AGE_S.
const MIN_ESTIMATE_ALT_M = 915; // ~3,000 ft
const MAX_LOW_AGE_S = 90;
// Position history kept per aircraft, used for trails.
const HISTORY_MAX_POINTS = 1500;
const HISTORY_TTL_MS = 30 * 60_000;

// OpenSky state vector indices
const S = {
  icao24: 0, callsign: 1, country: 2, timePosition: 3, lastContact: 4, lon: 5, lat: 6,
  baroAlt: 7, onGround: 8, velocity: 9, track: 10, vrate: 11, sensors: 12, geoAlt: 13,
  squawk: 14, spi: 15, posSource: 16, category: 17,
};

/** Fields sent to the browser, in this order. */
export const CLIENT_FIELDS = [
  'icao24', 'callsign', 'country', 'timePosition', 'lastContact', 'lon', 'lat', 'baroAlt',
  'onGround', 'velocity', 'track', 'vrate', 'geoAlt', 'squawk', 'spi', 'posSource', 'category',
  'typecode', 'reg', 'operatorIcao', 'shape', 'estimatedAge',
];
const F = Object.fromEntries(CLIENT_FIELDS.map((f, i) => [f, i]));

const contains = (outer, inner) =>
  outer == null || // global
  (inner &&
    inner.lamin >= outer.lamin &&
    inner.lamax <= outer.lamax &&
    inner.lomin >= outer.lomin &&
    inner.lomax <= outer.lomax);

/** Expand a viewport to the largest box with the same credit cost. */
export function planArea(vp) {
  if (!vp) return { bbox: null, ...GLOBAL };
  const latSpan = vp.lamax - vp.lamin;
  const lonSpan = vp.lomax - vp.lomin;
  const area = latSpan * lonSpan;
  if (lonSpan >= 359 || latSpan >= 170) return { bbox: null, ...GLOBAL };

  for (const tier of TIERS) {
    if (area > tier.maxArea) continue;
    const scale = Math.sqrt((tier.maxArea * 0.97) / Math.max(area, 1e-6));
    const cLat = (vp.lamin + vp.lamax) / 2;
    const cLon = (vp.lomin + vp.lomax) / 2;
    const hLat = Math.min((latSpan * scale) / 2, 85);
    const hLon = Math.min((lonSpan * scale) / 2, 180);
    const r = (v) => Math.round(v * 100) / 100;
    const bbox = {
      lamin: r(Math.max(-90, cLat - hLat)),
      lamax: r(Math.min(90, cLat + hLat)),
      lomin: r(Math.max(-180, cLon - hLon)),
      lomax: r(Math.min(180, cLon + hLon)),
    };
    return { bbox, ...tier };
  }
  return { bbox: null, ...GLOBAL };
}

/**
 * ADS-B aggregators take a circle of at most 250 NM (no credits, no global query), so the
 * viewport is padded a little and clipped to the box around that circle. When zoomed out
 * further than that, the centre of the view is shown.
 */
const ADSB_MAX_HALF_LAT = 4.1; // ~250 NM
export function planAdsb(vp) {
  const box = vp ?? { lamin: -10, lamax: 10, lomin: -10, lomax: 10 };
  const cLat = (box.lamin + box.lamax) / 2;
  const cLon = (box.lomin + box.lomax) / 2;
  const hLat = Math.min(((box.lamax - box.lamin) / 2) * 1.15, ADSB_MAX_HALF_LAT);
  const maxHLon = Math.min(ADSB_MAX_HALF_LAT / Math.max(0.2, Math.cos((cLat * Math.PI) / 180)), 180);
  const hLon = Math.min(((box.lomax - box.lomin) / 2) * 1.15, maxHLon);
  const r = (v) => Math.round(v * 100) / 100;
  const bbox = {
    lamin: r(Math.max(-90, cLat - hLat)),
    lamax: r(Math.min(90, cLat + hLat)),
    lomin: r(Math.max(-180, cLon - hLon)),
    lomax: r(Math.min(180, cLon + hLon)),
  };
  const clipped = !vp || vp.lamin < bbox.lamin || vp.lamax > bbox.lamax || vp.lomin < bbox.lomin || vp.lomax > bbox.lomax;
  return { bbox, cost: 0, factor: 1, clipped };
}

export class FeedService {
  constructor({ client, db, config }) {
    this.client = client;
    this.db = db;
    this.cfg = config.feed;
    this.cache = []; // { bbox, cost, fetchedAt, time, states }
    this.inflight = new Map(); // key -> Promise
    this.lastUpstreamAt = 0;
    this.blockedUntil = 0;
    this.lastError = null;
    this.history = new Map(); // icao24 -> { points, seenAt }
    this.selectedCache = new Map(); // icao24 -> { at, row }
    setInterval(() => this._sweepHistory(), 5 * 60_000).unref();
  }

  /** Poll interval for an area of the given cost, slowed down when credits run low. */
  intervalFor(plan) {
    if (this.client.kind === 'adsb') return this.cfg.adsbIntervalMs;
    let ms = this.cfg.baseIntervalMs * plan.factor;
    const remaining = this.client.credits.states;
    if (remaining != null) {
      const share = remaining / this.cfg.dailyCredits;
      if (share < 0.1) ms *= 4;
      else if (share < 0.25) ms *= 2;
    }
    return Math.max(this.cfg.minIntervalMs, Math.round(ms));
  }

  _findCached(vp, maxAgeMs) {
    const now = Date.now();
    return this.cache
      .filter((e) => now - e.fetchedAt <= maxAgeMs && contains(e.bbox, vp))
      .sort((a, b) => b.fetchedAt - a.fetchedAt)[0];
  }

  async _fetch(plan) {
    const key = plan.bbox ? Object.values(plan.bbox).join(',') : 'global';
    if (this.inflight.has(key)) return this.inflight.get(key);

    const p = (async () => {
      this.lastUpstreamAt = Date.now();
      try {
        const data = await this.client.getStates(plan.bbox ?? undefined);
        const entry = {
          bbox: plan.bbox,
          cost: plan.cost,
          fetchedAt: Date.now(),
          time: data?.time ?? Math.floor(Date.now() / 1000),
          states: this._prepare(data?.states ?? [], data?.time),
          source: this.client.sourceName ?? 'OpenSky',
        };
        // A global snapshot supersedes every regional one.
        // OpenSky failed over to ADS-B mid-request: the data only covers the ADS-B circle
        if (this.client.lastSource === 'adsb' && plan.cost !== 0) entry.bbox = planAdsb(plan.bbox).bbox;
        this.cache = [entry, ...this.cache.filter((e) => e.bbox && !contains(entry.bbox, e.bbox))]
          .slice(0, MAX_CACHE_ENTRIES);
        this.lastError = null;
        return entry;
      } catch (err) {
        this.lastError = { message: err.message, at: Date.now(), status: err.status ?? 0 };
        if (err instanceof OpenSkyError && err.status === 429) {
          this.blockedUntil = Date.now() + err.retryAfterSec * 1000;
        }
        throw err;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  /** Remember every real position we receive (trail source). */
  _record(s) {
    const id = s[S.icao24];
    let h = this.history.get(id);
    if (!h) this.history.set(id, (h = { points: [], seenAt: 0 }));
    h.seenAt = Date.now();
    const t = s[S.timePosition];
    if (h.points.length && h.points.at(-1)[0] >= t) return;
    const alt = s[S.onGround] ? 0 : (s[S.baroAlt] ?? s[S.geoAlt]);
    h.points.push([t, s[S.lat], s[S.lon], alt == null ? null : Math.round(alt), s[S.track], Boolean(s[S.onGround]), s[S.velocity]]);
    if (h.points.length > HISTORY_MAX_POINTS) h.points.splice(0, h.points.length - HISTORY_MAX_POINTS);
  }

  _sweepHistory() {
    const cutoff = Date.now() - HISTORY_TTL_MS;
    for (const [id, h] of this.history) if (h.seenAt < cutoff) this.history.delete(id);
  }

  /**
   * Drop unusable states, estimate stale airborne positions, attach aircraft metadata and
   * the silhouette. Returns rows in CLIENT_FIELDS order.
   */
  _prepare(states, snapshotTime) {
    const out = [];
    const now = snapshotTime || Math.floor(Date.now() / 1000);
    for (const s of states) {
      if (s[S.lat] == null || s[S.lon] == null || s[S.timePosition] == null) continue;
      if (Math.abs(s[S.lat]) > 90 || Math.abs(s[S.lon]) > 180) continue;
      this._record(s);

      const age = now - s[S.timePosition];
      let lat = s[S.lat];
      let lon = s[S.lon];
      let timePosition = s[S.timePosition];
      let estimatedAge = 0;
      if (age > ESTIMATE_AFTER_S) {
        const altM = s[S.baroAlt] ?? s[S.geoAlt] ?? 0;
        const low = altM < MIN_ESTIMATE_ALT_M;
        const canEstimate = !s[S.onGround] && !low && s[S.velocity] > 0 && s[S.track] != null;
        const maxAge = s[S.onGround] ? MAX_GROUND_AGE_S : low ? MAX_LOW_AGE_S : canEstimate ? MAX_ESTIMATE_S : ESTIMATE_AFTER_S;
        if (age > maxAge) continue;
        if (canEstimate) {
          [lat, lon] = destination(lat, lon, s[S.track], s[S.velocity] * age);
          timePosition = now;
          estimatedAge = age;
        }
      }

      const meta = this.db.basic(s[S.icao24]);
      // ADS-B aggregators send type and registration themselves (columns 18 / 19)
      const typecode = meta?.typecode || s[18] || '';
      const reg = meta?.reg || s[19] || '';
      out.push([
        s[S.icao24],
        (s[S.callsign] || '').trim(),
        s[S.country],
        timePosition,
        s[S.lastContact],
        Math.round(lon * 1e5) / 1e5,
        Math.round(lat * 1e5) / 1e5,
        s[S.baroAlt],
        s[S.onGround],
        s[S.velocity],
        s[S.track],
        s[S.vrate],
        s[S.geoAlt],
        s[S.squawk],
        s[S.spi],
        s[S.posSource],
        s[S.category] ?? 0,
        typecode,
        reg,
        meta?.operatorIcao || '',
        this.db.shapeFor(typecode, s[S.category]),
        estimatedAge,
      ]);
    }
    return out;
  }

  /**
   * The selected aircraft, even when it's outside the viewport (FR24 always requests it).
   * Looks in every cached snapshot first; otherwise asks OpenSky for that one aircraft
   * (1 credit), at most once per poll interval.
   */
  async _selected(icao24, intervalMs) {
    const now = Date.now();
    for (const e of this.cache) {
      if (now - e.fetchedAt > intervalMs) continue;
      const row = e.states.find((s) => s[F.icao24] === icao24);
      if (row) return row;
    }
    const last = this.selectedCache.get(icao24);
    // 1 credit per lookup: refresh an off-screen selection at most every 30 s (the browser
    // keeps animating it in between).
    if (last && now - last.at < Math.max(intervalMs, 30_000)) return last.row;
    if (now < this.blockedUntil) return last?.row ?? null;
    try {
      const data = await this.client.getStatesByIcao([icao24]);
      const row = this._prepare(data?.states ?? [], data?.time)[0] ?? null;
      this.selectedCache.set(icao24, { at: now, row });
      if (this.selectedCache.size > 20) this.selectedCache.delete(this.selectedCache.keys().next().value);
      return row;
    } catch {
      return last?.row ?? null;
    }
  }

  /** Recorded positions for one aircraft: [[t, lat, lon, altM, track, onGround, velocity]] */
  getHistory(icao24) {
    return this.history.get(icao24)?.points ?? [];
  }

  /**
   * States inside `vp` ({lamin, lomin, lamax, lomax}) or the whole world when vp is null.
   * Returns the response body for /api/states.
   */
  async getStates(viewport, selectedIcao = null) {
    const adsb = this.client.kind === 'adsb';
    const plan = adsb ? planAdsb(viewport) : planArea(viewport);
    // ADS-B can't cover very large views: work with the part it can cover
    const vp = adsb && plan.clipped ? plan.bbox : viewport;
    const intervalMs = this.intervalFor(plan);
    const now = Date.now();

    let entry = this._findCached(vp, intervalMs - 250);
    let stale = false;
    let error = null;

    if (!entry) {
      const blocked = now < this.blockedUntil;
      const tooSoon = now - this.lastUpstreamAt < MIN_UPSTREAM_GAP_MS;
      const fallback = this._findCached(vp, 120_000);
      if (blocked || (tooSoon && fallback)) {
        entry = fallback;
        stale = true;
        if (blocked) error = 'Data source rate limit reached; showing cached data';
      } else {
        try {
          entry = await this._fetch(plan);
        } catch (err) {
          entry = fallback;
          stale = true;
          error = err.message;
          if (!entry) {
            const e = new Error(err.message);
            e.status = err.status === 429 ? 503 : 502;
            e.retryAfterSec = err.retryAfterSec ?? null;
            throw e;
          }
        }
      }
    }

    let states = vp
      ? entry.states.filter(
          (s) => s[F.lat] >= vp.lamin && s[F.lat] <= vp.lamax && s[F.lon] >= vp.lomin && s[F.lon] <= vp.lomax,
        )
      : entry.states;
    if (selectedIcao && !states.some((s) => s[F.icao24] === selectedIcao)) {
      const row = await this._selected(selectedIcao, intervalMs);
      if (row) states = [...states, row]; // copy: never mutate a cached snapshot
    }

    const expiresIn = entry.fetchedAt + intervalMs - Date.now();
    const blockedFor = this.blockedUntil - Date.now();
    let nextPollMs = Math.max(1000, Math.min(intervalMs, expiresIn + 300));
    if (blockedFor > 0) nextPollMs = Math.min(60_000, Math.max(nextPollMs, blockedFor));
    return {
      now: Date.now(),
      snapshotTime: entry.time,
      intervalMs,
      // Ask the browser to come back right after this snapshot expires.
      nextPollMs,
      stale,
      error,
      area: { bbox: entry.bbox, cost: entry.cost, clipped: Boolean(adsb && plan.clipped && viewport) },
      source: entry.source,
      credits: entry.source === 'OpenSky' ? { states: this.client.credits.states, daily: this.cfg.dailyCredits } : {},
      fields: CLIENT_FIELDS,
      count: states.length,
      states,
    };
  }
}
