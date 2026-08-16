import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
/**
 * Flight trail of the selected aircraft, drawn the way FR24 does it:
 *  - 3 px line, rounded joins, each vertex coloured by altitude (FR24's 32-stop table, metres)
 *  - a gap of >= 120 s between points becomes a thin dotted line along the great circle
 *  - small dots on every real point; hovering one shows UTC time, ground speed and altitude
 *  - the trail is cut at the aircraft's drawn time and joined to the moving icon,
 *    so the line never runs ahead of the plane
 * Change for the dark basemap: FR24 draws trails at alpha 100/255 and gaps in black on a light
 * map. That's too faint here, so lines use alpha 200 and gaps are light grey.
 */
import { distance, interpolate, KT_TO_MS } from './geo.js';
import { theme } from './mapstyles.js';

const GAP_S = 120; // FR24: no data for 2 min = dotted
// OpenSky track waypoints are only stored when the flight changes, so a long gap between
// two of them usually means straight flight, not missing data.
const WAYPOINT_GAP_S = 900;
// Light maps get FR24's own values (alpha ~100, black dotted gaps); dark maps need more contrast.
const lineAlpha = () => (theme.current.light ? 170 : 200);
const gapColor = () => (theme.current.light ? [0, 0, 0, 110] : [230, 230, 230, 150]);
const DENSIFY_OVER_M = 30_000; // add great-circle points to long straight segments

// FR24 altitude colour ramp (aircraftLayerHelpers): thresholds in metres, high to low.
const RAMP_COLORS = ['#ff0000', '#ff00e4', '#d800ff', '#ae00ff', '#9600ff', '#7800ff', '#6000ff', '#4e00ff', '#3600ff', '#2400ff', '#1200ff', '#0000ff', '#001eff', '#0030ff', '#0054ff', '#0078ff', '#0096ff', '#00a8ff', '#00c0ff', '#00eaff', '#00ffe4', '#00ffd2', '#00ff9c', '#00ff72', '#00ff36', '#00ff0c', '#1eff00', '#42ff00', '#ccff00', '#f0ff00', '#ffea00', '#ffe062'];
const RAMP_STOPS = [13e3, 12500, 12e3, 11500, 11e3, 10500, 1e4, 9500, 9e3, 8500, 8500, 7500, 7e3, 6500, 6e3, 5500, 5e3, 4500, 4e3, 3500, 3e3, 2500, 2e3, 1500, 1200, 1e3, 800, 600, 400, 300, 200, 100];

export function altitudeHex(altM) {
  if (altM == null || altM <= 100) return '#ffffff';
  return RAMP_COLORS[RAMP_STOPS.findIndex((s) => s < altM)] || '#ff0000';
}

const rgbCache = new Map();
export function altitudeRgb(altM) {
  const hex = altitudeHex(altM);
  let c = rgbCache.get(hex);
  if (!c) {
    c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    rgbCache.set(hex, c);
  }
  return c;
}

function densify(a, b, n) {
  const out = [];
  for (let i = 1; i < n; i++) {
    const f = i / n;
    const p = interpolate(f, a, b);
    out.push({ ...p, altM: a.altM == null || b.altM == null ? (a.altM ?? b.altM) : a.altM + (b.altM - a.altM) * f });
  }
  return out;
}

export class Trail {
  constructor() {
    this.icao = null;
    this.points = []; // { t (s), latitude, longitude, altM, speedKt, ground }
    this.loading = false;
  }

  clear() {
    this.icao = null;
    this.points = [];
  }

