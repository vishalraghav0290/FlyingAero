import { IconLayer } from '@deck.gl/layers';
import type { IconLayerProps } from '@deck.gl/layers';
import type { Color } from '@deck.gl/core';
import { buildAircraftAtlas, SHAPE_SIZE, SHAPE_FRAMES, UNROTATED } from './sprites.ts';
import type { AircraftAtlas } from './sprites.ts';
import type { AircraftStore } from './store.ts';
import type { Aircraft, LngLat } from './types.ts';

const SIZE_SCALE = 2; // FR24 draws icons at half size with sizeScale 2
const ALPHA = { DEFAULT: 255, MISSING_DATA: 150, BACKGROUND: 100, SHADOW: 15 };
export const MAX_ANIMATED_ICONS = 2010; // FR24 desktop limit for rotor frame animation

/** The three aircraft layers in draw order: shadows, ground traffic, airborne traffic. */
export type AircraftLayerSet = [shadows: IconLayer<Aircraft>, ground: IconLayer<Aircraft>, air: IconLayer<Aircraft>];

/** FR24 icon size: clamp(8, 48, 16 * max(1, ln((zoom + 4) / 2))), zoom in Google scale. */
export function baseIconSize(googleZoom: number, aircraftSize = 16): number {
  const t = Math.max(1, Math.log((googleZoom + 4) * 0.5));
  return Math.floor(Math.min(48, Math.max(8, aircraftSize * t)));
}

export class AircraftLayers {
  store: AircraftStore;
  atlas: AircraftAtlas;
  /** Animation frame counter (rotor sprites). */
  frame: number;
  /** Bumped on every build; used as deck.gl update trigger. */
  version: number;
  /** Feed is failing: draw everything dimmed. */
  feedError: boolean;

  constructor(store: AircraftStore) {
    this.store = store;
    this.atlas = buildAircraftAtlas();
    this.frame = 0;
    this.version = 0;
    this.feedError = false;
  }

  /** Drawn icon height in CSS px for an aircraft at this zoom. */
  iconPixels(ac: Pick<Aircraft, 'shape'>, googleZoom: number): number {
    return Math.round(baseIconSize(googleZoom) / SIZE_SCALE) * SIZE_SCALE * (SHAPE_SIZE[ac.shape] ?? 1);
  }

  build(googleZoom: number): AircraftLayerSet {
    const store = this.store;
    const highlighted = store.highlightedIds();
    const iconSizePx = Math.round(baseIconSize(googleZoom) / SIZE_SCALE);
    const v = ++this.version;
    const { url, mapping } = this.atlas;

    const position = (ac: Aircraft): LngLat => {
      const p = store.renderPosition(ac);
      return [p.longitude, p.latitude];
    };
    const angle = (ac: Aircraft): number =>
      UNROTATED.has(ac.shape) ? 0 : -(store.renderPosition(ac).track ?? ac.track ?? 0);
    const size = (ac: Aircraft): number => iconSizePx * (SHAPE_SIZE[ac.shape] ?? 1);
    const frameOf = (ac: Aircraft): number => (SHAPE_FRAMES[ac.shape] ? this.frame % SHAPE_FRAMES[ac.shape] : 0);
    const icon = (ac: Aircraft): string => {
      const state = highlighted.has(ac.id) ? 'h' : ac.emergency ? 'e' : ac.shape === 'ground' ? 'g' : 'n';
      return `${ac.shape}_${frameOf(ac)}_${state}`;
    };
    const color = (ac: Aircraft): Color => {
      const a = highlighted.has(ac.id)
        ? ALPHA.DEFAULT
        : this.feedError
          ? ALPHA.BACKGROUND
          : ac.stale
            ? ALPHA.MISSING_DATA
            : ALPHA.DEFAULT;
      return [255, 255, 255, a];
    };

    const common = {
      iconAtlas: url,
      iconMapping: mapping,
      sizeUnits: 'pixels',
      sizeScale: SIZE_SCALE,
      billboard: true,
      alphaCutoff: 0.05,
      getPosition: position,
      getAngle: angle,
      getSize: size,
      parameters: { depthCompare: 'always' },
      updateTriggers: {
        getPosition: v,
        getAngle: v,
        getSize: iconSizePx,
        getIcon: v,
        getColor: v,
        getPixelOffset: [iconSizePx, v],
      },
    } satisfies Partial<IconLayerProps<Aircraft>>;

    // Shadow: same silhouette in black at 15/255, pushed down further the higher the aircraft.
    const shadows = new IconLayer<Aircraft>({
      ...common,
      id: 'aircraft-shadows',
      data: store.air,
      pickable: false,
      opacity: ALPHA.SHADOW / 255,
      getIcon: (ac) => `${ac.shape}_${frameOf(ac)}_s`,
      getColor: [255, 255, 255, 255],
      getPixelOffset: (ac) => [0, Math.min(7, 1 + ac.altitude / 6600) * (iconSizePx / 16)],
    });

    const ground = new IconLayer<Aircraft>({
      ...common,
      id: 'ground-icons',
      data: store.ground,
      pickable: true,
      getIcon: icon,
      getColor: color,
    });

    const air = new IconLayer<Aircraft>({
      ...common,
      id: 'aircraft-icons',
      data: store.air,
      pickable: true,
      getIcon: icon,
      getColor: color,
    });

    return [shadows, ground, air];
  }
}
