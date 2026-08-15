/**
 * Origin / destination for a callsign.
 *
 * OpenSky's live data has no routes, so we look the callsign up in adsbdb.com, a free,
 * community-maintained route database (no API key). Only the callsign is sent, which is
 * public information broadcast by the aircraft. These are *scheduled* routes for the
 * callsign: the browser cross-checks them against where the aircraft actually is.
 */
import { Airports } from './airports.js';

const ADSBDB = 'https://api.adsbdb.com/v0/callsign/';
const HIT_TTL_MS = 6 * 3600_000;
const MISS_TTL_MS = 3600_000;
const MAX_ENTRIES = 5000;

export class RouteService {
  constructor(airports) {
    this.airports = airports;
    this.cache = new Map(); // callsign -> { at, route }
    this.inflight = new Map();
  }

  _airport(a) {
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

  async lookup(callsign) {
    const cs = String(callsign || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(cs)) return null;
    const hit = this.cache.get(cs);
    if (hit && Date.now() - hit.at < (hit.route ? HIT_TTL_MS : MISS_TTL_MS)) return hit.route;
    if (this.inflight.has(cs)) return this.inflight.get(cs);

    const p = (async () => {
      try {
        const res = await fetch(ADSBDB + encodeURIComponent(cs), {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        let route = null;
        if (res.ok) {
          const fr = (await res.json())?.response?.flightroute;
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
        if (this.cache.size > MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value);
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
