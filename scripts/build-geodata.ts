/**
 * Builds static geodata in ./data:
 *   airports.json        OurAirports (public domain): large/medium airports + small ones with
 *                        scheduled service. Rows: [icao, iata, name, lat, lon, elevFt, size, city, country]
 *                        size: 0 = large, 1 = medium, 2 = small
 *   boundaries-in.json   International borders as officially recognised by India
 *                        (Natural Earth "India point of view"), for South Asia only.
 *
 * Usage: npm run setup:geodata
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../lib/server/config.ts';

/** Bounding box in degrees: west, south, east, north. */
interface Box {
  w: number;
  s: number;
  e: number;
  n: number;
}

/** [lon, lat] */
type Position = number[];

/** Subset of the Natural Earth GeoJSON that this script reads. */
interface NEFeature<G> {
  properties: Record<string, string | null | undefined>;
  geometry: G;
}
interface NECollection<G> {
  features: NEFeature<G>[];
}
type CountryGeometry =
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };
type LineGeometry =
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'MultiLineString'; coordinates: Position[][] };

interface OutFeature {
  type: 'Feature';
  properties: { kind: string };
  geometry: { type: 'LineString'; coordinates: Position[] };
}

/** [icao, iata, name, lat, lon, elevFt, size, city, country] */
type AirportRow = [string, string, string, number, number, number, number, string, string];
/** [ident, name, type, freqKhz, lat, lon, elevFt, country, dmeChannel, usage, power, airportIcao] */
type NavaidRow = [string, string, string, number, number, number, number, string, string, string, string, string];

const DATA_DIR = path.join(ROOT_DIR, 'data');
const AIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';

// Region where the basemap's disputed borders are replaced (must match public/js/boundaries.js)
export const SOUTH_ASIA: Box = { w: 66, s: 26, e: 98, n: 38 };
// Where India's claimed outline differs from the de-facto lines in the basemap
const INDIA_CLAIM_BOXES: Box[] = [
  { w: 72.4, s: 30.3, e: 81.1, n: 37.3 }, // Jammu & Kashmir, Ladakh, Aksai Chin, Himachal/Uttarakhand LAC
  { w: 91.5, s: 26.9, e: 97.6, n: 29.6 }, // Arunachal Pradesh
];

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function buildAirports() {
  const res = await fetch(AIRPORTS_URL);
  if (!res.ok) throw new Error(`Airports download failed (${res.status})`);
  const lines = (await res.text()).split(/\r?\n/);
  const head = parseCsvLine(lines[0]);
  const c = Object.fromEntries(head.map((h, i) => [h, i]));
  const SIZE: Record<string, number | undefined> = { large_airport: 0, medium_airport: 1, small_airport: 2 };
  const rows: AirportRow[] = [];
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const f = parseCsvLine(line);
    const size = SIZE[f[c.type]];
    if (size === undefined) continue;
    const iata = (f[c.iata_code] || '').trim().toUpperCase();
    const icao = (f[c.icao_code] || f[c.gps_code] || f[c.ident] || '').trim().toUpperCase();
    if (size === 2 && !(f[c.scheduled_service] === 'yes' && iata)) continue;
    if (size === 1 && !iata && !/^[A-Z]{4}$/.test(icao)) continue;
    const lat = Number(f[c.latitude_deg]);
    const lon = Number(f[c.longitude_deg]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    rows.push([
      icao, iata, f[c.name].slice(0, 70), Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4,
      Number(f[c.elevation_ft]) || 0, size, (f[c.municipality] || '').slice(0, 40), f[c.iso_country] || '',
    ]);
  }
  rows.sort((a, b) => a[6] - b[6]);
  writeFileSync(path.join(DATA_DIR, 'airports.json'), JSON.stringify(rows));
  const n = [0, 1, 2].map((s) => rows.filter((r) => r[6] === s).length);
  console.log(`Airports: ${rows.length.toLocaleString()} (large ${n[0]}, medium ${n[1]}, small scheduled ${n[2]})`);
}

const inBox = ([lon, lat]: Position, b: Box): boolean => lon >= b.w && lon <= b.e && lat >= b.s && lat <= b.n;

/** Split a ring/line into the runs of consecutive points inside the box (plus one point either side). */
function clipToBox(coords: Position[], box: Box): Position[][] {
  const runs: Position[][] = [];
  let run: Position[] | null = null;
  coords.forEach((p, i) => {
    if (inBox(p, box)) {
      if (!run) {
        run = i > 0 ? [coords[i - 1]] : [];
        runs.push(run);
      }
      run.push(p);
    } else if (run) {
      run.push(p);
      run = null;
    }
  });
  return runs.filter((r) => r.length > 1);
}

