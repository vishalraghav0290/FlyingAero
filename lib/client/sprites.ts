/**
 * Builds the aircraft icon atlas at startup.
 *
 * Silhouettes are original drawings generated from real airframe dimensions (metres):
 * fuselage, swept wings with trailing-edge kink, tailplane, engine pods, props and rotors.
 * Each shape is rendered once per colour state, with a dark outline around the union of
 * all parts and lighter/darker tones for shading. That's the look FR24 gets by
 * multiplying a shaded sprite with yellow.
 *
 * Size per shape follows FR24's convention: max frame dimension relative to the B736 frame
 * (212 px), so an A380 draws ~1.5x bigger than a 737-600.
 */

import type { RGB } from './types.ts';

const CELL = 128;
const GAP = 2;
const OUTLINE = 4; // px in the 128 px cell, ~1 css px on screen

/** Atlas cell of one icon (deck.gl IconLayer `iconMapping` entry). */
export interface IconAtlasEntry {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorY: number;
  mask: boolean;
}

/** Icon key (`${shape}_${frame}_${state}`) -> atlas cell. */
export type IconAtlasMapping = Record<string, IconAtlasEntry>;

/** Result of `buildAircraftAtlas`. */
export interface AircraftAtlas {
  /** PNG data URL of the atlas. */
  url: string;
  mapping: IconAtlasMapping;
  canvas: HTMLCanvasElement;
}

type Pt = [number, number];
/** [x0, y0, x1, y1] */
type Bounds = [number, number, number, number];
type Tone = 'body' | 'dark' | 'light';
type Part =
  | { kind: 'poly'; tone: Tone; pts: Pt[]; alpha?: number }
  | { kind: 'line'; tone: Tone; pts: Pt[]; width: number; alpha?: number }
  | { kind: 'ellipse'; tone: Tone; c: Pt; r: Pt; alpha?: number }
  | { kind: 'circle'; tone: Tone; c: Pt; r: number; alpha?: number };
interface Geometry {
  parts: Part[];
  bounds: Bounds | null;
}

/** Wing or tailplane, see AIRFRAMES. */
interface Surface {
  le: number;
  rc: number;
  half: number;
  tle: number;
  tc: number;
  kink?: Pt;
}
/** [x, y front, length, width] */
type Engine = [number, number, number, number];
interface Airframe {
  L: number;
  fw: number;
  nose: number;
  tail: Pt;
  wing: Surface;
  ht: Surface;
  eng?: Engine[];
  rearEng?: Engine[];
  /** [y front, length, width] */
  tailEng?: [number, number, number];
  /** [width, y front, length] */
  hump?: [number, number, number];
  /** [x, y, half span] */
  props?: [number, number, number][];
}

/** Colour states (FR24 values). */
export const COLORS: Readonly<Record<string, RGB>> = {
  n: [255, 216, 0], // default #FFD800
  h: [255, 100, 100], // hovered / selected
  e: [255, 0, 0], // emergency squawk
  g: [200, 200, 200], // ground vehicles
};

