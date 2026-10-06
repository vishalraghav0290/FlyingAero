import { AnimationEngine } from './animation.ts';
import { KT_TO_MS, M_TO_FT, MS_TO_FPM } from './geo.ts';
import { settings } from './settings.ts';
import type { Aircraft, DrawnPosition, StateField, StateFieldValues, StateRow, StatesResponse } from './types.ts';

/** Emergency squawk code -> meaning. */
export const EMERGENCY_SQUAWKS: Readonly<Record<string, string>> = { '7500': 'Hijack', '7600': 'Radio failure', '7700': 'General emergency' };
const STALE_POSITION_S = 30; // ground traffic with no update for this long is dimmed

/** Column name -> index in a state row. */
type FieldIndex = Record<string, number>;

/** Converts a server row (OpenSky units) into an aircraft object (FR24 units: ft, kt, fpm). */
function toAircraft(row: StateRow, idx: FieldIndex, snapshotTime: number): Omit<Aircraft, 'estimated' | 'stale'> {
  // the server sends each column with the type given by StateFieldValues
  const get = <K extends StateField>(name: K) => row[idx[name]] as StateFieldValues[K];
  const onGround = Boolean(get('onGround'));
  const altM = get('baroAlt') ?? get('geoAlt');
  const velocity = get('velocity');
  const vrate = get('vrate');
  const squawk = get('squawk') || '';
  const timePosition = get('timePosition');
  const geoAlt = get('geoAlt');
  return {
    id: get('icao24'),
    callsign: get('callsign') || '',
    country: get('country') || '',
    latitude: get('lat'),
    longitude: get('lon'),
    timestamp: timePosition * 1000,
    positionAgeS: snapshotTime - timePosition,
    onGround,
    altitude: onGround || altM == null ? 0 : Math.max(0, Math.round(altM * M_TO_FT)),
    geoAltitude: geoAlt == null ? null : Math.round(geoAlt * M_TO_FT),
    speed: velocity == null ? null : velocity / KT_TO_MS,
    track: get('track'),
    vspeed: vrate == null ? null : Math.round(vrate * MS_TO_FPM),
    squawk,
    emergency: Boolean(EMERGENCY_SQUAWKS[squawk]),
    spi: Boolean(get('spi')),
    positionSource: get('posSource'),
    category: get('category'),
    typecode: get('typecode') || '',
    reg: get('reg') || '',
    operatorIcao: get('operatorIcao') || '',
    shape: get('shape') || 'b736',
    // > 0 when the server moved it along its last track because OpenSky has no fresh position
    estimatedAge: get('estimatedAge') || 0,
    lastContact: get('lastContact'),
  };
}

const byAltitude = (a: Aircraft, b: Aircraft): number => a.altitude - b.altitude || (a.id < b.id ? -1 : 1);

export class AircraftStore {
  engine: AnimationEngine;
  /** Aircraft in the latest response, by id. */
  aircraft: Map<string, Aircraft>;
  /** Airborne aircraft, low to high. */
  air: Aircraft[];
  /** Ground traffic, low to high. */
  ground: Aircraft[];
  /** Local clock minus server clock, ms. */
  serverDelta: number;
  hovered: string | null;
  selected: string | null;
  /** Unix seconds of the latest snapshot. */
  snapshotTime: number;
  /** Local ms of the latest response (0 before the first). */
  lastDataAt: number;
  /** Ids that disappeared in the latest response (set by `apply`). */
  declare lost?: string[];

  constructor() {
    this.engine = new AnimationEngine();
    this.aircraft = new Map();
    this.air = [];
    this.ground = [];
    this.serverDelta = 0;
    this.hovered = null;
    this.selected = null;
    this.snapshotTime = 0;
    this.lastDataAt = 0;
  }

  /** Server-aligned clock, ms. */
  now(): number {
    return Date.now() - this.serverDelta;
  }

  apply(body: StatesResponse): void {
    this.serverDelta = Date.now() - body.now;
    this.engine.feedIntervalMs = body.intervalMs;
    this.snapshotTime = body.snapshotTime;
    this.lastDataAt = Date.now();
    const idx: FieldIndex = Object.fromEntries(body.fields.map((f, i) => [f, i]));
    const now = this.now();
    const next = new Map<string, Aircraft>();

    const maxEstimateS = settings.estimationMinutes * 60;
    for (const row of body.states) {
      // estimated / stale are filled in right below
      const ac = toAircraft(row, idx, body.snapshotTime) as Aircraft;
      if (ac.latitude == null || ac.longitude == null) continue;
      if (ac.estimatedAge > maxEstimateS) continue;
      ac.estimated = ac.estimatedAge > 0;
      ac.stale = ac.estimated || ac.positionAgeS > STALE_POSITION_S;
      next.set(ac.id, ac);
      this.engine.update(ac, now);
    }
    // Like FR24: aircraft missing from the latest response are removed straight away.
    const lost: string[] = [];
    for (const id of this.aircraft.keys()) {
      if (!next.has(id)) {
        this.engine.delete(id);
        lost.push(id);
      }
    }
    this.aircraft = next;
    this.lost = lost;

    // Ground and airborne layers, each drawn low-to-high so higher aircraft sit on top.
    const air: Aircraft[] = [];
    const ground: Aircraft[] = [];
    for (const ac of next.values()) (ac.onGround || ac.altitude <= 0 ? ground : air).push(ac);
    this.air = air.sort(byAltitude);
    this.ground = ground.sort(byAltitude);
  }

  /** Recompute every drawn position. */
  tick(): void {
    const now = this.now();
    for (const id of this.aircraft.keys()) this.engine.calculate(id, now);
  }

  renderPosition(ac: Aircraft): DrawnPosition {
    return this.engine.render.get(ac.id) ?? ac;
  }

  highlightedIds(): Set<string> {
    const ids = new Set<string>();
    if (this.selected && this.aircraft.has(this.selected)) ids.add(this.selected);
    if (this.hovered && this.aircraft.has(this.hovered)) ids.add(this.hovered);
    return ids;
  }
}
