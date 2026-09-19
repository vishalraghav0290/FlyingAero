import { NextResponse } from 'next/server';

export async function GET() {
  // Calling the base URL without coordinates fetches global flight data
  const url = `https://opensky-network.org/api/states/all`;

  const username = process.env.OPENSKY_USERNAME;
  const password = process.env.OPENSKY_PASSWORD;

  const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': authHeader },
      next: { revalidate: 10 }
    });

    if (!response.ok) throw new Error('OpenSky API failed');

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

    return NextResponse.json(flights);
  } catch (error) {
    console.error("Flight fetch error:", error);
    return NextResponse.json({ error: 'Failed to fetch flights' }, { status: 500 });
  }
}