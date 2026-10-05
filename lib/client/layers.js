import { IconLayer } from '@deck.gl/layers';
import { buildAircraftAtlas, SHAPE_SIZE, SHAPE_FRAMES, UNROTATED } from './sprites.js';

const SIZE_SCALE = 2; // FR24 draws icons at half size with sizeScale 2
const ALPHA = { DEFAULT: 255, MISSING_DATA: 150, BACKGROUND: 100, SHADOW: 15 };
export const MAX_ANIMATED_ICONS = 2010; // FR24 desktop limit for rotor frame animation

/** FR24 icon size: clamp(8, 48, 16 * max(1, ln((zoom + 4) / 2))), zoom in Google scale. */
export function baseIconSize(googleZoom, aircraftSize = 16) {
  const t = Math.max(1, Math.log((googleZoom + 4) * 0.5));
  return Math.floor(Math.min(48, Math.max(8, aircraftSize * t)));
}

export class AircraftLayers {
  constructor(store) {
    this.store = store;
    this.atlas = buildAircraftAtlas();
    this.frame = 0;
    this.version = 0;
    this.feedError = false;
  }

  /** Drawn icon height in CSS px for an aircraft at this zoom. */
  iconPixels(ac, googleZoom) {
    return Math.round(baseIconSize(googleZoom) / SIZE_SCALE) * SIZE_SCALE * (SHAPE_SIZE[ac.shape] ?? 1);
  }

  build(googleZoom) {
    const store = this.store;
    const highlighted = store.highlightedIds();
    const iconSizePx = Math.round(baseIconSize(googleZoom) / SIZE_SCALE);
    const v = ++this.version;
    const { url, mapping } = this.atlas;

    const position = (ac) => {
      const p = store.renderPosition(ac);
      return [p.longitude, p.latitude];
    };
    const angle = (ac) => (UNROTATED.has(ac.shape) ? 0 : -(store.renderPosition(ac).track ?? ac.track ?? 0));
    const size = (ac) => iconSizePx * (SHAPE_SIZE[ac.shape] ?? 1);
    const frameOf = (ac) => (SHAPE_FRAMES[ac.shape] ? this.frame % SHAPE_FRAMES[ac.shape] : 0);
    const icon = (ac) => {
      const state = highlighted.has(ac.id) ? 'h' : ac.emergency ? 'e' : ac.shape === 'ground' ? 'g' : 'n';
      return `${ac.shape}_${frameOf(ac)}_${state}`;
    };
    const color = (ac) => {
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
    };

    // Shadow: same silhouette in black at 15/255, pushed down further the higher the aircraft.
    const shadows = new IconLayer({
      ...common,
      id: 'aircraft-shadows',
      data: store.air,
      pickable: false,
      opacity: ALPHA.SHADOW / 255,
      getIcon: (ac) => `${ac.shape}_${frameOf(ac)}_s`,
      getColor: [255, 255, 255, 255],
      getPixelOffset: (ac) => [0, Math.min(7, 1 + ac.altitude / 6600) * (iconSizePx / 16)],
    });

    const ground = new IconLayer({
      ...common,
      id: 'ground-icons',
      data: store.ground,
      pickable: true,
      getIcon: icon,
      getColor: color,
    });

    const air = new IconLayer({
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
