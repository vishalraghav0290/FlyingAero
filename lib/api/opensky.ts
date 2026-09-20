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

// ─── adsb.lol Multi-Region Fetch ─────────────────────────────────────────────

/**
 * We query 8 strategic world-center coordinates at 500nm radius.
 * This covers Europe, US, East Asia, South Asia, Middle East, SE Asia, Central Asia, and Australia.
 * Promise.allSettled means one dead region won't block others.
 */
const REGIONS = [
  { lat: 39.0, lon: -95.0 },   // US Central
  { lat: 33.0, lon: -80.0 },   // US East Coast
  { lat: 37.0, lon: -122.0 },  // US West Coast
  { lat: 50.0, lon:  10.0 },   // Europe Central
  { lat: 26.0, lon:  45.0 },   // Middle East
  { lat: 35.0, lon: 115.0 },   // China / East Asia
  { lat: 20.0, lon:  80.0 },   // India / South Asia
  { lat: -25.0, lon: 135.0 },  // Australia
];
const ADSB_DIST = 500; // nautical miles radius per query

async function fetchAdsbRegion(lat: number, lon: number): Promise<any[]> {
  const url = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${ADSB_DIST}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AeroTrack/1.0 (flight-tracker-project)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`adsb.lol ${res.status}`);
  const json = await res.json();
  return Array.isArray(json.ac) ? json.ac : [];
}

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

// ─── Server-Side Cache ───────────────────────────────────────────────────────
let cachedFlights: Flight[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 12_000;

// ─── Mock Fallback ───────────────────────────────────────────────────────────
let mockFlights: any[] | null = null;
let lastMockUpdate = Date.now();

const MOCK_CALLSIGNS = ['AAL', 'DAL', 'UAL', 'BAW', 'SWA', 'AFR', 'DLH', 'FDX', 'UPS', 'JBU',
                        'UAE', 'QTR', 'THY', 'KAL', 'ANA', 'SIA', 'ETH', 'AIC', 'RYR', 'EZY'];
const MOCK_TYPES = ['B738', 'A320', 'B77W', 'A388', 'AS50', 'B744', 'E190', 'A321', 'R44', 'B789'];
const MOCK_REGIONS = [
  { lat: 39.8, lon: -98.5, span: 18 },  // US Center
  { lat: 48.8, lon: 2.3,   span: 12 },  // Western Europe
  { lat: 34.0, lon: -118.2,span: 10 },  // US West Coast
  { lat: 40.7, lon: -74.0, span: 10 },  // US East Coast
  { lat: 25.0, lon: 45.0,  span: 15 },  // Middle East
  { lat: 35.0, lon: 110.0, span: 15 },  // East Asia
  { lat: 20.0, lon: 78.0,  span: 12 },  // India
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

  if (cachedFlights && (now - lastFetchTime) < CACHE_TTL_MS) {
    return NextResponse.json(cachedFlights);
  }

  try {
    const results = await Promise.allSettled(
      REGIONS.map(r => fetchAdsbRegion(r.lat, r.lon))
    );

    // Merge & deduplicate by ICAO hex
    const seen = new Map<string, Flight>();
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const ac of result.value) {
        if (seen.has(ac.hex)) continue;
        const flight = mapAdsbToFlight(ac);
        if (flight) seen.set(ac.hex, flight);
      }
    }

    const flights = Array.from(seen.values());

    if (flights.length > 0) {
      cachedFlights = flights;
      lastFetchTime = now;
      console.log(`[AeroTrack] adsb.lol: ${flights.length} flights from ${results.filter(r => r.status === 'fulfilled').length}/${REGIONS.length} regions`);
      return NextResponse.json(flights);
    }

    // If all regions returned empty, fall back to mock
    throw new Error('No flights returned from any adsb.lol region');

  } catch (error) {
    console.warn('[AeroTrack] adsb.lol fetch failed, using mock data:', (error as Error).message);
    const fallback = getMockFlights();
    cachedFlights = fallback;
    lastFetchTime = now;
    return NextResponse.json(fallback);
  }
}