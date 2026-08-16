/**
 * Aircraft movement engine, modelled on FR24's animation engine (`TDe` in their bundle).
 *
 * Planes are drawn slightly in the past ("playout delay") and glide between real reported
 * positions along great circles. When a new poll arrives, the animation does not snap:
 * data time continues from where the plane is currently drawn and catches up over one
 * refresh interval at 0.4x-1.8x speed. Past the newest point it dead-reckons for at most
 * 3 s, then freezes.
 *
 * Adaptations for OpenSky (polls every 10-30 s instead of FR24's dense position buffer):
 *  - First sighting is seeded with a point back-projected along the reported track, so a
 *    new aircraft moves immediately instead of sitting still for one poll.
 *  - Heading is blended between the reported tracks of the two surrounding points, so
 *    turns rotate smoothly instead of stepping once per poll.
 *  - Position jumps that no aircraft could fly are held back until confirmed by a second
 *    consistent report (GPS jamming, bad MLAT fixes).
 *  - Ground snapping only below 40 kt, so landing and take-off rolls stay smooth.
 *  - Max delay scales with the poll interval.
 */
import { bearing, destination, distance, interpolate, lerpAngle, KT_TO_MS } from './geo.js';

const MAX_POSITIONS = 20;
const PLAYOUT_DELAY_MS = 750;
const MAX_EXTRAPOLATION_MS = 3000;
const GROUND_SNAP_MAX_KT = 40;

export const RenderType = {
  NO_POSITIONS: 0,
  TOO_EARLY: 1,
  INTERPOLATION: 2,
  EXTRAPOLATION: 3,
  TOO_LATE: 4,
};

/** FR24 max delay by source: ADS-B 15 s, MLAT 20 s, everything else 30 s. */
function sourceMaxDelay(positionSource) {
  if (positionSource === 0) return 15_000; // ADS-B
  if (positionSource === 2) return 20_000; // MLAT
  return 30_000; // ASTERIX, FLARM, other
}

/** True when b can't plausibly follow a (implied speed far above what was reported). */
function isImplausibleJump(a, b) {
  const dt = (b.timestamp - a.timestamp) / 1000;
  if (dt <= 0) return false;
  const d = distance(a, b);
  if (d < 2000) return false;
  const impliedKt = d / dt / KT_TO_MS;
  const reportedKt = Math.max(a.speed || 0, b.speed || 0, 100);
  return impliedKt > reportedKt * 2 + 200;
}

export class AnimationEngine {
  constructor() {
    this.feedIntervalMs = 10_000;
    this.configs = new Map();
    /** id -> { latitude, longitude, track, timestamp, type } */
    this.render = new Map();
    this._chordCache = new WeakMap();
  }

  _config(id) {
    let c = this.configs.get(id);
    if (!c) {
      c = {
        lastKnown: { latitude: 0, longitude: 0, track: 0, speed: 0, timestamp: 0 },
        lastUpdate: -1,
        ages: [],
        start: 0,
        end: 0,
        interval: 0,
        positions: [], // ascending by timestamp
        suspect: null,
      };
      this.configs.set(id, c);
    }
    return c;
  }

  delete(id) {
    this.configs.delete(id);
    this.render.delete(id);
  }

  /** Positions history for an aircraft (used by trails later). */
  positions(id) {
    return this.configs.get(id)?.positions ?? [];
  }

  _insert(c, points) {
    for (const p of points) {
      const i = c.positions.findIndex((q) => q.timestamp >= p.timestamp);
      if (i === -1) c.positions.push(p);
      else if (c.positions[i].timestamp === p.timestamp) c.positions[i] = p;
      else c.positions.splice(i, 0, p);
    }
    if (c.positions.length > MAX_POSITIONS) c.positions.splice(0, c.positions.length - MAX_POSITIONS);
  }

  /** Weighted average data age (newest weighs 5, then 2, then 1). */
  _avgAge(c) {
    const w = [5, 2, 1];
    let sum = 0;
    let total = 0;
    for (let i = 0; i < c.ages.length; i++) {
      sum += c.ages[c.ages.length - 1 - i] * w[i];
      total += w[i];
    }
    return total ? sum / total : 0;
  }

