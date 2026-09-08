import { NextResponse } from 'next/server';
import type { AircraftType } from '@/lib/flight/types';

// ─── Airline Metadata Lookup ──────────────────────────────────────────────────
const AIRLINE_DB: Record<string, { airline: string; country: string; flag: string }> = {
  AAL: { airline: 'American Airlines',    country: 'United States', flag: '🇺🇸' },
  DAL: { airline: 'Delta Air Lines',      country: 'United States', flag: '🇺🇸' },
  UAL: { airline: 'United Airlines',      country: 'United States', flag: '🇺🇸' },
  SWA: { airline: 'Southwest Airlines',   country: 'United States', flag: '🇺🇸' },
  JBU: { airline: 'JetBlue Airways',      country: 'United States', flag: '🇺🇸' },
  FDX: { airline: 'FedEx Express',        country: 'United States', flag: '🇺🇸' },
  UPS: { airline: 'UPS Airlines',         country: 'United States', flag: '🇺🇸' },
  BAW: { airline: 'British Airways',      country: 'United Kingdom', flag: '🇬🇧' },
  AFR: { airline: 'Air France',           country: 'France',        flag: '🇫🇷' },
  DLH: { airline: 'Lufthansa',            country: 'Germany',       flag: '🇩🇪' },
  KLM: { airline: 'KLM Royal Dutch',      country: 'Netherlands',   flag: '🇳🇱' },
  UAE: { airline: 'Emirates',             country: 'UAE',           flag: '🇦🇪' },
  SIA: { airline: 'Singapore Airlines',   country: 'Singapore',     flag: '🇸🇬' },
  QFA: { airline: 'Qantas',              country: 'Australia',     flag: '🇦🇺' },
  ANA: { airline: 'All Nippon Airways',   country: 'Japan',         flag: '🇯🇵' },
  JAL: { airline: 'Japan Airlines',       country: 'Japan',         flag: '🇯🇵' },
  CPA: { airline: 'Cathay Pacific',       country: 'Hong Kong',     flag: '🇭🇰' },
  AIB: { airline: 'Aer Lingus',           country: 'Ireland',       flag: '🇮🇪' },
  IBE: { airline: 'Iberia',               country: 'Spain',         flag: '🇪🇸' },
  AZA: { airline: 'ITA Airways',          country: 'Italy',         flag: '🇮🇹' },
};

const AIRCRAFT_TYPES: AircraftType[] = ['jet', 'widebody', 'helicopter', 'cargo'];

function lookupAirline(callsign: string) {
  const prefix = callsign.slice(0, 3).toUpperCase();
  return AIRLINE_DB[prefix] ?? { airline: 'Unknown Operator', country: 'Unknown', flag: '🌐' };
}

