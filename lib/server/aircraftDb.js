/**
 * In-memory lookup of OpenSky aircraft metadata (built by `npm run setup:aircraft-db`).
 * Lines are kept as raw TSV strings and split on demand to keep memory reasonable.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './config.js';
import { pickShape } from './shapes.js';

const DB_FILE = path.join(ROOT_DIR, 'data', 'aircraft-db.tsv');
const TYPES_FILE = path.join(ROOT_DIR, 'data', 'aircraft-types.json');

export class AircraftDb {
  constructor() {
    this.lines = new Map();
    this.types = {};
    this.loaded = false;
  }

  load() {
    if (existsSync(TYPES_FILE)) this.types = JSON.parse(readFileSync(TYPES_FILE, 'utf8'));
    if (!existsSync(DB_FILE)) return false;
    for (const line of readFileSync(DB_FILE, 'utf8').split('\n')) {
      if (line.length > 7) this.lines.set(line.slice(0, 6), line);
    }
    this.loaded = true;
    return true;
  }

  /** Minimal fields needed on the map, for every aircraft in the feed. */
  basic(icao24) {
    const line = this.lines.get(icao24);
    if (!line) return null;
    const f = line.split('\t');
    return { typecode: f[1], reg: f[2], operatorIcao: f[3] };
  }

  /** Full record for the aircraft panel. */
  details(icao24) {
    const line = this.lines.get(icao24);
    if (!line) return null;
    const [, typecode, reg, operatorIcao, operator, model, manufacturer, icaoClass, built] =
      line.split('\t');
    const type = this.types[typecode];
    return {
      typecode,
      reg,
      operatorIcao,
      operator,
      model: model || type?.name || '',
      manufacturer: manufacturer || type?.mfr || '',
      icaoClass: icaoClass || type?.desc || '',
      wtc: type?.wtc || '',
      built,
    };
  }

  shapeFor(typecode, category) {
    return pickShape(typecode, typecode ? this.types[typecode] : null, category);
  }
}