  /** Average spacing of the newest positions (newest gap weighs more). */
  _avgGap(c, maxDelay) {
    const p = c.positions;
    let sum = 0;
    let total = 0;
    for (let i = p.length - 1, w = 2; i > 0 && w > 0; i--, w--) {
      const gap = p[i].timestamp - p[i - 1].timestamp;
      if (gap < maxDelay) {
        sum += gap * w;
        total += w;
      }
    }
    return total ? sum / total : 0;
  }

  /**
   * New report from the feed.
   * ac: { id, latitude, longitude, track, speed (kt), timestamp (ms), onGround, positionSource }
   * now: server-aligned clock (ms)
   */
  update(ac, now) {
    const c = this._config(ac.id);
    c.lastKnown = {
      latitude: ac.latitude,
      longitude: ac.longitude,
      track: ac.track ?? c.lastKnown.track,
      speed: ac.speed ?? 0,
      timestamp: ac.timestamp,
    };

    const newest = c.positions.at(-1);
    let hasNew = ac.timestamp > (newest?.timestamp ?? 0);
    const point = {
      latitude: ac.latitude,
      longitude: ac.longitude,
      timestamp: ac.timestamp,
      track: ac.track,
      speed: ac.speed,
    };
    let points = [];

    if (hasNew) {
      if (newest && isImplausibleJump(newest, point)) {
        if (c.suspect && !isImplausibleJump(c.suspect, point)) {
          // Two consistent reports at the new location: accept it as a real relocation.
          points = [c.suspect, point];
          c.positions = [];
          c.suspect = null;
          this.render.delete(ac.id);
        } else {
          c.suspect = point;
          hasNew = false;
        }
      } else {
        c.suspect = null;
        points = [point];
      }
    }

    if (hasNew) {
      c.ages.push(Math.max(0, now - ac.timestamp));
      if (c.ages.length > 3) c.ages.shift();
    }

    const snapToGround = ac.onGround && (ac.speed ?? 0) < GROUND_SNAP_MAX_KT;
    if (hasNew && c.positions.length === 0 && points.length === 1 && !snapToGround && ac.speed > 30 && ac.track != null) {
      // Seed: where it would have been one interval ago on its current track and speed.
      const back = destination(point, (ac.track + 180) % 360, ac.speed * KT_TO_MS * (this.feedIntervalMs / 1000));
      points.unshift({ ...back, timestamp: ac.timestamp - this.feedIntervalMs, track: ac.track, speed: ac.speed });
    }

    this._schedule(ac.id, c, now, ac.positionSource, snapToGround, points, hasNew);
  }

  _schedule(id, c, now, positionSource, snapToGround, points, hasNew) {
    let k = this.feedIntervalMs;
    const maxDelay = Math.max(sourceMaxDelay(positionSource), 2.5 * this.feedIntervalMs);
    this._insert(c, points);

    const gap = this._avgGap(c, maxDelay);
    if (gap > k && gap <= maxDelay) k = gap;
    const minSpan = 0.4 * k;
    const maxSpan = 1.8 * k;
    const oldest = c.positions[0]?.timestamp ?? 0;
    const newest = c.positions.at(-1)?.timestamp ?? 0;

    if (snapToGround) {
      c.lastUpdate = now;
      c.start = newest;
      c.end = newest;
      c.interval = k;
      return;
    }

    let target = now - this._avgAge(c) - PLAYOUT_DELAY_MS;
    if (target < oldest) target = oldest;
    let start = this.render.get(id)?.timestamp;
    if (!start || start <= 0) start = target - k;
    if (start < oldest) start = oldest;
    if (!hasNew) return;

    // Too little to animate: allow a little extrapolation past the newest point.
    if (target - start < minSpan) {
      target = Math.min(newest + MAX_EXTRAPOLATION_MS - PLAYOUT_DELAY_MS, start + minSpan);
    }
    // Fallen far behind (e.g. hidden tab): skip ahead rather than fast-forward.
    if (target - start > maxSpan) start = target - maxSpan;
    if (now - start > maxDelay) start = now - maxDelay;
    if (target - start < minSpan) target = Math.max(start, newest);

    c.lastUpdate = now;
    c.start = start;
    c.end = target;
    c.interval = k;
  }

