import 'server-only';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { loadConfig, ROOT_DIR } from './config.js';
import { OpenSkyClient } from './opensky.js';
import { SourceClient } from './source.js';
import { AircraftDb } from './aircraftDb.js';
import { FeedService } from './feed.js';
import { Airports } from './airports.js';
import { RouteService } from './routes.js';

/**
 * One shared set of services per server process.
 *
 * Next.js may load route modules separately and re-evaluates them on every edit in dev.
 * Keeping the instances on globalThis means all API routes share one OpenSky token, one
 * feed cache, one position history and one copy of the 590k-aircraft database. Without it
 * every route (and every hot reload) would spend its own OpenSky credits.
 */
const KEY = Symbol.for('skyradar.services');

function create() {
  const config = loadConfig();
  // OpenSky with automatic ADS-B fallback (DATA_SOURCE=opensky|adsb|auto)
  const client = new SourceClient({ opensky: new OpenSkyClient(config.opensky), mode: config.feed.source });
  console.log(`[skyradar] Data source mode: ${client.mode}`);
  const db = new AircraftDb();
  const t0 = Date.now();
  if (db.load()) console.log(`[skyradar] Aircraft database: ${db.lines.size.toLocaleString()} aircraft (${Date.now() - t0} ms)`);
  else console.warn('[skyradar] Aircraft database missing: run `npm run setup:aircraft-db` for type-specific icons.');

  const airports = new Airports();
  if (airports.load()) console.log(`[skyradar] Airports: ${airports.rows.length.toLocaleString()}`);
  else console.warn('[skyradar] Airports missing: run `npm run setup:geodata`.');
  if (!client.authenticated && client.mode !== 'adsb') {
    console.warn('[skyradar] OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET not set: anonymous OpenSky access (400 credits/day).');
  }

  return {
    config,
    client,
    db,
    airports,
    feed: new FeedService({ client, db, config }),
    routes: new RouteService(airports),
    trackCache: new Map(), // icao24 -> { at, path }
    photoCache: new Map(), // icao24 -> { at, photos }
    fileCache: new Map(), // data file name -> string
    gzipCache: new Map(), // data file name -> gzipped Buffer
  };
}

export function services() {
  globalThis[KEY] ??= create();
  return globalThis[KEY];
}

/** Static data file from ./data, read once. Returns null when it hasn't been built yet. */
export function dataFile(name) {
  const s = services();
  if (s.fileCache.has(name)) return s.fileCache.get(name);
  const file = path.join(ROOT_DIR, 'data', name);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  s.fileCache.set(name, text);
  return text;
}

// ---------- helpers shared by the route handlers ----------

export const ICAO24 = /^[0-9a-f]{6}$/;

// Next.js compresses pages but not route handler responses, and the feed / airport / navaid
// payloads are large (0.1-1 MB of JSON), so gzip them here when the client accepts it.
const MIN_GZIP_BYTES = 1024;
const acceptsGzip = (request) => /\bgzip\b/.test(request?.headers.get('accept-encoding') ?? '');

function respond(request, text, { status = 200, headers = {}, gzipped = null } = {}) {
  const base = { 'Content-Type': 'application/json; charset=utf-8', Vary: 'Accept-Encoding', ...headers };
  if (acceptsGzip(request) && text.length >= MIN_GZIP_BYTES) {
    return new Response(gzipped ?? gzipSync(text, { level: 6 }), { status, headers: { ...base, 'Content-Encoding': 'gzip' } });
  }
  return new Response(text, { status, headers: base });
}

/** JSON response; pass the request to allow gzip. */
export function json(body, { status = 200, cache = 'no-store', headers = {}, request = null } = {}) {
  return respond(request, JSON.stringify(body), { status, headers: { 'Cache-Control': cache, ...headers } });
}

/** Pre-serialised JSON (static data files). The gzipped copy is cached per key. */
export function rawJson(request, key, text, cache = 'public, max-age=86400') {
  const s = services();
  let gz = s.gzipCache.get(key);
  if (acceptsGzip(request) && !gz) s.gzipCache.set(key, (gz = gzipSync(text, { level: 9 })));
  return respond(request, text, { headers: { 'Cache-Control': cache }, gzipped: gz });
}

/** Bounding box from query params. null = whole world; throws (status 400) on bad input. */
export function parseBbox(searchParams) {
  const keys = ['lamin', 'lomin', 'lamax', 'lomax'];
  if (keys.every((k) => !searchParams.has(k))) return null;
  const v = Object.fromEntries(keys.map((k) => [k, Number(searchParams.get(k))]));
  const ok =
    keys.every((k) => Number.isFinite(v[k])) &&
    v.lamin >= -90 && v.lamax <= 90 && v.lamin < v.lamax &&
    v.lomin >= -180 && v.lomax <= 180 && v.lomin < v.lomax;
  if (!ok) {
    const err = new Error('Invalid bounding box');
    err.status = 400;
    throw err;
  }
  return v;
}

const TRACK_TTL_MS = 5 * 60_000;

/** OpenSky flight track (4 credits from the separate /tracks pool), cached per aircraft. */
export async function openSkyTrack(icao24) {
  const { client, trackCache } = services();
  const hit = trackCache.get(icao24);
  if (hit && Date.now() - hit.at < TRACK_TTL_MS) return hit.path;
  try {
    const t = await client.getTrack(icao24, 0);
    const p = Array.isArray(t?.path) ? t.path : [];
    trackCache.set(icao24, { at: Date.now(), path: p });
    if (trackCache.size > 200) trackCache.delete(trackCache.keys().next().value);
    return p;
  } catch (err) {
    console.warn(`[skyradar] Track ${icao24}: ${err.message}`);
    return hit?.path ?? [];
  }
}

/**
 * Trail = OpenSky track waypoints (since take-off; compressed, so seconds to minutes apart)
 * merged with every position this server has seen.
 * Rows: [t, lat, lon, altM, velocityMs, track, onGround, live]
 * live: 0 = OpenSky track waypoint, 1 = live position we received.
 */
export function mergeTrail(track, history) {
  const rows = [
    ...track.map(([t, lat, lon, alt, trk, gnd]) => [t, lat, lon, gnd ? 0 : alt, null, trk, Boolean(gnd), 0]),
    ...history.map(([t, lat, lon, alt, trk, gnd, vel]) => [t, lat, lon, alt, vel, trk, gnd, 1]),
  ].filter((r) => r[1] != null && r[2] != null);
  rows.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of rows) {
    const prev = out.at(-1);
    if (prev && r[0] - prev[0] < 2) {
      if (r[4] != null) out[out.length - 1] = r; // prefer the point that has a speed
      continue;
    }
    out.push(r);
  }
  return out;
}
