import { IconLayer, TextLayer } from '@deck.gl/layers';
/**
 * Airports layer (FR24 AirportsLayer conventions):
 *  - pin size by airport size, small icons below the "detail" zoom and larger ones above
 *    (FR24 small_default [24..16] / large_default [40..24] px); highlighted airports x1.5
 *  - label = IATA (or ICAO) code, plus the name once zoomed in
 *  - origin/destination of the selected flight are highlighted
 * Data: OurAirports (public domain), large + medium + scheduled small airports.
 */
import type { Layer, PickingInfo } from '@deck.gl/core';
import { distance } from './geo.ts';
import { theme } from './mapstyles.ts';
import type { LatLon, LngLat, RGBA } from './types.ts';

/** Row of /api/airports: [icao, iata, name, lat, lon, elevFt, size, city, country]. */
export type AirportRow = [
  icao: string,
  iata: string,
  name: string,
  lat: number,
  lon: number,
  elevFt: number,
  size: number,
  city: string,
  country: string,
];

/** An airport as held by the layer. */
export interface Airport extends LatLon {
  icao: string;
  iata: string;
  name: string;
  elevationFt: number;
  /** 0 large, 1 medium, 2 small. */
  size: number;
  city: string;
  country: string;
}

/** Result of `AirportLayer.nearest`. */
export interface NearestAirport extends Airport {
  /** Distance to the query point, metres. */
  distanceM: number;
}

export interface AirportLayerOptions {
  /** Called with the hovered airport, or null when the pointer leaves it. */
  onHover?: (airport: Airport | null) => void;
}

/** deck.gl IconLayer `iconMapping` entry. */
interface PinAtlasEntry {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorY: number;
  mask: boolean;
}

interface PinAtlas {
  url: string;
  mapping: { airport: PinAtlasEntry; highlight: PinAtlasEntry };
}

const DETAIL_ZOOM = 9; // Google zoom where pins grow and names appear
const SIZE_SMALL = [22, 18, 16]; // by size class: large, medium, small (FR24 small_default)
const SIZE_LARGE = [36, 28, 24]; // FR24 large_default
const MIN_ZOOM_BY_SIZE = [3, 6.5, 8.5]; // Google zoom at which each size class appears
const LABEL_ZOOM_BY_SIZE = [5, 8, 9.5];
const NAME_ZOOM = 10;

function drawPin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fill: string,
  ring: string,
  glyph: string,
): void {
  // teardrop pin, tip at the bottom centre
  const r = size * 0.36;
  const cx = x + size / 2;
  const cy = y + r + 2;
  ctx.beginPath();
  ctx.moveTo(cx, y + size - 1);
  ctx.bezierCurveTo(cx - r * 0.35, cy + r * 1.25, cx - r, cy + r * 0.55, cx - r, cy);
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.bezierCurveTo(cx + r, cy + r * 0.55, cx + r * 0.35, cy + r * 1.25, cx, y + size - 1);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = ring;
  ctx.lineWidth = size * 0.06;
  ctx.fill();
  ctx.stroke();
  // runway glyph: two crossing strips
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = glyph;
  ctx.lineCap = 'round';
  ctx.lineWidth = size * 0.07;
  ctx.rotate(-Math.PI / 5);
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, 0);
  ctx.lineTo(r * 0.55, 0);
  ctx.stroke();
  ctx.rotate(Math.PI / 2.2);
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, 0);
  ctx.lineTo(r * 0.45, 0);
  ctx.stroke();
  ctx.restore();
}

function buildAtlas(): PinAtlas {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S * 2;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!; // a fresh canvas always has a 2d context
  drawPin(ctx, 0, 0, S, '#5d5d5d', '#d1d0d0', '#ffffff');
  drawPin(ctx, S, 0, S, '#f8c023', '#222121', '#222121');
  const m = (x: number): PinAtlasEntry => ({ x, y: 0, width: S, height: S, anchorY: S, mask: false });
  return { url: canvas.toDataURL('image/png'), mapping: { airport: m(0), highlight: m(S) } };
}

export class AirportLayer {
  rows: Airport[];
  /** 1° cell key ("lat,lon") -> airports in it. */
  grid: Map<string, Airport[]>;
  byIcao: Map<string, Airport>;
  highlighted: Set<string>;
  onHover: AirportLayerOptions['onHover'];
  atlas: PinAtlas;
  /** Bumped whenever the drawn data or style changes (used as deck.gl update trigger). */
  version: number;

  constructor({ onHover }: AirportLayerOptions = {}) {
    this.rows = [];
    this.grid = new Map();
    this.byIcao = new Map();
    this.highlighted = new Set();
    this.onHover = onHover;
    this.atlas = buildAtlas();
    this.version = 0;
  }

