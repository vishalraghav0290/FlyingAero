/**
 * Live feed polling, following FR24's Feed component:
 *  - viewport bounds rounded to 0.01° and padded by 0.01°
 *  - 200 ms debounce after the map moves, then fetch immediately and restart the timer
 *  - 250 ms throttle, any in-flight request is cancelled
 *  - up to 3 consecutive errors retry every 4 s; after that the feed is marked as failing
 * Differences: the poll interval comes from the server (it depends on OpenSky credits),
 * and polling pauses while the tab is hidden so credits aren't spent on nobody.
 */
const DEBOUNCE_MS = 200;
const THROTTLE_MS = 250;
const RETRY_MS = 4000;
const MAX_RETRIES = 3;
const PAD = 0.01;

export function viewportBbox(map) {
  const b = map.getBounds();
  let west = b.getWest();
  let east = b.getEast();
  if (east - west >= 360) return null; // whole world visible
  if (west < -180 || east > 180) {
    // crosses the antimeridian: request the full longitude band
    west = -180;
    east = 180;
  }
  const floor = (v) => Math.floor(v * 100) / 100 - PAD;
  const ceil = (v) => Math.ceil(v * 100) / 100 + PAD;
  const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));
  return {
    lamin: clamp(floor(b.getSouth()), 90),
    lamax: clamp(ceil(b.getNorth()), 90),
    lomin: clamp(floor(west), 180),
    lomax: clamp(ceil(east), 180),
  };
}

export class Feed {
  constructor(map, { onData, onStatus, getSelected = () => null, isFollowing = () => false }) {
    this.map = map;
    this.onData = onData;
    this.onStatus = onStatus;
    this.getSelected = getSelected;
    this.isFollowing = isFollowing;
    this.errors = 0;
    this.timer = null;
    this.debounceTimer = null;
    this.controller = null;
    this.lastFetchAt = 0;
    this.throttleTimer = null;
  }

  start() {
    this.map.on('move', () => {
      // FR24 ignores bounds changes while following a flight; the poll timer keeps running.
      if (this.isFollowing()) return;
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.refresh(), DEBOUNCE_MS);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._stop();
      else this.refresh();
    });
    this.refresh();
  }

  _stop() {
    clearTimeout(this.timer);
    clearTimeout(this.throttleTimer);
    this.controller?.abort();
  }

  /** Fetch now (throttled) and restart the poll timer. */
  refresh() {
    if (document.hidden) return;
    clearTimeout(this.timer);
    clearTimeout(this.throttleTimer);
    const wait = Math.max(0, this.lastFetchAt + THROTTLE_MS - Date.now());
    this.throttleTimer = setTimeout(() => this._fetch(), wait);
  }

  _schedule(ms) {
    clearTimeout(this.timer);
    if (!document.hidden) this.timer = setTimeout(() => this._fetch(), ms);
  }

  async _fetch() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.lastFetchAt = Date.now();

    const bbox = viewportBbox(this.map);
    const params = new URLSearchParams(bbox ? Object.entries(bbox).map(([k, v]) => [k, v.toFixed(2)]) : []);
    const selected = this.getSelected();
    if (selected) params.set('sel', selected);
    try {
      const qs = params.toString();
      const res = await fetch(`/api/states${qs ? `?${qs}` : ''}`, { signal: controller.signal });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(body.error || `HTTP ${res.status}`);
        err.retryAfterMs = Number(res.headers.get('Retry-After')) * 1000 || 0;
        throw err;
      }
      this.errors = 0;
      this.onData(body, bbox);
      this.onStatus({
        ok: true,
        stale: body.stale,
        message: body.area?.loading
          ? `loading area ${body.area.loading.loaded}/${body.area.loading.cells}`
          : body.area?.clipped
            ? 'zoom in to see all aircraft'
            : body.error,
        credits: body.credits,
        intervalMs: body.intervalMs,
        source: body.source,
      });
      this._schedule(body.nextPollMs ?? body.intervalMs ?? 10_000);
    } catch (err) {
      if (err.name === 'AbortError') return;
      this.errors += 1;
      const failing = this.errors >= MAX_RETRIES;
      this.onStatus({ ok: false, failing, message: err.message });
      this._schedule(Math.max(RETRY_MS, err.retryAfterMs || 0) * (failing ? 2 : 1));
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }
}
