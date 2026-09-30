import { NextResponse } from 'next/server';
import type { AircraftType, Flight } from '@/lib/flight/types';

// ─── Airline Metadata Lookup ──────────────────────────────────────────────────
const AIRLINE_DB: Record<string, { airline: string; country: string; flag: string }> = {
  AAL: { airline: 'American Airlines',    country: 'United States', flag: '🇺🇸' },
  DAL: { airline: 'Delta Air Lines',      country: 'United States', flag: '🇺🇸' },
  UAL: { airline: 'United Airlines',      country: 'United States', flag: '🇺🇸' },
  SWA: { airline: 'Southwest Airlines',   country: 'United States', flag: '🇺🇸' },
  JBU: { airline: 'JetBlue Airways',      country: 'United States', flag: '🇺🇸' },
  FDX: { airline: 'FedEx Express',        country: 'United States', flag: '🇺🇸' },
  UPS: { airline: 'UPS Airlines',         country: 'United States', flag: '🇺🇸' },
  SKW: { airline: 'SkyWest Airlines',     country: 'United States', flag: '🇺🇸' },
  ASA: { airline: 'Alaska Airlines',      country: 'United States', flag: '🇺🇸' },
  EJA: { airline: 'NetJets',              country: 'United States', flag: '🇺🇸' },
  NKS: { airline: 'Spirit Airlines',      country: 'United States', flag: '🇺🇸' },
  FFT: { airline: 'Frontier Airlines',    country: 'United States', flag: '🇺🇸' },
  BAW: { airline: 'British Airways',      country: 'United Kingdom', flag: '🇬🇧' },
  EZY: { airline: 'easyJet',             country: 'United Kingdom', flag: '🇬🇧' },
  VIR: { airline: 'Virgin Atlantic',      country: 'United Kingdom', flag: '🇬🇧' },
  AFR: { airline: 'Air France',           country: 'France',        flag: '🇫🇷' },
  DLH: { airline: 'Lufthansa',            country: 'Germany',       flag: '🇩🇪' },
  BER: { airline: 'Air Berlin',           country: 'Germany',       flag: '🇩🇪' },
  KLM: { airline: 'KLM Royal Dutch',      country: 'Netherlands',   flag: '🇳🇱' },
  UAE: { airline: 'Emirates',             country: 'UAE',           flag: '🇦🇪' },
  ETD: { airline: 'Etihad Airways',       country: 'UAE',           flag: '🇦🇪' },
  QTR: { airline: 'Qatar Airways',        country: 'Qatar',         flag: '🇶🇦' },
  THY: { airline: 'Turkish Airlines',     country: 'Turkey',        flag: '🇹🇷' },
  SIA: { airline: 'Singapore Airlines',   country: 'Singapore',     flag: '🇸🇬' },
  QFA: { airline: 'Qantas',              country: 'Australia',     flag: '🇦🇺' },
  ANA: { airline: 'All Nippon Airways',   country: 'Japan',         flag: '🇯🇵' },
  JAL: { airline: 'Japan Airlines',       country: 'Japan',         flag: '🇯🇵' },
  CPA: { airline: 'Cathay Pacific',       country: 'Hong Kong',     flag: '🇭🇰' },
  CCA: { airline: 'Air China',            country: 'China',         flag: '🇨🇳' },
  CSN: { airline: 'China Southern',       country: 'China',         flag: '🇨🇳' },
  CES: { airline: 'China Eastern',        country: 'China',         flag: '🇨🇳' },
  KAL: { airline: 'Korean Air',           country: 'South Korea',   flag: '🇰🇷' },
  AAR: { airline: 'Asiana Airlines',      country: 'South Korea',   flag: '🇰🇷' },
  AIC: { airline: 'Air India',            country: 'India',         flag: '🇮🇳' },
  IGO: { airline: 'IndiGo',              country: 'India',         flag: '🇮🇳' },
  IBE: { airline: 'Iberia',               country: 'Spain',         flag: '🇪🇸' },
  VLG: { airline: 'Vueling',              country: 'Spain',         flag: '🇪🇸' },
  RYR: { airline: 'Ryanair',              country: 'Ireland',       flag: '🇮🇪' },
  WZZ: { airline: 'Wizz Air',             country: 'Hungary',       flag: '🇭🇺' },
  AZA: { airline: 'ITA Airways',          country: 'Italy',         flag: '🇮🇹' },
  SVA: { airline: 'Saudia',               country: 'Saudi Arabia',  flag: '🇸🇦' },
  FDB: { airline: 'flydubai',             country: 'UAE',           flag: '🇦🇪' },
  RAM: { airline: 'Royal Air Maroc',      country: 'Morocco',       flag: '🇲🇦' },
  ETH: { airline: 'Ethiopian Airlines',   country: 'Ethiopia',      flag: '🇪🇹' },
  KQA: { airline: 'Kenya Airways',        country: 'Kenya',         flag: '🇰🇪' },
  JST: { airline: 'Jetstar',              country: 'Australia',     flag: '🇦🇺' },
  NZL: { airline: 'Air New Zealand',      country: 'New Zealand',   flag: '🇳🇿' },
  AVA: { airline: 'Avianca',              country: 'Colombia',      flag: '🇨🇴' },
  LAM: { airline: 'LATAM Airlines',       country: 'Chile',         flag: '🇨🇱' },
  GLO: { airline: 'GOL Linhas Aéreas',    country: 'Brazil',        flag: '🇧🇷' },
  TAM: { airline: 'LATAM Brasil',         country: 'Brazil',        flag: '🇧🇷' },
  AFL: { airline: 'Aeroflot',             country: 'Russia',        flag: '🇷🇺' },
  SUR: { airline: 'S7 Airlines',          country: 'Russia',        flag: '🇷🇺' },
  BEE: { airline: 'flybe',                country: 'United Kingdom', flag: '🇬🇧' },
  LOT: { airline: 'LOT Polish Airlines',  country: 'Poland',        flag: '🇵🇱' },
  SAS: { airline: 'Scandinavian Airlines',country: 'Sweden',        flag: '🇸🇪' },
  FIN: { airline: 'Finnair',              country: 'Finland',       flag: '🇫🇮' },
  MSR: { airline: 'EgyptAir',             country: 'Egypt',         flag: '🇪🇬' },
  ACA: { airline: 'Air Canada',           country: 'Canada',        flag: '🇨🇦' },
  WJA: { airline: 'WestJet',              country: 'Canada',        flag: '🇨🇦' },
  TAP: { airline: 'TAP Air Portugal',     country: 'Portugal',      flag: '🇵🇹' },
  SWR: { airline: 'Swiss',                country: 'Switzerland',   flag: '🇨🇭' },
  AUA: { airline: 'Austrian Airlines',    country: 'Austria',       flag: '🇦🇹' },
};