// ─── Server Cache & Fallback Flight Simulation ──────────────────────────────
let cachedFlights: any[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 12_000; // Cache for 12s to protect OpenSky API rate limits

// Simulated fallback state (in case OpenSky is 429 rate-limited or offline)
let mockFlights: any[] | null = null;
let lastMockUpdate = Date.now();

function getMockFlights() {
  const now = Date.now();
  const dt = (now - lastMockUpdate) / 1000;
  lastMockUpdate = now;

  if (!mockFlights) {
    mockFlights = [];
    const callsigns = ['AAL', 'DAL', 'UAL', 'BAW', 'SWA', 'AFR', 'DLH', 'FDX', 'UPS', 'JBU'];
    const centers = [
      { lat: 39.8, lon: -98.5, span: 18 }, // US Center
      { lat: 48.8, lon: 2.3, span: 12 },    // Western Europe
      { lat: 34.0, lon: -118.2, span: 10 }, // US West Coast
      { lat: 40.7, lon: -74.0, span: 10 },  // US East Coast
    ];

    for (let i = 0; i < 80; i++) {
      const center = centers[i % centers.length];
      const prefix = callsigns[i % callsigns.length];
      const flightNum = 100 + Math.floor(Math.random() * 900);
      const callsign = `${prefix}${flightNum}`;
      const heading = Math.floor(Math.random() * 360);
      const aircraftType = AIRCRAFT_TYPES[i % AIRCRAFT_TYPES.length];

      // Helicopters are slower; cargo is medium speed
      const velocity = aircraftType === 'helicopter'
        ? 40 + Math.random() * 40       // 40–80 m/s  (~140–290 km/h)
        : aircraftType === 'cargo'
        ? 180 + Math.random() * 40      // 180–220 m/s (~650–790 km/h)
        : 200 + Math.random() * 60;     // 200–260 m/s (~720–936 km/h)

      const lat = center.lat + (Math.random() - 0.5) * center.span;
      const lon = center.lon + (Math.random() - 0.5) * center.span;
      const altitude = aircraftType === 'helicopter'
        ? 200 + Math.floor(Math.random() * 1000)    // 200–1200m
        : 8000 + Math.floor(Math.random() * 4000);  // 8,000–12,000m

      const meta = lookupAirline(callsign);

      mockFlights.push({
        id: `mock-${i.toString(16).padStart(4, '0')}`,
        callsign,
        lat,
        lon,
        altitude,
        velocity,
        heading,
        aircraftType,
        airline: meta.airline,
        country: meta.country,
        countryFlag: meta.flag,
      });
    }
    return mockFlights;
  }

  // Drift mock flights forward according to heading and speed
  const M_PER_DEG_LAT = 111_320;
  const DEG2RAD = Math.PI / 180;

  for (const f of mockFlights) {
    const hdgRad = f.heading * DEG2RAD;
    const dLat = (f.velocity * Math.cos(hdgRad) * dt) / M_PER_DEG_LAT;
    const cosLat = Math.cos(f.lat * DEG2RAD);
    const dLon = cosLat > 1e-6 ? (f.velocity * Math.sin(hdgRad) * dt) / (M_PER_DEG_LAT * cosLat) : 0;

    f.lat += dLat;
    f.lon += dLon;

    // Small chance of slight heading adjustment for realism
    if (Math.random() < 0.05) {
      f.heading = (f.heading + (Math.random() - 0.5) * 2 + 360) % 360;
    }
  }

  return mockFlights;
}

export async function GET() {
  const now = Date.now();

  // Return cached data if fresh
  if (cachedFlights && (now - lastFetchTime) < CACHE_TTL_MS) {
    return NextResponse.json(cachedFlights);
  }

  const url = `https://opensky-network.org/api/states/all`;
  const username = process.env.OPENSKY_USERNAME;
  const password = process.env.OPENSKY_PASSWORD;

  const headers: Record<string, string> = {};
  if (username && password) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  }

  try {
    const response = await fetch(url, {
      headers,
      next: { revalidate: 12 }
    });

    if (response.status === 429) {
      console.warn('OpenSky API 429 — serving simulated fallback data');
      const fallback = getMockFlights();
      cachedFlights = fallback;
      lastFetchTime = now;
      return NextResponse.json(fallback);
    }

    if (!response.ok) {
      throw new Error(`OpenSky API HTTP ${response.status}`);
    }

    const data = await response.json();

    const flights = (data.states || []).map((state: any[], i: number) => {
      const callsign = state[1]?.trim() || 'UNKNOWN';
      const meta = lookupAirline(callsign);
      return {
        id: state[0],
        callsign,
        lon: state[5],
        lat: state[6],
        altitude: state[7] || 0,
        velocity: state[9] || 0,
        heading: state[10] || 0,
        aircraftType: AIRCRAFT_TYPES[i % AIRCRAFT_TYPES.length],
        airline: meta.airline,
        country: meta.country,
        countryFlag: meta.flag,
      };
    }).filter((f: any) => f.lat && f.lon && f.heading);

    if (flights.length > 0) {
      cachedFlights = flights;
      lastFetchTime = now;
      return NextResponse.json(flights);
    } else {
      const fallback = getMockFlights();
      cachedFlights = fallback;
      lastFetchTime = now;
      return NextResponse.json(fallback);
    }
  } catch (error) {
    console.warn("OpenSky fetch failed, using fallback simulation:", error);
    const fallback = getMockFlights();
    cachedFlights = fallback;
    lastFetchTime = now;
    return NextResponse.json(fallback);
  }
}