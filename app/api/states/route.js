import { after } from 'next/server';
import { services, json, parseBbox, ICAO24 } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

/** Live aircraft in a bounding box (shared cache). ?sel= keeps one aircraft even off-screen. */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const { feed, client } = services();
  // ADS-B cells refresh in the background; keep the function alive until they finish
  // (matters on serverless hosts such as Vercel)
  after(() => client.adsb.pending());
  try {
    const sel = searchParams.get('sel');
    const body = await feed.getStates(parseBbox(searchParams), sel && ICAO24.test(sel) ? sel : null);
    return json(body, { request });
  } catch (err) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    const headers = err.retryAfterSec ? { 'Retry-After': String(err.retryAfterSec) } : {};
    return json({ error: err.message }, { status, headers });
  }
}