// --- Airframe specs ---------------------------------------------------------------------
// y runs from the nose (0) to the tail; x is the half-width. Units are metres.
// wing/ht: le = root leading edge, rc = root chord, half = half span, tle = tip leading
// edge, tc = tip chord, kink = [x, trailing edge y]. eng: [x, y front, length, width].
const AIRFRAMES: Record<string, Airframe> = {
  b736: { L: 31.2, fw: 1.88, nose: 4.2, tail: [22.5, 0.35], wing: { le: 12.3, rc: 7.0, half: 17.2, tle: 20.8, tc: 1.3, kink: [6.3, 18.6] }, ht: { le: 25.6, rc: 3.6, half: 6.6, tle: 29.1, tc: 1.2 }, eng: [[4.9, 9.8, 4.0, 1.9]] },
  b737: { L: 39.5, fw: 1.88, nose: 4.2, tail: [30, 0.35], wing: { le: 14.6, rc: 7.3, half: 17.2, tle: 23.4, tc: 1.3, kink: [6.3, 20.9] }, ht: { le: 33.6, rc: 3.7, half: 7.2, tle: 37.2, tc: 1.2 }, eng: [[4.9, 12.0, 4.2, 1.95]] },
  a320: { L: 37.6, fw: 1.98, nose: 4.4, tail: [28, 0.35], wing: { le: 13.8, rc: 7.0, half: 17.9, tle: 22.6, tc: 1.6, kink: [6.5, 19.7] }, ht: { le: 31.4, rc: 3.6, half: 6.2, tle: 34.6, tc: 1.3 }, eng: [[5.75, 10.9, 4.6, 2.2]] },
  b757: { L: 47.3, fw: 1.88, nose: 4.6, tail: [37, 0.4], wing: { le: 17.6, rc: 8.2, half: 19.0, tle: 27.6, tc: 1.6, kink: [7.2, 24.9] }, ht: { le: 40.6, rc: 4.2, half: 7.5, tle: 44.7, tc: 1.4 }, eng: [[6.6, 14.3, 5.0, 2.4]] },
  b767: { L: 54.9, fw: 2.5, nose: 5.4, tail: [43, 0.45], wing: { le: 20.8, rc: 9.5, half: 23.9, tle: 32.6, tc: 2.0, kink: [8.8, 29.3] }, ht: { le: 47.0, rc: 5.0, half: 9.3, tle: 52.0, tc: 1.7 }, eng: [[7.9, 17.2, 5.6, 2.8]] },
  a330: { L: 63.7, fw: 2.82, nose: 6.0, tail: [50, 0.5], wing: { le: 24.6, rc: 11.0, half: 30.2, tle: 41.2, tc: 2.2, kink: [10.5, 33.8] }, ht: { le: 54.4, rc: 6.0, half: 9.7, tle: 59.8, tc: 2.0 }, eng: [[9.9, 20.6, 6.4, 3.1]] },
  b777: { L: 73.9, fw: 3.1, nose: 6.6, tail: [58, 0.55], wing: { le: 28.6, rc: 13.0, half: 32.4, tle: 46.2, tc: 2.4, kink: [11.6, 39.6] }, ht: { le: 63.2, rc: 7.0, half: 10.8, tle: 69.2, tc: 2.3 }, eng: [[9.6, 23.0, 7.8, 4.0]] },
  a340: { L: 67.9, fw: 2.82, nose: 6.0, tail: [54, 0.5], wing: { le: 26.4, rc: 11.0, half: 31.6, tle: 43.6, tc: 2.2, kink: [10.5, 35.6] }, ht: { le: 58.6, rc: 6.0, half: 9.7, tle: 64.0, tc: 2.0 }, eng: [[9.0, 22.6, 5.2, 2.4], [17.6, 28.6, 5.0, 2.3]] },
  md11: { L: 61.6, fw: 3.0, nose: 5.8, tail: [49, 0.6], wing: { le: 24.2, rc: 10.8, half: 25.8, tle: 37.2, tc: 2.0, kink: [9.5, 32.2] }, ht: { le: 53.6, rc: 5.5, half: 9.0, tle: 58.6, tc: 1.8 }, eng: [[8.6, 20.2, 6.0, 2.9]], tailEng: [47.6, 7.5, 3.0] },
  b747: { L: 70.7, fw: 3.25, nose: 7.0, tail: [56, 0.55], wing: { le: 25.6, rc: 14.6, half: 32.2, tle: 46.6, tc: 3.0, kink: [12.0, 41.2] }, ht: { le: 61.6, rc: 7.5, half: 11.0, tle: 67.6, tc: 2.5 }, eng: [[11.8, 22.4, 6.0, 2.8], [21.0, 30.0, 5.8, 2.7]], hump: [2.0, 4.5, 20] },
  a380: { L: 72.7, fw: 3.6, nose: 6.8, tail: [57, 0.6], wing: { le: 23.6, rc: 17.6, half: 39.8, tle: 45.6, tc: 4.0, kink: [14.0, 43.2] }, ht: { le: 61.2, rc: 9.0, half: 15.3, tle: 68.2, tc: 3.0 }, eng: [[15.4, 22.0, 6.4, 3.0], [25.7, 29.6, 6.2, 2.9]] },
  md80: { L: 45.1, fw: 1.67, nose: 4.4, tail: [35, 0.4], wing: { le: 18.2, rc: 7.0, half: 16.4, tle: 25.4, tc: 1.4, kink: [5.5, 23.6] }, ht: { le: 41.2, rc: 3.2, half: 6.1, tle: 43.8, tc: 1.4 }, rearEng: [[2.75, 33.6, 6.0, 1.7]] },
  rj85: { L: 28.6, fw: 1.75, nose: 3.6, tail: [21, 0.45], wing: { le: 11.6, rc: 4.4, half: 13.15, tle: 13.6, tc: 1.6 }, ht: { le: 25.4, rc: 2.8, half: 5.5, tle: 26.9, tc: 1.3 }, eng: [[3.7, 9.8, 3.2, 1.3], [6.2, 10.3, 3.0, 1.25]] },
  q300: { L: 25.7, fw: 1.35, nose: 3.0, tail: [18, 0.35], wing: { le: 10.1, rc: 2.6, half: 13.7, tle: 10.8, tc: 1.4 }, ht: { le: 22.2, rc: 2.2, half: 4.0, tle: 23.4, tc: 1.1 }, eng: [[4.1, 7.6, 5.6, 1.15]], props: [[4.1, 7.45, 2.0]] },
  lj60: { L: 17.9, fw: 0.95, nose: 2.6, tail: [12.5, 0.3], wing: { le: 7.4, rc: 3.0, half: 6.7, tle: 9.4, tc: 1.0 }, ht: { le: 15.9, rc: 1.7, half: 2.7, tle: 17.1, tc: 0.8 }, rearEng: [[1.6, 11.4, 3.0, 0.9]] },
  c206: { L: 8.6, fw: 0.6, nose: 1.0, tail: [3.4, 0.14], wing: { le: 2.4, rc: 1.55, half: 5.5, tle: 2.5, tc: 1.25 }, ht: { le: 7.2, rc: 1.1, half: 1.75, tle: 7.35, tc: 0.8 }, props: [[0, -0.05, 1.05]] },
  glider: { L: 6.6, fw: 0.36, nose: 0.9, tail: [2.6, 0.09], wing: { le: 2.3, rc: 0.95, half: 7.5, tle: 2.55, tc: 0.42 }, ht: { le: 6.15, rc: 0.5, half: 1.4, tle: 6.22, tc: 0.36 } },
  fighter: { L: 15.0, fw: 0.85, nose: 4.5, tail: [13.0, 0.6], wing: { le: 5.8, rc: 7.6, half: 4.9, tle: 11.6, tc: 1.6 }, ht: { le: 12.4, rc: 2.2, half: 2.9, tle: 13.9, tc: 0.9 } },
};