  _renderTime(c, now) {
    if (c.interval <= 0) return c.end;
    return c.start + ((c.end - c.start) * (now - c.lastUpdate)) / c.interval;
  }

  _chordBearing(a, b, fallback) {
    let byB = this._chordCache.get(a);
    if (!byB) this._chordCache.set(a, (byB = new WeakMap()));
    let v = byB.get(b);
    if (v === undefined) {
      v = distance(a, b) < 1 ? null : bearing(a, b);
      byB.set(b, v);
    }
    return v ?? fallback;
  }

  /** Compute the drawn position of one aircraft at `now`. */
  calculate(id, now) {
    const c = this.configs.get(id);
    if (!c) return null;
    const p = c.positions;
    let status;

    if (p.length === 0) {
      const k = c.lastKnown;
      status = { latitude: k.latitude, longitude: k.longitude, track: k.track, timestamp: k.timestamp, type: RenderType.NO_POSITIONS };
    } else {
      const t = this._renderTime(c, now);
      // p is short (<= 20) and sorted: find the first point after t
      let i = 0;
      while (i < p.length && p[i].timestamp <= t) i++;
      const a = p[i - 1];
      const b = p[i];

      if (!a) {
        status = { latitude: b.latitude, longitude: b.longitude, track: b.track ?? c.lastKnown.track, timestamp: t, type: RenderType.TOO_EARLY };
      } else if (b) {
        const f = (t - a.timestamp) / (b.timestamp - a.timestamp);
        const pos = interpolate(f, a, b);
        const track =
          a.track != null && b.track != null
            ? lerpAngle(a.track, b.track, f)
            : this._chordBearing(a, b, c.lastKnown.track);
        status = { ...pos, track, timestamp: t, type: RenderType.INTERPOLATION };
      } else {
        const dt = t - a.timestamp;
        const capped = Math.sign(dt) * Math.min(MAX_EXTRAPOLATION_MS, Math.abs(dt));
        const track = a.track ?? c.lastKnown.track;
        const speed = a.speed ?? c.lastKnown.speed;
        const pos = destination(a, track, speed * KT_TO_MS * (capped / 1000));
        status = {
          ...pos,
          track,
          timestamp: Math.min(t, a.timestamp + MAX_EXTRAPOLATION_MS),
          type: Math.abs(dt) > MAX_EXTRAPOLATION_MS ? RenderType.TOO_LATE : RenderType.EXTRAPOLATION,
        };
      }
    }
    this.render.set(id, status);
    return status;
  }
}

/**
 * How often to recompute positions (FR24 `useFeedAnimationInterval`): roughly the time a
 * plane needs to move one pixel at this zoom, but slower when there are many aircraft.
 * googleZoom = MapLibre zoom + 1 (MapLibre uses 512 px tiles).
 */
const MS_PER_PIXEL_BY_ZOOM = [705e3, 352e3, 176e3, 88e3, 44e3, 22e3, 11e3, 5e3, 2700, 1300, 600, 340, 170];
const COUNT_LIMITS = [10, 60, 100, 200, 400, 600, 1000];
const COUNT_MS = [16, 50, 250, 500, 1000, 2000, 3000];

export function animationTickMs(count, googleZoom, latitude) {
  const n = COUNT_LIMITS.findIndex((limit) => count <= limit);
  const countMs = n === -1 ? 4000 : COUNT_MS[n];
  const z = Math.round(googleZoom);
  const zoomMs = z <= 12 ? (MS_PER_PIXEL_BY_ZOOM[Math.max(0, z)] ?? 16) * Math.cos((latitude * Math.PI) / 180) : 16;
  return Math.min(1000, Math.max(16, Math.max(countMs, zoomMs)));
}