// ─── ICAO Type → Readable Model Name ────────────────────────────────────────
const MODEL_NAMES: Record<string, string> = {
  // Boeing narrow
  B737: 'Boeing 737', B738: 'Boeing 737-800', B739: 'Boeing 737-900',
  B38M: 'Boeing 737 MAX 8', B39M: 'Boeing 737 MAX 9',
  B752: 'Boeing 757-200', B753: 'Boeing 757-300',
  // Boeing wide
  B763: 'Boeing 767-300', B764: 'Boeing 767-400',
  B772: 'Boeing 777-200', B773: 'Boeing 777-300',
  B77W: 'Boeing 777-300ER', B77F: 'Boeing 777F',
  B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10',
  B742: 'Boeing 747-200', B744: 'Boeing 747-400', B748: 'Boeing 747-8',
  // Airbus narrow
  A318: 'Airbus A318', A319: 'Airbus A319', A320: 'Airbus A320',
  A321: 'Airbus A321', A20N: 'Airbus A320neo', A21N: 'Airbus A321neo',
  // Airbus wide
  A330: 'Airbus A330', A332: 'Airbus A330-200', A333: 'Airbus A330-300',
  A339: 'Airbus A330-900', A342: 'Airbus A340-200', A343: 'Airbus A340-300',
  A345: 'Airbus A340-500', A346: 'Airbus A340-600',
  A359: 'Airbus A350-900', A35K: 'Airbus A350-1000',
  A380: 'Airbus A380', A388: 'Airbus A380-800',
  // Embraer
  E170: 'Embraer E170', E175: 'Embraer E175', E190: 'Embraer E190', E195: 'Embraer E195',
  E75S: 'Embraer E175-S', E55P: 'Embraer Phenom 300',
  // Bombardier / CRJ
  CRJ7: 'Bombardier CRJ-700', CRJ9: 'Bombardier CRJ-900',
  // Helicopters
  R22: 'Robinson R22', R44: 'Robinson R44', R66: 'Robinson R66',
  EC35: 'Airbus H135', EC45: 'Airbus H145', AS50: 'Airbus AS350',
  S76: 'Sikorsky S-76', B06: 'Bell 206', B07: 'Bell 407',
  H60: 'Sikorsky Black Hawk', A109: 'AgustaWestland AW109',
  // Cargo
  MD11:'McDonnell Douglas MD-11',
  // Small GA
  C172: 'Cessna 172', C182: 'Cessna 182', C208: 'Cessna Caravan',
  C68A: 'Cessna Citation Latitude', P28A: 'Piper PA-28 Arrow',
  SR22: 'Cirrus SR22', BE23: 'Beechcraft Musketeer', BE20: 'Beechcraft King Air 200',
  C185: 'Cessna 185 Skywagon',
};

