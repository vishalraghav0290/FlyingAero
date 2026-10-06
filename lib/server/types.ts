/**
 * Shared server-side types: upstream API payloads (OpenSky, adsb.lol / adsb.fi, adsbdb,
 * airport-data.com) and the shapes the feed passes around internally.
 */

/** Bounding box in degrees. */
export interface BBox {
  lamin: number;
  lamax: number;
  lomin: number;
  lomax: number;
}

// ---------- OpenSky ----------

/**
 * OpenSky state vector (extended=1), plus [18] ICAO type code and [19] registration that the
 * ADS-B aggregators provide and OpenSky doesn't.
 */
export type StateVector = [
  icao24: string,
  callsign: string | null,
  country: string,
  timePosition: number | null,
  lastContact: number,
  lon: number | null,
  lat: number | null,
  baroAlt: number | null,
  onGround: boolean,
  velocity: number | null,
  track: number | null,
  vrate: number | null,
  sensors: number[] | null,
  geoAlt: number | null,
  squawk: string | null,
  spi: boolean,
  posSource: number,
  category?: number,
  typecode?: string,
  reg?: string,
];

/** State vector built from an ADS-B aggregator record (always has a position and time). */
export type AdsbState = [
  icao24: string,
  callsign: string,
  country: string,
  timePosition: number,
  lastContact: number,
  lon: number,
  lat: number,
  baroAlt: number | null,
  onGround: boolean,
  velocity: number | null,
  track: number | null,
  vrate: number | null,
  sensors: null,
  geoAlt: number | null,
  squawk: string | null,
  spi: boolean,
  posSource: number,
  category: number,
  typecode: string,
  reg: string,
];

/** OpenSky remaining credits per daily bucket. */
export interface Credits {
  states: number | null;
  tracks: number | null;
  flights: number | null;
}
export type CreditBucket = keyof Credits;

/** ADS-B grid coverage for a states response. */
export interface Coverage {
  cells: number;
  loaded: number;
  clipped: boolean;
  worldTypes: number;
}

/** Common shape of a states answer (OpenSky /states/all or the ADS-B client). */
export interface StatesResult {
  time: number;
  states: StateVector[] | null;
  coverage?: Coverage;
  sources?: string[];
}

/** Track waypoint: [time, lat, lon, baroAltM, trueTrack, onGround] (OpenSky /tracks format). */
export type TrackPoint = [
  time: number,
  lat: number | null,
  lon: number | null,
  baroAlt: number | null,
  track: number | null,
  onGround: boolean,
];

/** OpenSky /tracks/all response (also produced from adsb.lol traces). */
export interface Track {
  icao24: string;
  startTime: number;
  endTime: number;
  callsign?: string | null;
  path: TrackPoint[];
}

/** OpenSky OAuth2 token response. */
export interface OpenSkyTokenResponse {
  access_token: string;
  expires_in?: number;
}

// ---------- adsb.lol / adsb.fi ----------

/** One aircraft record (`ac` array) from adsb.lol / adsb.fi (readsb JSON format). */
export interface AdsbAircraft {
  hex?: string;
  type?: string;
  flight?: string;
  r?: string;
  t?: string;
  alt_baro?: number | 'ground';
  alt_geom?: number;
  gs?: number;
  track?: number;
  true_heading?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  spi?: number | boolean;
  category?: string;
  lat?: number;
  lon?: number;
  seen?: number;
  seen_pos?: number;
}

/** adsb.lol / adsb.fi response. adsb.lol uses `ac`, adsb.fi v3 `aircraft`. `now` is in ms. */
export interface AdsbResponse {
  now?: number;
  ac?: AdsbAircraft[];
  aircraft?: AdsbAircraft[];
}

/** Trace point: [secondsAfterTimestamp, lat, lon, alt ft | "ground", gs, track, flags, ...] */
export type AdsbTracePoint = [
  dt: number,
  lat: number,
  lon: number,
  alt: number | 'ground' | null,
  gs: number | null,
  track: number | null,
  flags: number,
  ...rest: unknown[],
];

/** adsb.lol globe trace file (trace_full_<hex>.json). */
export interface AdsbTrace {
  icao?: string;
  timestamp: number;
  trace?: AdsbTracePoint[];
}