  /** Rows from /api/aircraft: [t, lat, lon, altM, velocityMs, track, onGround, live] */
  set(icao, rows) {
    const sameAircraft = this.icao === icao;
    this.icao = icao;
    const pts = rows.map(([t, lat, lon, alt, vel, , ground, live]) => ({
      t,
      latitude: lat,
      longitude: lon,
      altM: ground ? 0 : alt,
      speedKt: vel == null ? null : vel / KT_TO_MS,
      ground: Boolean(ground),
      live: Boolean(live),
    }));
    // OpenSky track waypoints have no speed: derive it from neighbouring points.
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.altM == null) p.altM = pts[i - 1]?.altM ?? 0;
      if (p.speedKt != null) continue;
      const a = pts[i - 1] ?? p;
      const b = pts[i + 1] ?? p;
      const dt = b.t - a.t;
      p.speedKt = dt > 0 && dt < WAYPOINT_GAP_S ? distance(a, b) / dt / KT_TO_MS : null;
    }
    // Keep live points received while the request was in flight.
    const lastT = pts.at(-1)?.t ?? 0;
    this.points = [...pts, ...(sameAircraft ? this.points.filter((p) => p.t > lastT) : [])];
  }

  /** Add the newest real position from the feed. Estimated positions are not trail data. */
  append(ac) {
    if (ac.id !== this.icao || ac.estimated) return;
    const t = ac.timestamp / 1000;
    if (this.points.length && this.points.at(-1).t >= t) return;
    this.points.push({
      t,
      latitude: ac.latitude,
      longitude: ac.longitude,
      altM: ac.altitude * 0.3048,
      speedKt: ac.speed,
      ground: ac.onGround,
      live: true,
    });
  }

  /**
   * Layers for the current frame.
   * live: { latitude, longitude, timestamp (ms) } drawn position of the aircraft
   */
  layers({ live, liveAltM, liveEstimated = false, googleZoom, onHover }) {
    if (!this.points.length) return [];
    const cutoff = live ? live.timestamp / 1000 : Infinity;
    const pts = this.points.filter((p) => p.t <= cutoff);
    if (!pts.length) return [];

    const isGap = (a, b) => b.t - a.t >= (a.live && b.live ? GAP_S : WAYPOINT_GAP_S);
    const solid = [[pts[0]]];
    const gaps = [];
    for (let i = 1; i < pts.length; i++) {
      if (isGap(pts[i - 1], pts[i])) {
        gaps.push([pts[i - 1], pts[i]]);
        solid.push([pts[i]]);
      } else {
        solid.at(-1).push(pts[i]);
      }
    }
    if (live) {
      const end = { latitude: live.latitude, longitude: live.longitude, t: cutoff, altM: liveAltM, live: true };
      const last = pts.at(-1);
      // estimated position: the stretch since the last real report is dotted, not solid
      if (liveEstimated || isGap(last, end)) gaps.push([last, end]);
      else solid.at(-1).push(end);
    }

    // Long segments follow the great circle
    const smooth = solid
      .filter((g) => g.length > 1)
      .map((g) => {
        const out = [g[0]];
        for (let i = 1; i < g.length; i++) {
          const d = distance(g[i - 1], g[i]);
          if (d > DENSIFY_OVER_M) out.push(...densify(g[i - 1], g[i], Math.min(50, Math.ceil(d / DENSIFY_OVER_M))));
          out.push(g[i]);
        }
        return out;
      });
    const gapSteps = googleZoom <= 10 ? 25 : 50;
    const dotted = gaps.map(([a, b]) => [a, ...densify(a, b, gapSteps), b]);

    const alpha = lineAlpha();
    const common = {
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
      wrapLongitude: true,
      pickable: false,
      parameters: { depthCompare: 'always' },
      getPath: (g) => g.map((p) => [p.longitude, p.latitude]),
    };

    return [
      new PathLayer({
        ...common,
        id: 'trail-gaps',
        data: dotted,
        getWidth: 1,
        getColor: gapColor(),
        getDashArray: [1, 3],
        dashJustified: true,
        extensions: [new PathStyleExtension({ dash: true })],
      }),
      new PathLayer({
        ...common,
        id: 'trail-line',
        data: smooth,
        getWidth: 3,
        getColor: (g) => g.map((p) => [...altitudeRgb(p.altM), alpha]),
        updateTriggers: { getPath: live?.timestamp, getColor: [live?.timestamp, alpha] },
      }),
      new ScatterplotLayer({
        id: 'trail-dots',
        data: pts,
        radiusUnits: 'pixels',
        getRadius: 1.5,
        stroked: false,
        filled: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 255],
        getPosition: (p) => [p.longitude, p.latitude],
        getFillColor: (p) => [...altitudeRgb(p.altM), 255],
        parameters: { depthCompare: 'always' },
        onHover: ({ object }) => onHover?.(object ?? null),
      }),
    ];
  }
}
