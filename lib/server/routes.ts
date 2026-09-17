/**
 * Origin / destination for a callsign.
 *
 * OpenSky's live data has no routes, so we look the callsign up in adsbdb.com, a free,
 * community-maintained route database (no API key). Only the callsign is sent, which is
 * public information broadcast by the aircraft. These are *scheduled* routes for the
 * callsign: the browser cross-checks them against where the aircraft actually is.
 */
import { Airports } from './airports.ts';
import type { AdsbdbAirport, AdsbdbCallsignResponse, FlightRoute, RouteAirport } from './types.ts';

const ADSBDB = 'https://api.adsbdb.com/v0/callsign/';
const HIT_TTL_MS = 6 * 3600_000;
const MISS_TTL_MS = 3600_000;
const MAX_ENTRIES = 5000;

export class RouteService {
  airports: Airports;
  cache: Map<string, { at: number; route: FlightRoute | null }>;
  inflight: Map<string, Promise<FlightRoute | null>>;

  constructor(airports: Airports) {
    this.airports = airports;
    this.cache = new Map(); // callsign -> { at, route }
    this.inflight = new Map();
  }

  _airport(a: AdsbdbAirport | null | undefined): RouteAirport | null {
    if (!a) return null;
    const ours = Airports.toObject(this.airports.byIcao.get((a.icao_code || '').toUpperCase()));
    return {
      icao: a.icao_code || ours?.icao || '',
      iata: a.iata_code || ours?.iata || '',
      name: ours?.name || a.name || '',
      city: ours?.city || a.municipality || '',
      country: ours?.country || a.country_iso_name || '',
      lat: ours?.lat ?? Number(a.latitude),
      lon: ours?.lon ?? Number(a.longitude),
    };
  }

  async lookup(callsign: string | null | undefined): Promise<FlightRoute | null> {
    const cs = String(callsign || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(cs)) return null;
    const hit = this.cache.get(cs);
    if (hit && Date.now() - hit.at < (hit.route ? HIT_TTL_MS : MISS_TTL_MS)) return hit.route;
    const running = this.inflight.get(cs);
    if (running) return running;

    const p = (async (): Promise<FlightRoute | null> => {
      try {
        const res = await fetch(ADSBDB + encodeURIComponent(cs), {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        let route: FlightRoute | null = null;
        if (res.ok) {
          // `response` is a message string (not an object) for unknown callsigns
          const body = (await res.json()) as AdsbdbCallsignResponse | null;
          const fr = body?.response && typeof body.response === 'object' ? body.response.flightroute : undefined;
          if (fr?.origin && fr?.destination) {
            route = {
              callsign: cs,
              airline: fr.airline?.name || '',
              airlineIcao: fr.airline?.icao || '',
              origin: this._airport(fr.origin),
              destination: this._airport(fr.destination),
              stop: this._airport(fr.midpoint),
              source: 'adsbdb',
            };
          }
        } else if (res.status !== 404) {
          return hit?.route ?? null; // service trouble: don't cache a miss
        }
        this.cache.set(cs, { at: Date.now(), route });
        if (this.cache.size > MAX_ENTRIES) {
          const oldest = this.cache.keys().next().value;
          if (oldest !== undefined) this.cache.delete(oldest);
        }
        return route;
      } catch {
        return hit?.route ?? null;
      } finally {
        this.inflight.delete(cs);
      }
    })();
    this.inflight.set(cs, p);
    return p;
  }
}