/**
 * Relative icon size per shape, from the real airframe size (max of length and span, metres).
 * The B736 is 1.0. A square root compresses the range so a Cessna stays visible and an A380
 * doesn't swamp the map: this matches FR24's 1.49x for the A380 at the large end, while
 * light aircraft, helicopters and drones come out clearly smaller than airliners.
 */
const SPECIAL_DIM_M: Record<string, number> = { heli: 10.8, balloon: 16, drone: 5.6, ground: 5.6 };
const MIN_SIZE = 0.5;
const MAX_SIZE = 1.6;

function realDimension(shape: string): number {
  const a = AIRFRAMES[shape];
  return a ? Math.max(a.L, a.wing.half * 2) : SPECIAL_DIM_M[shape];
}

/** Shape key -> relative icon size (B736 = 1). Every known shape is listed. */
export const SHAPE_SIZE: Record<string, number> = {};
for (const shape of [...Object.keys(AIRFRAMES), ...Object.keys(SPECIAL_DIM_M)]) {
  const ratio = Math.sqrt(realDimension(shape) / realDimension('b736'));
  SHAPE_SIZE[shape] = Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, ratio)) * 100) / 100;
}

/** Shapes with animation frames (rotor). FR24 animates its helicopter sprite in 2 frames. */
export const SHAPE_FRAMES: Readonly<Record<string, number>> = { heli: 2 };
/** Shapes that are never rotated. */
export const UNROTATED: ReadonlySet<string> = new Set(['balloon']);