const intersects = (coords: Position[], b: Box): boolean => coords.some((p) => inBox(p, b));
const round = (coords: Position[]): Position[] =>
  coords.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);

async function buildBoundaries() {
  const [countries, lines] = (await Promise.all(
    ['ne_10m_admin_0_countries_ind.geojson', 'ne_10m_admin_0_boundary_lines_land.geojson'].map(async (f): Promise<unknown> => {
      const r = await fetch(NE + f);
      if (!r.ok) throw new Error(`${f} download failed (${r.status})`);
      return r.json();
    }),
  )) as [NECollection<CountryGeometry>, NECollection<LineGeometry>];
  const features: OutFeature[] = [];

  // 1) India's outline as India officially depicts it, where it differs from the basemap
  const india = countries.features.find((f) => f.properties.ADM0_A3 === 'IND')!;
  const polys = india.geometry.type === 'MultiPolygon' ? india.geometry.coordinates : [india.geometry.coordinates];
  for (const poly of polys) {
    for (const box of INDIA_CLAIM_BOXES) {
      for (const run of clipToBox(poly[0], box)) {
        features.push({ type: 'Feature', properties: { kind: 'india' }, geometry: { type: 'LineString', coordinates: round(run) } });
      }
    }
  }

  // 2) Other disputed lines in the region, as India recognises them (drop "Unrecognized")
  for (const f of lines.features) {
    const p = f.properties;
    if (!/Disputed|Indefinite|Line of control|Indeterminant/i.test(p.FEATURECLA || '')) continue;
    if (p.FCLASS_IN === 'Unrecognized' || p.FCLASS_IN === 'Admin-1 boundary') continue;
    const parts = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const part of parts) {
      if (!intersects(part, SOUTH_ASIA)) continue;
      features.push({ type: 'Feature', properties: { kind: 'disputed-in' }, geometry: { type: 'LineString', coordinates: round(part) } });
    }
  }

  // 3) World land borders at 1:50m for low zooms (basemap tiles there are too generalised to
  //    filter), again as recognised by India.
  const world = (await (await fetch(NE + 'ne_50m_admin_0_boundary_lines_land.geojson')).json()) as NECollection<LineGeometry>;
  for (const f of world.features) {
    const p = f.properties;
    if (p.FCLASS_IN === 'Unrecognized' || p.FCLASS_IN === 'Admin-1 boundary') continue;
    const parts = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const part of parts) {
      features.push({ type: 'Feature', properties: { kind: 'world' }, geometry: { type: 'LineString', coordinates: round(part) } });
    }
  }

  const fc = { type: 'FeatureCollection', features, metadata: { source: 'Natural Earth (10m / 50m), India point of view', region: SOUTH_ASIA } };
  writeFileSync(path.join(DATA_DIR, 'boundaries-in.json'), JSON.stringify(fc));
  console.log(`Boundaries (India view): ${features.length} line features`);
}

/**
 * navaids.json (OurAirports, public domain). Rows:
 * [ident, name, type, freqKhz, lat, lon, elevFt, country, dmeChannel, usage, power, airportIcao]
 * type: VOR, VOR-DME, VORTAC, DME, TACAN, NDB, NDB-DME
 */
async function buildNavaids() {
  const res = await fetch('https://davidmegginson.github.io/ourairports-data/navaids.csv');
  if (!res.ok) throw new Error(`Navaids download failed (${res.status})`);
  const lines = (await res.text()).split(/\r?\n/);
  const c = Object.fromEntries(parseCsvLine(lines[0]).map((h, i) => [h, i]));
  const rows: NavaidRow[] = [];
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const f = parseCsvLine(line);
    const lat = Number(f[c.latitude_deg]);
    const lon = Number(f[c.longitude_deg]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !f[c.ident]) continue;
    rows.push([
      f[c.ident].trim().toUpperCase(), f[c.name].slice(0, 50), f[c.type], Number(f[c.frequency_khz]) || 0,
      Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4, Number(f[c.elevation_ft]) || 0, f[c.iso_country] || '',
      f[c.dme_channel] || '', f[c.usageType] || '', f[c.power] || '', f[c.associated_airport] || '',
    ]);
  }
  writeFileSync(path.join(DATA_DIR, 'navaids.json'), JSON.stringify(rows));
  const types: Record<string, number> = {};
  rows.forEach((r) => (types[r[2]] = (types[r[2]] || 0) + 1));
  console.log(`Navaids: ${rows.length.toLocaleString()} ${JSON.stringify(types)}`);
}

mkdirSync(DATA_DIR, { recursive: true });
await buildAirports();
await buildBoundaries();
await buildNavaids();
