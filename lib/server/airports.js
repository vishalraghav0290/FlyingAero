import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './config.js';

const FILE = path.join(ROOT_DIR, 'data', 'airports.json');
const R = 6371e3;
const rad = (d) => (d * Math.PI) / 180;

export function distanceM(lat1, lon1, lat2, lon2) {
  const h =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rows: [icao, iata, name, lat, lon, elevFt, size (0 large, 1 medium, 2 small), city, country] */
export class Airports {
  constructor() {
    this.rows = [];
    this.byIcao = new Map();
    this.byIata = new Map();
    this.grid = new Map(); // "lat,lon" 1° cell -> rows
    this.raw = '[]';
  }

  load() {
    if (!existsSync(FILE)) return false;
    this.raw = readFileSync(FILE, 'utf8');
    this.rows = JSON.parse(this.raw);
    for (const r of this.rows) {
      if (r[0]) this.byIcao.set(r[0], r);
      if (r[1] && (!this.byIata.has(r[1]) || this.byIata.get(r[1])[6] > r[6])) this.byIata.set(r[1], r);
      const key = `${Math.floor(r[3])},${Math.floor(r[4])}`;
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(r);
    }
    return true;
  }

  static toObject(r) {
    if (!r) return null;
    return { icao: r[0], iata: r[1], name: r[2], lat: r[3], lon: r[4], elevationFt: r[5], size: r[6], city: r[7], country: r[8] };
  }

  /** Nearest airport within maxM metres (optionally only size <= maxSize). */
  nearest(lat, lon, maxM = 15_000, maxSize = 2) {
    let best = null;
    let bestD = maxM;
    const la = Math.floor(lat);
    const lo = Math.floor(lon);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const r of this.grid.get(`${la + dy},${lo + dx}`) ?? []) {
          if (r[6] > maxSize) continue;
          const d = distanceM(lat, lon, r[3], r[4]);
          if (d < bestD) {
            bestD = d;
            best = r;
          }
        }
      }
    }
    return best ? { ...Airports.toObject(best), distanceM: Math.round(bestD) } : null;
  }
}