// ─── ADS-B Category → Aircraft Type ─────────────────────────────────────────
function categoryToType(category: string, typeCode: string): AircraftType {
  // Rotorcraft
  if (category === 'A7' || category === 'B1') return 'helicopter';
  // Heavy / High-vortex (widebody)
  if (category === 'A5' || category === 'A4') return 'widebody';
  // Large (jets)
  if (category === 'A3') return 'jet';
  // Light aircraft
  if (category === 'A1') return 'light';

  // Fall back to type code heuristic
  const t = (typeCode || '').toUpperCase();
  if (/^(R[246]|EC|AS|S7[06]|B0[67]|H[56]|A10|AW|HU|SA)/.test(t)) return 'helicopter';
  if (/^(B74|B77|B78|B76|A38|A35|A34|A33|A30|B744|B748|B789|A380|B772|B773)/.test(t)) return 'widebody';
  if (/^(B73|B75|A3[12][89]|A20|A21|E[17][05]|CRJ|AT[57])/.test(t)) return 'jet';
  if (/^(B74.F|MD11|B77F)/.test(t)) return 'cargo';
  return 'jet'; // default
}

function lookupAirline(callsign: string) {
  const prefix = callsign.trim().slice(0, 3).toUpperCase();
  return AIRLINE_DB[prefix] ?? { airline: 'Unknown Operator', country: 'Unknown', flag: '🌐' };
}

const EMERGENCY_SQUAWKS = new Set(['7500', '7600', '7700']);

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-SOURCE ADS-B DATA PROVIDERS
// ═══════════════════════════════════════════════════════════════════════════════
//
// All three providers use identical response format (ADSBx v2 compatible):
//   { ac: [ { hex, lat, lon, track, alt_baro, gs, ... }, ... ] }
//
// This lets us use one parser (mapAdsbToFlight) for all sources.
//
// Priority order:
//   1. adsb.lol     — primary, best global coverage
//   2. adsb.fi      — community-driven, excellent European/global coverage
//   3. airplanes.live — good fallback, strong North American coverage
//
// ═══════════════════════════════════════════════════════════════════════════════

interface DataProvider {
  name: string;
  buildUrl: (lat: number, lon: number, dist: number) => string;
  headers: Record<string, string>;
  timeoutMs: number;
}

const PROVIDERS: DataProvider[] = [
  {
    name: 'adsb.lol',
    buildUrl: (lat, lon, dist) => `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}`,
    headers: { 'User-Agent': 'AeroTrack/1.0 (flight-tracker-project)' },
    timeoutMs: 8000,
  },
  {
    name: 'adsb.fi',
    buildUrl: (lat, lon, dist) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${dist}`,
    headers: { 'User-Agent': 'AeroTrack/1.0 (flight-tracker-project)' },
    timeoutMs: 8000,
  },
  {
    name: 'airplanes.live',
    buildUrl: (lat, lon, dist) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${dist}`,
    headers: { 'User-Agent': 'AeroTrack/1.0 (flight-tracker-project)' },
    timeoutMs: 10000,
  },
];

// ─── Query Regions ───────────────────────────────────────────────────────────
// 8 strategic world centers. Each should return at least MIN_EXPECTED flights
// during any normal hour. If not → the region is considered "gapped."

interface Region {
  name: string;
  lat: number;
  lon: number;
  minExpected: number; // below this = suspicious gap
}