// --- Geometry -------------------------------------------------------------------------
// Parts: { kind: 'poly'|'ellipse'|'line'|'circle', tone, ... }. Tones: body, dark, light.

const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]): Pt => [-x, y]).reverse();

function fuselage({ L, fw, nose, tail }: Airframe): Pt[] {
  const [tailStart, tailW] = tail;
  const right: Pt[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    right.push([fw * Math.sqrt(1 - (1 - t) ** 2), nose * t]);
  }
  right.push([fw, tailStart]);
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    right.push([fw + (tailW - fw) * (1 - (1 - t) ** 1.6), tailStart + (L - tailStart) * t]);
  }
  return [...right, ...mirror(right)];
}

function surface(s: Surface, rootX: number): Pt[] {
  const pts: Pt[] = [[rootX, s.le], [s.half, s.tle], [s.half, s.tle + s.tc]];
  if (s.kink) pts.push(s.kink);
  pts.push([rootX, s.le + s.rc]);
  return pts;
}

function airliner(a: Airframe): Geometry {
  const parts: Part[] = [];
  const root = a.fw * 0.4;
  const wing = surface(a.wing, root);
  parts.push({ kind: 'poly', tone: 'body', pts: wing }, { kind: 'poly', tone: 'body', pts: mirror(wing) });
  const ht = surface(a.ht, root);
  parts.push({ kind: 'poly', tone: 'body', pts: ht }, { kind: 'poly', tone: 'body', pts: mirror(ht) });
  for (const [x, y, len, w] of a.eng ?? []) {
    for (const sx of [x, -x]) parts.push({ kind: 'ellipse', tone: 'dark', c: [sx, y + len / 2], r: [w / 2, len / 2] });
  }
  parts.push({ kind: 'poly', tone: 'body', pts: fuselage(a) });
  for (const [x, y, len, w] of a.rearEng ?? []) {
    for (const sx of [x, -x]) parts.push({ kind: 'ellipse', tone: 'dark', c: [sx, y + len / 2], r: [w / 2, len / 2] });
  }
  if (a.tailEng) {
    const [y, len, w] = a.tailEng;
    parts.push({ kind: 'ellipse', tone: 'dark', c: [0, y + len / 2], r: [w / 2, len / 2] });
  }
  if (a.hump) {
    const [w, y, len] = a.hump;
    parts.push({ kind: 'ellipse', tone: 'light', c: [0, y + len / 2], r: [w / 2, len / 2], alpha: 0.35 });
  }
  // Highlight along the top of the fuselage
  parts.push({ kind: 'line', tone: 'light', pts: [[0, a.nose * 0.7], [0, a.tail[0]]], width: a.fw * 0.55, alpha: 0.4 });
  for (const [x, y, half] of a.props ?? []) {
    parts.push({ kind: 'line', tone: 'dark', pts: [[x - half, y], [x + half, y]], width: half * 0.16 });
    if (x !== 0) parts.push({ kind: 'line', tone: 'dark', pts: [[-x - half, y], [-x + half, y]], width: half * 0.16 });
  }
  return { parts, bounds: null };
}

function helicopter(frame: number): Geometry {
  const R = 5.4;
  const hub: Pt = [0, 4.0];
  const parts: Part[] = [
    { kind: 'line', tone: 'body', pts: [[0, 6.0], [0, 11.6]], width: 0.55 },
    { kind: 'poly', tone: 'body', pts: [[0.25, 9.5], [1.15, 9.65], [1.15, 10.05], [0.25, 10.2], [-0.25, 10.2], [-1.15, 10.05], [-1.15, 9.65], [-0.25, 9.5]] },
    { kind: 'line', tone: 'dark', pts: [[0.45, 10.9], [0.45, 12.3]], width: 0.22 },
    { kind: 'ellipse', tone: 'body', c: [0, 4.3], r: [1.35, 3.1] },
    { kind: 'ellipse', tone: 'light', c: [0, 3.0], r: [0.75, 1.2], alpha: 0.45 },
  ];
  const offset = frame * 45;
  for (let i = 0; i < 4; i++) {
    const ang = ((offset + i * 90 + 45) * Math.PI) / 180;
    parts.push({ kind: 'line', tone: 'dark', pts: [hub, [hub[0] + R * Math.sin(ang), hub[1] - R * Math.cos(ang)]], width: 0.42 });
  }
  parts.push({ kind: 'circle', tone: 'dark', c: hub, r: 0.45 });
  // keep both frames on the same bounds so the rotor doesn't wobble
  return { parts, bounds: [-R, hub[1] - R, R, Math.max(12.3, hub[1] + R)] };
}

