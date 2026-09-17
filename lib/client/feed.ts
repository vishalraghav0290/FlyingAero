/**
 * Live feed polling, following FR24's Feed component:
 *  - viewport bounds rounded to 0.01° and padded by 0.01°
 *  - 200 ms debounce after the map moves, then fetch immediately and restart the timer
 *  - 250 ms throttle, any in-flight request is cancelled
 *  - up to 3 consecutive errors retry every 4 s; after that the feed is marked as failing
 * Differences: the poll interval comes from the server (it depends on OpenSky credits),
 * and polling pauses while the tab is hidden so credits aren't spent on nobody.
 */
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Bbox, FeedStatus, StatesResponse } from './types.ts';

const DEBOUNCE_MS = 200;
const THROTTLE_MS = 250;
const RETRY_MS = 4000;
const MAX_RETRIES = 3;
const PAD = 0.01;

type Timer = ReturnType<typeof setTimeout>;

/** Error thrown for a non-OK /api/states response. */
type FeedError = Error & { retryAfterMs?: number };

export interface FeedOptions {
  /** New snapshot; `bbox` is the requested area (null = whole world). */
  onData: (body: StatesResponse, bbox: Bbox | null) => void;
  onStatus: (status: FeedStatus) => void;
  /** Aircraft the server should include even when it's off-screen. */
  getSelected?: () => string | null;
  /** While true, map moves don't trigger a refresh. */
  isFollowing?: () => boolean;
}

export function viewportBbox(map: MapLibreMap): Bbox | null {
  const b = map.getBounds();
  let west = b.getWest();
  let east = b.getEast();
  if (east - west >= 360) return null; // whole world visible
  if (west < -180 || east > 180) {
    // crosses the antimeridian: request the full longitude band
    west = -180;
    east = 180;
  }
  const floor = (v: number) => Math.floor(v * 100) / 100 - PAD;
  const ceil = (v: number) => Math.ceil(v * 100) / 100 + PAD;
  const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
  return {
    lamin: clamp(floor(b.getSouth()), 90),
    lamax: clamp(ceil(b.getNorth()), 90),
    lomin: clamp(floor(west), 180),
    lomax: clamp(ceil(east), 180),
  };
}

export class Feed {
  map: MapLibreMap;
  onData: FeedOptions['onData'];
  onStatus: FeedOptions['onStatus'];
  getSelected: () => string | null;
  isFollowing: () => boolean;
  /** Consecutive failed polls. */
  errors: number;
  timer: Timer | null;
  debounceTimer: Timer | null;
  controller: AbortController | null;
  /** Local ms when the last request started. */
  lastFetchAt: number;
  throttleTimer: Timer | null;

  constructor(map: MapLibreMap, { onData, onStatus, getSelected = () => null, isFollowing = () => false }: FeedOptions) {
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

  start(): void {
    this.map.on('move', () => {
      // FR24 ignores bounds changes while following a flight; the poll timer keeps running.
      if (this.isFollowing()) return;
      clearTimeout(this.debounceTimer ?? undefined);
      this.debounceTimer = setTimeout(() => this.refresh(), DEBOUNCE_MS);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._stop();
      else this.refresh();
    });
    this.refresh();
  }

  _stop(): void {
    clearTimeout(this.timer ?? undefined);
    clearTimeout(this.throttleTimer ?? undefined);
    this.controller?.abort();
  }

  /** Fetch now (throttled) and restart the poll timer. */
  refresh(): void {
    if (document.hidden) return;
    clearTimeout(this.timer ?? undefined);
    clearTimeout(this.throttleTimer ?? undefined);
    const wait = Math.max(0, this.lastFetchAt + THROTTLE_MS - Date.now());
    this.throttleTimer = setTimeout(() => this._fetch(), wait);
  }

  _schedule(ms: number): void {
    clearTimeout(this.timer ?? undefined);
    if (!document.hidden) this.timer = setTimeout(() => this._fetch(), ms);
  }

  async _fetch(): Promise<void> {
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
      // a successful response is a StatesResponse; errors carry { error } (or no JSON at all)
      const body: StatesResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err: FeedError = new Error(body.error || `HTTP ${res.status}`);
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
        tookMs: Date.now() - this.lastFetchAt,
        loading: body.area?.loading ?? null,
      });
      this._schedule(body.nextPollMs ?? body.intervalMs ?? 10_000);
    } catch (caught) {
      // fetch rejects with DOMException / TypeError; non-OK responses throw a FeedError
      const err = caught as FeedError;
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
