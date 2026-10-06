import { after } from 'next/server';
import { services, json } from '@/lib/server/services';
import type { IndiaProgress } from '@/lib/server/adsb';

export const dynamic = 'force-dynamic';

/** Body of /api/warmup. `done` once every India cell has live data. */
export interface WarmupResponse extends IndiaProgress {
  done: boolean;
}

/**
 * Loading-screen progress: loads India's aircraft (New Delhi outwards) and reports how far
 * along it is. The loading screen polls this about once a second.
 */
export async function GET() {
  const { client } = services();
  if (client.mode === 'opensky') {
    // OpenSky answers whole areas in one request, so there's nothing to warm up
    return json({ region: 'India', cells: 0, loaded: 0, aircraft: 0, done: true } satisfies WarmupResponse);
  }
  // cell refreshes run in the background; keep the function alive until they finish
  after(() => client.adsb.pending());
  const p = client.adsb.indiaProgress();
  return json({ ...p, done: p.cells > 0 && p.loaded >= p.cells } satisfies WarmupResponse);
}