function balloon(): Geometry {
  const R = 8;
  const parts: Part[] = [{ kind: 'circle', tone: 'body', c: [0, 0], r: R }];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    parts.push({ kind: 'line', tone: 'dark', pts: [[0, 0], [R * 0.93 * Math.cos(a), R * 0.93 * Math.sin(a)]], width: 0.35, alpha: 0.7 });
  }
  parts.push({ kind: 'circle', tone: 'light', c: [-2.4, -2.4], r: 2.6, alpha: 0.4 });
  parts.push({ kind: 'circle', tone: 'dark', c: [0, 0], r: 1.1 });
  return { parts, bounds: [-R, -R, R, R] };
}

function drone(): Geometry {
  const d = 1.7;
  const parts: Part[] = [];
  for (const [x, y] of [[d, d], [-d, d], [d, -d], [-d, -d]]) {
    parts.push({ kind: 'line', tone: 'body', pts: [[0, 0], [x, y]], width: 0.38 });
    parts.push({ kind: 'circle', tone: 'body', c: [x, y], r: 1.05 });
    parts.push({ kind: 'circle', tone: 'dark', c: [x, y], r: 0.3 });
  }
  parts.push({ kind: 'poly', tone: 'body', pts: [[0, -0.9], [0.55, -0.35], [0.55, 0.7], [-0.55, 0.7], [-0.55, -0.35]] });
  return { parts, bounds: [-2.8, -2.8, 2.8, 2.8] };
}

function groundVehicle(): Geometry {
  const parts: Part[] = [
    { kind: 'poly', tone: 'body', pts: roundedRect(-1.2, 0, 2.4, 5.6, 0.45) },
    { kind: 'poly', tone: 'dark', pts: roundedRect(-1.0, 0.45, 2.0, 1.3, 0.3) },
    { kind: 'line', tone: 'light', pts: [[0, 2.3], [0, 5.0]], width: 0.9, alpha: 0.4 },
  ];
  return { parts, bounds: [-2.8, -0.2, 2.8, 5.8] };
}

function roundedRect(x: number, y: number, w: number, h: number, r: number): Pt[] {
  const pts: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (i * Math.PI) / 8;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return pts;
}

function geometry(shape: string, frame: number): Geometry {
  if (AIRFRAMES[shape]) return airliner(AIRFRAMES[shape]);
  if (shape === 'heli') return helicopter(frame);
  if (shape === 'balloon') return balloon();
  if (shape === 'drone') return drone();
  return groundVehicle();
}

function partBounds(parts: Part[]): Bounds {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  };
  for (const p of parts) {
    if (p.kind === 'poly' || p.kind === 'line') p.pts.forEach(([x, y]) => add(x, y));
    else if (p.kind === 'ellipse') { add(p.c[0] - p.r[0], p.c[1] - p.r[1]); add(p.c[0] + p.r[0], p.c[1] + p.r[1]); }
    else if (p.kind === 'circle') { add(p.c[0] - p.r, p.c[1] - p.r); add(p.c[0] + p.r, p.c[1] + p.r); }
  }
  return [x0, y0, x1, y1];
}

// --- Rendering --------------------------------------------------------------------------

const rgb = ([r, g, b]: readonly number[], a = 1): string => `rgba(${r},${g},${b},${a})`;
const mix = (c: readonly number[], t: readonly number[], f: number): number[] =>
  c.map((v, i) => Math.round(v + (t[i] - v) * f));

