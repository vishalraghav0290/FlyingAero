import { NextResponse } from 'next/server';

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
    // Generate initial 80 realistic flights across US / Europe airspaces
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
      const heading = Math.floor(Math.random() * 360);
      const velocity = 200 + Math.random() * 60; // 200-260 m/s (~700-930 km/h)
      const lat = center.lat + (Math.random() - 0.5) * center.span;
      const lon = center.lon + (Math.random() - 0.5) * center.span;
      const altitude = 8000 + Math.floor(Math.random() * 4000); // 8,000 - 12,000m

      mockFlights.push({
        id: `mock-${i.toString(16).padStart(4, '0')}`,
        callsign: `${prefix}${flightNum}`,
        lat,
        lon,
        altitude,
        velocity,
        heading,
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

    // Small chance of slight heading adjustment (1° left or right) for realism
    if (Math.random() < 0.05) {
      f.heading = (f.heading + (Math.random() - 0.5) * 2 + 360) % 360;
    }
  }

  return mockFlights;
}

export async function GET() {
  const now = Date.now();

  // Return cached data if fresh (protect OpenSky rate limit)
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
      console.warn('OpenSky API 429 Rate Limited — serving smooth simulated fallback flight data');
      const fallback = getMockFlights();
      cachedFlights = fallback;
      lastFetchTime = now;
      return NextResponse.json(fallback);
    }

    if (!response.ok) {
      throw new Error(`OpenSky API HTTP ${response.status}`);
    }

    const data = await response.json();

    const flights = (data.states || []).map((state: any[]) => ({
      id: state[0],
      callsign: state[1]?.trim() || 'UNKNOWN',
      lon: state[5],
      lat: state[6],
      altitude: state[7] || 0,
      velocity: state[9] || 0,
      heading: state[10] || 0,
    })).filter((f: any) => f.lat && f.lon && f.heading);

    if (flights.length > 0) {
      cachedFlights = flights;
      lastFetchTime = now;
      return NextResponse.json(flights);
    } else {
      // Fallback if OpenSky returns empty states
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