import { AnimationEngine } from './animation.js';
import { KT_TO_MS, M_TO_FT, MS_TO_FPM } from './geo.js';
import { settings } from './settings.js';

export const EMERGENCY_SQUAWKS = { '7500': 'Hijack', '7600': 'Radio failure', '7700': 'General emergency' };
const STALE_POSITION_S = 30; // ground traffic with no update for this long is dimmed

/** Converts a server row (OpenSky units) into an aircraft object (FR24 units: ft, kt, fpm). */
function toAircraft(row, idx, snapshotTime) {
  const get = (name) => row[idx[name]];
  const onGround = Boolean(get('onGround'));
  const altM = get('baroAlt') ?? get('geoAlt');
  const velocity = get('velocity');
  const vrate = get('vrate');
  const squawk = get('squawk') || '';
  const timePosition = get('timePosition');
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
    geoAltitude: get('geoAlt') == null ? null : Math.round(get('geoAlt') * M_TO_FT),
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

const byAltitude = (a, b) => a.altitude - b.altitude || (a.id < b.id ? -1 : 1);

export class AircraftStore {
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
  now() {
    return Date.now() - this.serverDelta;
  }

  apply(body) {
    this.serverDelta = Date.now() - body.now;
    this.engine.feedIntervalMs = body.intervalMs;
    this.snapshotTime = body.snapshotTime;
    this.lastDataAt = Date.now();
    const idx = Object.fromEntries(body.fields.map((f, i) => [f, i]));
    const now = this.now();
    const next = new Map();

    const maxEstimateS = settings.estimationMinutes * 60;
    for (const row of body.states) {
      const ac = toAircraft(row, idx, body.snapshotTime);
      if (ac.latitude == null || ac.longitude == null) continue;
      if (ac.estimatedAge > maxEstimateS) continue;
      ac.estimated = ac.estimatedAge > 0;
      ac.stale = ac.estimated || ac.positionAgeS > STALE_POSITION_S;
      next.set(ac.id, ac);
      this.engine.update(ac, now);
    }
    // Like FR24: aircraft missing from the latest response are removed straight away.
    const lost = [];
    for (const id of this.aircraft.keys()) {
      if (!next.has(id)) {
        this.engine.delete(id);
        lost.push(id);
      }
    }
    this.aircraft = next;
    this.lost = lost;

    // Ground and airborne layers, each drawn low-to-high so higher aircraft sit on top.
    const air = [];
    const ground = [];
    for (const ac of next.values()) (ac.onGround || ac.altitude <= 0 ? ground : air).push(ac);
    this.air = air.sort(byAltitude);
    this.ground = ground.sort(byAltitude);
  }

  /** Recompute every drawn position. */
  tick() {
    const now = this.now();
    for (const id of this.aircraft.keys()) this.engine.calculate(id, now);
  }

  renderPosition(ac) {
    return this.engine.render.get(ac.id) ?? ac;
  }

  highlightedIds() {
    const ids = new Set();
    if (this.selected && this.aircraft.has(this.selected)) ids.add(this.selected);
    if (this.hovered && this.aircraft.has(this.hovered)) ids.add(this.hovered);
    return ids;
  }
}