function drawShape(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  shape: string,
  frame: number,
  color: RGB,
  isShadow: boolean,
): void {
  const { parts, bounds } = geometry(shape, frame);
  const [x0, y0, x1, y1] = bounds ?? partBounds(parts);
  const usable = CELL - 2 * (OUTLINE + 2);
  const s = usable / Math.max(x1 - x0, y1 - y0);
  const cx = ox + CELL / 2 - ((x0 + x1) / 2) * s;
  const cy = oy + CELL / 2 - ((y0 + y1) / 2) * s;
  const tx = (x: number) => cx + x * s;
  const ty = (y: number) => cy + y * s;

  const path = (p: Part): Path2D => {
    const d = new Path2D();
    if (p.kind === 'poly') {
      p.pts.forEach(([x, y], i) => (i ? d.lineTo(tx(x), ty(y)) : d.moveTo(tx(x), ty(y))));
      d.closePath();
    } else if (p.kind === 'ellipse') {
      d.ellipse(tx(p.c[0]), ty(p.c[1]), p.r[0] * s, p.r[1] * s, 0, 0, Math.PI * 2);
    } else if (p.kind === 'circle') {
      d.arc(tx(p.c[0]), ty(p.c[1]), p.r * s, 0, Math.PI * 2);
    } else {
      p.pts.forEach(([x, y], i) => (i ? d.lineTo(tx(x), ty(y)) : d.moveTo(tx(x), ty(y))));
    }
    return d;
  };

  const tones: Record<Tone, readonly number[]> = {
    body: color,
    dark: mix(color, [0, 0, 0], 0.42),
    light: mix(color, [255, 255, 255], 0.6),
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 1) outline: stroke every solid part wide in dark, so only the union's outer edge shows
  const solid = parts.filter((p) => p.tone !== 'light');
  ctx.strokeStyle = isShadow ? 'rgba(0,0,0,1)' : 'rgba(18,18,18,0.92)';
  ctx.fillStyle = ctx.strokeStyle;
  for (const p of solid) {
    const d = path(p);
    if (p.kind === 'line') {
      ctx.lineWidth = p.width * s + OUTLINE * 2;
      ctx.stroke(d);
    } else {
      ctx.lineWidth = OUTLINE * 2;
      ctx.stroke(d);
      ctx.fill(d);
    }
  }
  if (isShadow) return;

  // 2) fills in order
  for (const p of parts) {
    const d = path(p);
    const c = rgb(tones[p.tone], p.alpha ?? 1);
    if (p.kind === 'line') {
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(1, p.width * s);
      ctx.stroke(d);
    } else {
      ctx.fillStyle = c;
      ctx.fill(d);
    }
  }
}

/**
 * Returns { url, mapping } for deck.gl's IconLayer.
 * Icon keys: `${shape}_${frame}_${state}` with state n/h/e/g, plus `${shape}_${frame}_s` (shadow).
 */
export function buildAircraftAtlas(): AircraftAtlas {
  const frames: [shape: string, frame: number][] = [];
  for (const shape of Object.keys(SHAPE_SIZE)) {
    for (let f = 0; f < (SHAPE_FRAMES[shape] ?? 1); f++) frames.push([shape, f]);
  }
  const states = [...Object.keys(COLORS), 's'];
  const total = frames.length * states.length;
  const cols = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / cols);
  const stride = CELL + GAP;

  const canvas = document.createElement('canvas');
  canvas.width = cols * stride;
  canvas.height = rows * stride;
  const ctx = canvas.getContext('2d')!; // a fresh canvas always has a 2d context
  const mapping: IconAtlasMapping = {};
  let i = 0;
  for (const [shape, frame] of frames) {
    for (const state of states) {
      const x = (i % cols) * stride;
      const y = Math.floor(i / cols) * stride;
      ctx.save();
      drawShape(ctx, x, y, shape, frame, COLORS[state] ?? [0, 0, 0], state === 's');
      ctx.restore();
      mapping[`${shape}_${frame}_${state}`] = { x, y, width: CELL, height: CELL, anchorY: CELL / 2, mask: false };
      i++;
    }
  }
  return { url: canvas.toDataURL('image/png'), mapping, canvas };
}