  async load(): Promise<void> {
    try {
      const res = await fetch('/api/airports');
      const rows = (await res.json()) as AirportRow[];
      this.rows = rows.map((r): Airport => ({
        icao: r[0], iata: r[1], name: r[2], latitude: r[3], longitude: r[4],
        elevationFt: r[5], size: r[6], city: r[7], country: r[8],
      }));
      for (const a of this.rows) {
        if (a.icao) this.byIcao.set(a.icao, a);
        const key = `${Math.floor(a.latitude)},${Math.floor(a.longitude)}`;
        if (!this.grid.has(key)) this.grid.set(key, []);
        this.grid.get(key)!.push(a);
      }
      this.version++;
    } catch (err) {
      // fetch / JSON parsing reject with DOMException, TypeError or SyntaxError
      console.warn('Airports unavailable:', (err as Error).message);
    }
  }

  /** Nearest airport within maxM metres, or null. */
  nearest(lat: number, lon: number, maxM = 15_000): NearestAirport | null {
    let best: Airport | null = null;
    let bestD = maxM;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const a of this.grid.get(`${Math.floor(lat) + dy},${Math.floor(lon) + dx}`) ?? []) {
          const d = distance({ latitude: lat, longitude: lon }, a);
          if (d < bestD) {
            bestD = d;
            best = a;
          }
        }
      }
    }
    return best ? { ...best, distanceM: bestD } : null;
  }

  /** Highlights these airports (falsy entries ignored), e.g. the selected flight's origin / destination. */
  setHighlighted(icaos: ReadonlyArray<string | null | undefined>): void {
    const next = new Set(icaos.filter((icao): icao is string => Boolean(icao)));
    if ([...next].join() === [...this.highlighted].join()) return;
    this.highlighted = next;
    this.version++;
  }

  layers(googleZoom: number, visible = true): Layer[] {
    if (!this.rows.length) return [];
    if (!visible && !this.highlighted.size) return [];
    const z = googleZoom;
    const detail = z >= DETAIL_ZOOM;
    const hl = this.highlighted;
    // airports hidden in settings: still show the selected flight's origin / destination
    const data = this.rows.filter((a) => hl.has(a.icao) || (visible && z >= MIN_ZOOM_BY_SIZE[a.size]));
    // highlighted airports on top
    data.sort((a, b) => Number(hl.has(a.icao)) - Number(hl.has(b.icao)) || b.size - a.size);
    const iconSize = (a: Airport): number =>
      (detail ? SIZE_LARGE : SIZE_SMALL)[a.size] * (hl.has(a.icao) ? 1.5 : 1) * (z < 5 ? 0.8 : 1);
    const code = (a: Airport): string => a.iata || a.icao;
    const labelled = data.filter((a) => hl.has(a.icao) || z >= LABEL_ZOOM_BY_SIZE[a.size]);
    const light = theme.current.light;
    const key = `${this.version}:${Math.round(z * 4)}:${light}`;
    const textColor: RGBA = light ? [40, 40, 40, 255] : [230, 230, 230, 230];
    const hlColor: RGBA = light ? [150, 100, 0, 255] : [248, 192, 35, 255];
    const outline: RGBA = light ? [255, 255, 255, 230] : [20, 20, 20, 230];

    return [
      new IconLayer<Airport>({
        id: 'airports',
        data,
        iconAtlas: this.atlas.url,
        iconMapping: this.atlas.mapping,
        getIcon: (a) => (hl.has(a.icao) ? 'highlight' : 'airport'),
        getPosition: (a): LngLat => [a.longitude, a.latitude],
        getSize: iconSize,
        sizeUnits: 'pixels',
        pickable: true,
        parameters: { depthCompare: 'always' },
        onHover: ({ object }: PickingInfo<Airport>) => this.onHover?.(object ?? null),
        updateTriggers: { getIcon: key, getSize: key },
      }),
      new TextLayer<Airport>({
        id: 'airport-labels',
        data: labelled,
        getPosition: (a): LngLat => [a.longitude, a.latitude],
        getText: (a) => (z >= NAME_ZOOM || hl.has(a.icao) ? `${code(a)} · ${a.name}` : code(a)),
        getSize: (a) => (hl.has(a.icao) ? 13 : 11),
        getColor: (a) => (hl.has(a.icao) ? hlColor : textColor),
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'top',
        getPixelOffset: [0, 3],
        fontFamily: '"Open Sans", sans-serif',
        fontWeight: 600,
        characterSet: 'auto',
        fontSettings: { sdf: true },
        outlineWidth: 3,
        outlineColor: outline,
        maxWidth: 14,
        wordBreak: 'break-word',
        parameters: { depthCompare: 'always' },
        updateTriggers: { getText: key, getSize: key, getColor: key },
      }),
    ];
  }
}
