/**
 * Works out origin, destination, progress and flight phase for the selected aircraft.
 *
 * Sources, best first:
 *  - departedFrom: the airport where the aircraft's trail starts on the ground (fact)
 *  - scheduled route for the callsign from adsbdb (usually right, but callsigns get reused)
 * The scheduled route is only trusted when the aircraft is actually near its great circle
 * and (if known) departed from the scheduled origin.
 */
import { alongTrack, crossTrack, distance } from './geo.ts';
import type { Aircraft, LatLon } from './types.ts';
import type { FlightRoute } from '../server/types.ts';

/**
 * Airport as it arrives from the API (`lat` / `lon`: adsbdb route airports, the server's
 * departedFrom) or already normalised (`latitude` / `longitude`).
 */
export interface AirportInput {
  icao?: string;
  iata?: string;
  name?: string;
  city?: string;
  country?: string;
  lat?: number;
  lon?: number;
  latitude?: number;
  longitude?: number;
}

/** Airport in the shape the client works with (see `normaliseAirport`). */
export interface RouteEndpoint extends LatLon {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
}

/** Result of `resolveRoute`. Distances in metres, progress 0..1. */
export interface ResolvedRoute {
  origin: RouteEndpoint | null;
  destination: RouteEndpoint | null;
  verified: boolean;
  note: string;
  source: string;
  total?: number;
  flown?: number;
  remaining?: number;
  progress?: number;
}

/** Airport near the aircraft (AirportLayer.nearest result). */
export interface NearbyAirport {
  icao: string;
  iata: string;
  distanceM: number;
}

const MATCH_ORIGIN_M = 30_000;
const NEAR_AIRPORT_M = 15_000;

// coordinates are always present on API airports (lat/lon) or normalised ones (latitude/longitude)
const toPoint = (a: AirportInput | null): LatLon | null =>
  a ? { latitude: (a.lat ?? a.latitude) as number, longitude: (a.lon ?? a.longitude) as number } : null;

export function normaliseAirport(a: AirportInput | null | undefined): RouteEndpoint | null {
  if (!a) return null;
  return {
    icao: a.icao || '',
    iata: a.iata || '',
    name: a.name || '',
    city: a.city || '',
    country: a.country || '',
    latitude: (a.lat ?? a.latitude) as number,
    longitude: (a.lon ?? a.longitude) as number,
  };
}

/**
 * Returns { origin, destination, verified, note, total, flown, remaining, progress }
 * (distances in metres, progress 0..1) or null when nothing is known.
 */
export function resolveRoute({ ac, scheduled, departedFrom }: {
  ac: LatLon | null | undefined;
  scheduled: FlightRoute | null | undefined;
  departedFrom: AirportInput | null | undefined;
}): ResolvedRoute | null {
  let origin = normaliseAirport(scheduled?.origin);
  let destination = normaliseAirport(scheduled?.destination);
  const dep = normaliseAirport(departedFrom);
  let verified = false;
  let note = '';

  if (origin && destination && ac) {
    const total = distance(toPoint(origin)!, toPoint(destination)!);
    const xt = Math.abs(crossTrack(ac, origin, destination));
    const along = alongTrack(ac, origin, destination);
    const onPath = xt < Math.max(150_000, total * 0.25) && along > -150_000 && along < total + 150_000;
    const depMatches = !dep || distance(dep, origin) < MATCH_ORIGIN_M;
    if (onPath && depMatches) {
      verified = true;
    } else if (dep && !depMatches) {
      origin = dep;
      destination = null;
      note = 'Scheduled route for this callsign does not match where the aircraft took off';
    } else {
      note = 'Scheduled route for this callsign does not match the flight path';
    }
  } else if (dep) {
    origin = dep;
    verified = true;
  }
  if (!origin && !destination) return null;

  const out: ResolvedRoute = { origin, destination, verified, note, source: scheduled?.source ?? (dep ? 'trail' : '') };
  if (verified && origin && destination && ac) {
    out.total = distance(origin, destination);
    out.remaining = distance(ac, destination);
    out.flown = Math.max(0, out.total - out.remaining);
    out.progress = Math.min(1, Math.max(0, alongTrack(ac, origin, destination) / out.total));
  }
  return out;
}

/** Human-readable flight phase in FR24 spirit. */
export function flightPhase(
  ac: Pick<Aircraft, 'onGround' | 'speed' | 'vspeed' | 'altitude'> | null | undefined,
  route: ResolvedRoute | null | undefined,
  nearest: NearbyAirport | null | undefined,
): string {
  if (!ac) return '';
  const near = nearest ? nearest.iata || nearest.icao : '';
  if (ac.onGround) {
    if ((ac.speed ?? 0) > 40) return near ? `Take-off / landing roll at ${near}` : 'Take-off / landing roll';
    return near ? `On ground at ${near}` : 'On ground';
  }
  const vs = ac.vspeed ?? 0;
  const dest = route?.destination;
  // (an unknown `remaining` compares false, as before)
  if (dest && vs < -300 && route?.remaining != null && route.remaining < 150_000) return `Approaching ${dest.iata || dest.icao}`;
  if (ac.altitude < 10_000 && nearest && nearest.distanceM < NEAR_AIRPORT_M * 3) {
    if (vs > 300) return `Departing ${near}`;
    if (vs < -300) return `Approaching ${near}`;
  }
  if (vs > 300) return 'Climbing';
  if (vs < -300) return 'Descending';
  return 'Cruising';
}

/** Rough time to go at current ground speed (only meaningful en route). */
export function timeRemaining(
  route: ResolvedRoute | null | undefined,
  ac: Pick<Aircraft, 'speed' | 'onGround'> | null | undefined,
): number | null {
  if (!route?.remaining || !ac?.speed || ac.speed < 120 || ac.onGround) return null;
  return route.remaining / (ac.speed * 0.514444); // seconds
}