// ---------- feed ----------

/** Row sent to the browser, in CLIENT_FIELDS order. */
export type ClientRow = [
  icao24: string,
  callsign: string,
  country: string,
  timePosition: number,
  lastContact: number,
  lon: number,
  lat: number,
  baroAlt: number | null,
  onGround: boolean,
  velocity: number | null,
  track: number | null,
  vrate: number | null,
  geoAlt: number | null,
  squawk: string | null,
  spi: boolean,
  posSource: number,
  category: number,
  typecode: string,
  reg: string,
  operatorIcao: string,
  shape: string,
  estimatedAge: number,
];

/** Recorded live position: [t, lat, lon, altM, track, onGround, velocity] */
export type HistoryPoint = [
  t: number,
  lat: number | null,
  lon: number | null,
  alt: number | null,
  track: number | null,
  onGround: boolean,
  velocity: number | null,
];

/** Trail row: [t, lat, lon, altM, velocityMs, track, onGround, live] */
export type TrailRow = [
  t: number,
  lat: number | null,
  lon: number | null,
  alt: number | null,
  velocity: number | null,
  track: number | null,
  onGround: boolean,
  live: 0 | 1,
];

// ---------- airports / aircraft ----------

/** [icao, iata, name, lat, lon, elevFt, size (0 large, 1 medium, 2 small), city, country] */
export type AirportRow = [
  icao: string,
  iata: string,
  name: string,
  lat: number,
  lon: number,
  elevFt: number | null,
  size: number,
  city: string,
  country: string,
];

export interface Airport {
  icao: string;
  iata: string;
  name: string;
  lat: number;
  lon: number;
  elevationFt: number | null;
  size: number;
  city: string;
  country: string;
}

/** ICAO Doc 8643 entry from data/aircraft-types.json. */
export interface AircraftTypeInfo {
  name?: string;
  mfr?: string;
  /** e.g. "L2J" = landplane, 2 jets */
  desc?: string;
  /** wake turbulence category (L, M, H, J) */
  wtc?: string;
}

// ---------- routes (adsbdb.com) ----------

export interface AdsbdbAirport {
  icao_code?: string;
  iata_code?: string;
  name?: string;
  municipality?: string;
  country_iso_name?: string;
  country_name?: string;
  latitude?: number;
  longitude?: number;
  elevation?: number;
}

export interface AdsbdbFlightroute {
  callsign?: string;
  airline?: { name?: string; icao?: string; iata?: string } | null;
  origin?: AdsbdbAirport | null;
  destination?: AdsbdbAirport | null;
  midpoint?: AdsbdbAirport | null;
}

/** adsbdb /v0/callsign response. `response` is a message string for unknown callsigns. */
export interface AdsbdbCallsignResponse {
  response?: { flightroute?: AdsbdbFlightroute | null } | string | null;
}

export interface RouteAirport {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

export interface FlightRoute {
  callsign: string;
  airline: string;
  airlineIcao: string;
  origin: RouteAirport | null;
  destination: RouteAirport | null;
  stop: RouteAirport | null;
  source: 'adsbdb';
}

// ---------- photos (airport-data.com) ----------

export interface AirportDataThumb {
  image: string;
  link: string;
  photographer?: string;
}

/** airport-data.com ac_thumb.json response. */
export interface AirportDataResponse {
  status?: number;
  count?: number;
  data?: AirportDataThumb[];
}

export interface Photo {
  src: string;
  link: string;
  photographer: string;
  source: string;
}

// ---------- errors ----------

/** Error carrying an upstream / HTTP status (and optionally a retry hint). */
export interface HttpError extends Error {
  status?: number;
  retryAfterSec?: number | null;
}

/** `err.message` for Errors, the stringified value otherwise. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** `err.status` when the thrown value carries a numeric status. */
export function errorStatus(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number') return err.status;
  return undefined;
}

/** `err.retryAfterSec` when the thrown value carries one. */
export function errorRetryAfter(err: unknown): number | null | undefined {
  if (typeof err === 'object' && err !== null && 'retryAfterSec' in err) {
    const v = err.retryAfterSec;
    return typeof v === 'number' || v === null ? v : undefined;
  }
  return undefined;
}