const REGIONS: Region[] = [
  // ── Americas ──────────────────────────────────────────────────
  { name: 'US Central',   lat: 39.0,  lon: -95.0,  minExpected: 30 },
  { name: 'US East',      lat: 33.0,  lon: -80.0,  minExpected: 25 },
  { name: 'US West',      lat: 37.0,  lon: -122.0, minExpected: 20 },
  // ── Europe ────────────────────────────────────────────────────
  { name: 'Europe',       lat: 50.0,  lon:  10.0,  minExpected: 40 },
  // ── Middle East ───────────────────────────────────────────────
  { name: 'Middle East',  lat: 26.0,  lon:  45.0,  minExpected: 10 },
  { name: 'Gulf/UAE',     lat: 25.2,  lon:  55.3,  minExpected: 8  },
  // ── India / South Asia (dense coverage) ───────────────────────
  { name: 'North India',  lat: 28.6,  lon:  77.1,  minExpected: 8  },  // Delhi/NCR hub
  { name: 'West India',   lat: 19.1,  lon:  72.9,  minExpected: 8  },  // Mumbai hub
  { name: 'South India',  lat: 13.0,  lon:  80.2,  minExpected: 6  },  // Chennai/Bangalore
  { name: 'East India',   lat: 22.6,  lon:  88.4,  minExpected: 4  },  // Kolkata
  { name: 'Central Asia',  lat: 33.0, lon:  65.0,  minExpected: 3  },  // Afghanistan/Pakistan corridor
  // ── East Asia ─────────────────────────────────────────────────
  { name: 'China East',   lat: 31.2,  lon: 121.5,  minExpected: 15 },  // Shanghai hub
  { name: 'China North',  lat: 39.9,  lon: 116.4,  minExpected: 12 },  // Beijing hub
  { name: 'Japan/Korea',  lat: 35.7,  lon: 139.7,  minExpected: 10 },  // Tokyo hub
  // ── Southeast Asia ────────────────────────────────────────────
  { name: 'SE Asia North', lat: 13.7, lon: 100.5,  minExpected: 8  },  // Bangkok hub
  { name: 'SE Asia South', lat: 1.35, lon: 103.8,  minExpected: 10 },  // Singapore/KL hub
  { name: 'Indonesia',     lat: -6.2, lon: 106.8,  minExpected: 5  },  // Jakarta
  // ── Oceania ───────────────────────────────────────────────────
  { name: 'Australia',    lat: -25.0, lon:  135.0, minExpected: 5  },
];

const QUERY_DIST = 500; // nautical miles radius per query

// ─── Fetch from a single provider + region ───────────────────────────────────

async function fetchRegionFromProvider(
  provider: DataProvider,
  region: Region,
): Promise<{ regionName: string; providerName: string; aircraft: any[] }> {
  const url = provider.buildUrl(region.lat, region.lon, QUERY_DIST);
  const res = await fetch(url, {
    headers: provider.headers,
    signal: AbortSignal.timeout(provider.timeoutMs),
  });
  if (!res.ok) throw new Error(`${provider.name} ${res.status}`);
  const json = await res.json();
  const ac = Array.isArray(json.ac) ? json.ac : [];
  return { regionName: region.name, providerName: provider.name, aircraft: ac };
}

// ─── Map raw ADS-B record → our Flight type ─────────────────────────────────

function mapAdsbToFlight(ac: any): Flight | null {
  // Skip if missing position or heading
  if (ac.lat == null || ac.lon == null || ac.track == null) return null;
  // Skip ground vehicles and other non-aircraft categories
  if (ac.category && /^C/.test(ac.category)) return null;

  const callsign = (ac.flight ?? ac.hex ?? '').trim();
  const typeCode = (ac.t ?? '').trim().toUpperCase();
  const category = (ac.category ?? '').toUpperCase();
  const meta = lookupAirline(callsign);
  const onGround = ac.alt_baro === 'ground' || ac.alt_baro === 0;
  const altFt = onGround ? 0 : (typeof ac.alt_baro === 'number' ? ac.alt_baro : 0);
  const squawk = ac.squawk ?? '';

  return {
    id: ac.hex,
    callsign: callsign || ac.hex,
    lon: ac.lon,
    lat: ac.lat,
    heading: ac.track ?? 0,
    altitude: altFt,
    velocity: ac.gs ?? 0,              // knots
    verticalRate: ac.baro_rate ?? 0,   // ft/min
    onGround,
    aircraftType: categoryToType(category, typeCode),
    aircraftModel: typeCode,
    registration: (ac.r ?? '').trim(),
    squawk,
    isEmergency: EMERGENCY_SQUAWKS.has(squawk),
    airline: meta.airline,
    country: meta.country,
    countryFlag: meta.flag,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART GAP DETECTION & MULTI-SOURCE RECOVERY
// ═══════════════════════════════════════════════════════════════════════════════
//
// HOW IT WORKS:
//
// Phase 1 — "Primary sweep" (adsb.lol across all 8 regions)
//   - Fire all 8 region requests in parallel via Promise.allSettled
//   - Collect results, note which regions returned < minExpected flights
//
// Phase 2 — "Gap recovery" (for regions that look empty/thin)
//   - For each gapped region, try adsb.fi
//   - If adsb.fi also fails/returns too few, try airplanes.live
//   - Merge any new aircraft found into the global result (dedup by ICAO hex)
//
// Phase 3 — "Total failure" fallback
//   - If after all providers we still have 0 flights globally,
//     return stale cache (up to 60s old) rather than mock data
//   - Only if stale cache is also empty, use the procedural mock flights
//
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Server-Side Cache ───────────────────────────────────────────────────────
let cachedFlights: Flight[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 12_000;
const STALE_CACHE_TTL_MS = 60_000; // serve stale cache up to 60s before falling back to mock

// Track per-region health for smarter logging
const regionHealth = new Map<string, { lastCount: number; lastProvider: string; lastTime: number }>();

// ─── Position Continuity Cache ───────────────────────────────────────────────
// Stores each flight's last-known position so we can reject impossible jumps.
// A commercial jet at 600kts covers ~18km in 12s. We allow 150km to be generous
// (accounts for inaccurate positions, heading changes, etc.) but catches the
// ~500km+ jumps caused by provider-hopping or stale data.
const previousPositions = new Map<string, { lat: number; lon: number; time: number }>();
const MAX_JUMP_KM = 150; // reject position updates farther than this

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Try to add a flight, rejecting impossible position jumps */
function addFlightIfValid(seen: Map<string, Flight>, ac: any): boolean {
  if (seen.has(ac.hex)) return false;
  const flight = mapAdsbToFlight(ac);
  if (!flight) return false;

  // Check position continuity against previous cycle
  const prev = previousPositions.get(flight.id);
  if (prev) {
    const dist = haversineKm(prev.lat, prev.lon, flight.lat, flight.lon);
    if (dist > MAX_JUMP_KM) {
      // Impossible jump — use old position, update other fields
      flight.lat = prev.lat;
      flight.lon = prev.lon;
    }
  }

  seen.set(ac.hex, flight);
  return true;
}

async function fetchAllRegions(): Promise<{ flights: Flight[]; stats: string }> {
  const seen = new Map<string, Flight>();
  const logParts: string[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // STRATEGY: Round-robin distribute regions across all providers
  // instead of hammering one provider with 18 requests (causes 429s).
  //
  //   Provider 0 (adsb.lol)       → regions 0, 3, 6, 9, 12, 15
  //   Provider 1 (adsb.fi)        → regions 1, 4, 7, 10, 13, 16
  //   Provider 2 (airplanes.live) → regions 2, 5, 8, 11, 14, 17
  //
  // Each provider gets ~6 requests — well within rate limits.
  // ═══════════════════════════════════════════════════════════════════════════

  // Build assignments: { provider, region } tuples
  const assignments = REGIONS.map((region, i) => ({
    region,
    provider: PROVIDERS[i % PROVIDERS.length],
  }));

  // ── Phase 1: Fetch all regions from their assigned provider ──────────────
  const results = await Promise.allSettled(
    assignments.map(a => fetchRegionFromProvider(a.provider, a.region))
  );

  const regionResults = new Map<string, { count: number; provider: string }>();
  const gappedRegions: { region: Region; triedProviders: Set<string> }[] = [];

  for (let i = 0; i < REGIONS.length; i++) {
    const region = REGIONS[i];
    const provider = assignments[i].provider;
    const result = results[i];

    if (result.status === 'fulfilled') {
      const { aircraft } = result.value;
      let regionCount = 0;
      for (const ac of aircraft) {
        if (addFlightIfValid(seen, ac)) regionCount++;
      }

      regionHealth.set(region.name, {
        lastCount: regionCount,
        lastProvider: provider.name,
        lastTime: Date.now(),
      });
      regionResults.set(region.name, { count: regionCount, provider: provider.name });

      if (regionCount < region.minExpected) {
        gappedRegions.push({ region, triedProviders: new Set([provider.name]) });
        logParts.push(`⚠ ${region.name}: ${regionCount}/${region.minExpected} via ${provider.name} (gap)`);
      } else {
        logParts.push(`✓ ${region.name}: ${regionCount} via ${provider.name}`);
      }
    } else {
      gappedRegions.push({ region, triedProviders: new Set([provider.name]) });
      logParts.push(`✗ ${region.name}: ${provider.name} ${(result.reason as Error)?.message ?? 'FAIL'}`);
    }
  }

  // ── Phase 2: Gap recovery — try untried providers for gapped regions ─────
  if (gappedRegions.length > 0) {
    for (const fallbackProvider of PROVIDERS) {
      const retryable = gappedRegions.filter(g => {
        if (g.triedProviders.has(fallbackProvider.name)) return false;
        const health = regionHealth.get(g.region.name);
        return !health || health.lastCount < g.region.minExpected;
      });

      if (retryable.length === 0) continue;

      logParts.push(`  → Retry ${fallbackProvider.name}: ${retryable.length} region(s)`);

      const retryResults = await Promise.allSettled(
        retryable.map(g => fetchRegionFromProvider(fallbackProvider, g.region))
      );

      for (let i = 0; i < retryable.length; i++) {
        const { region } = retryable[i];
        retryable[i].triedProviders.add(fallbackProvider.name);
        const result = retryResults[i];

        if (result.status === 'fulfilled') {
          const { aircraft } = result.value;
          let newCount = 0;
          for (const ac of aircraft) {
            if (addFlightIfValid(seen, ac)) newCount++;
          }

          if (newCount > 0) {
            const prev = regionHealth.get(region.name);
            const total = (prev?.lastCount ?? 0) + newCount;
            regionHealth.set(region.name, {
              lastCount: total,
              lastProvider: fallbackProvider.name,
              lastTime: Date.now(),
            });
            logParts.push(`  ✓ ${region.name}: +${newCount} from ${fallbackProvider.name}`);
          }
        }
        // Silently skip failed retries to keep logs clean
      }
    }
  }

  const flights = Array.from(seen.values());

  // Update position cache for next cycle's continuity checks
  const now = Date.now();
  previousPositions.clear();
  for (const f of flights) {
    previousPositions.set(f.id, { lat: f.lat, lon: f.lon, time: now });
  }

  const gapCount = gappedRegions.length;
  const header = `${flights.length} flights | ${REGIONS.length - gapCount}/${REGIONS.length} OK` +
    (gapCount > 0 ? ` | ${gapCount} gaps` : '');

  return { flights, stats: `${header}\n  ${logParts.join('\n  ')}` };
}

// ─── Mock Fallback (last resort only) ────────────────────────────────────────
let mockFlights: any[] | null = null;
let lastMockUpdate = Date.now();

const MOCK_CALLSIGNS = ['AAL', 'DAL', 'UAL', 'BAW', 'SWA', 'AFR', 'DLH', 'FDX', 'UPS', 'JBU',
                        'UAE', 'QTR', 'THY', 'KAL', 'ANA', 'SIA', 'ETH', 'AIC', 'RYR', 'EZY'];
const MOCK_TYPES = ['B738', 'A320', 'B77W', 'A388', 'AS50', 'B744', 'E190', 'A321', 'R44', 'B789'];
const MOCK_REGIONS = [
  { lat: 39.8, lon: -98.5, span: 18 },
  { lat: 48.8, lon: 2.3,   span: 12 },
  { lat: 34.0, lon: -118.2,span: 10 },
  { lat: 40.7, lon: -74.0, span: 10 },
  { lat: 25.0, lon: 45.0,  span: 15 },
  { lat: 35.0, lon: 110.0, span: 15 },
  { lat: 20.0, lon: 78.0,  span: 12 },
];
const AIRCRAFT_TYPES: AircraftType[] = ['jet', 'widebody', 'helicopter', 'cargo', 'jet', 'jet'];

function getMockFlights(): Flight[] {
  const now = Date.now();
  const dt = (now - lastMockUpdate) / 1000;
  lastMockUpdate = now;
  const M_PER_DEG_LAT = 111_320;
  const DEG2RAD = Math.PI / 180;

  if (!mockFlights) {
    mockFlights = [];
    for (let i = 0; i < 120; i++) {
      const center = MOCK_REGIONS[i % MOCK_REGIONS.length];
      const prefix = MOCK_CALLSIGNS[i % MOCK_CALLSIGNS.length];
      const flightNum = 100 + Math.floor(Math.random() * 900);
      const callsign = `${prefix}${flightNum}`;
      const typeCode = MOCK_TYPES[i % MOCK_TYPES.length];
      const aircraftType = AIRCRAFT_TYPES[i % AIRCRAFT_TYPES.length];
      const velocity = aircraftType === 'helicopter' ? 80 + Math.random() * 60
                     : aircraftType === 'cargo'      ? 400 + Math.random() * 60
                     : 380 + Math.random() * 120; // knots
      const lat = center.lat + (Math.random() - 0.5) * center.span;
      const lon = center.lon + (Math.random() - 0.5) * center.span;
      const altitude = aircraftType === 'helicopter'
        ? 1000 + Math.floor(Math.random() * 5000)
        : 25000 + Math.floor(Math.random() * 15000); // feet
      const meta = lookupAirline(callsign);
      const reg = `${['N', 'G-', 'D-', 'F-', 'A6-'][i % 5]}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      mockFlights.push({
        id: `mock-${i.toString(16).padStart(4, '0')}`,
        callsign, lat, lon, altitude, velocity,
        heading: Math.floor(Math.random() * 360),
        verticalRate: Math.floor((Math.random() - 0.5) * 3000),
        onGround: false,
        aircraftType, aircraftModel: typeCode, registration: reg, squawk: '1200',
        isEmergency: false, airline: meta.airline, country: meta.country, countryFlag: meta.flag,
      } as Flight);
    }
    return mockFlights as Flight[];
  }

  for (const f of mockFlights) {
    const hdgRad = f.heading * DEG2RAD;
    const velMs = f.velocity * 0.514444; // knots → m/s
    f.lat += (velMs * Math.cos(hdgRad) * dt) / M_PER_DEG_LAT;
    const cosLat = Math.cos(f.lat * DEG2RAD);
    f.lon += cosLat > 1e-6 ? (velMs * Math.sin(hdgRad) * dt) / (M_PER_DEG_LAT * cosLat) : 0;
    if (Math.random() < 0.04) f.heading = (f.heading + (Math.random() - 0.5) * 3 + 360) % 360;
  }
  return mockFlights as Flight[];
}

// ─── API Route Handler ───────────────────────────────────────────────────────

export async function GET() {
  const now = Date.now();

  // Serve fresh cache
  if (cachedFlights && (now - lastFetchTime) < CACHE_TTL_MS) {
    return NextResponse.json(cachedFlights);
  }

  try {
    const { flights, stats } = await fetchAllRegions();
    console.log(`[AeroTrack] ${stats}`);

    if (flights.length > 0) {
      cachedFlights = flights;
      lastFetchTime = now;
      return NextResponse.json(flights);
    }

    // All providers returned 0 — try stale cache first
    if (cachedFlights && (now - lastFetchTime) < STALE_CACHE_TTL_MS) {
      console.warn(`[AeroTrack] All providers empty, serving stale cache (${cachedFlights.length} flights, ${Math.round((now - lastFetchTime) / 1000)}s old)`);
      return NextResponse.json(cachedFlights);
    }

    throw new Error('All providers returned 0 flights and cache is expired');

  } catch (error) {
    // Phase 3: Stale cache before mock
    if (cachedFlights && cachedFlights.length > 0 && (now - lastFetchTime) < STALE_CACHE_TTL_MS) {
      console.warn(`[AeroTrack] Fetch error, serving stale cache: ${(error as Error).message}`);
      return NextResponse.json(cachedFlights);
    }

    // Last resort: mock data
    console.warn(`[AeroTrack] All sources failed, using mock data: ${(error as Error).message}`);
    const fallback = getMockFlights();
    cachedFlights = fallback;
    lastFetchTime = now;
    return NextResponse.json(fallback);
  }
}