import { after } from 'next/server';
import type { NextRequest } from 'next/server';
import { services, json, parseBbox, ICAO24 } from '@/lib/server/services';
import { errorMessage, errorRetryAfter, errorStatus } from '@/lib/server/types';

export const dynamic = 'force-dynamic';

/** Live aircraft in a bounding box (shared cache). ?sel= keeps one aircraft even off-screen. */
export async function GET(request: NextRequest) {
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
    const errStatus = errorStatus(err);
    const status = errStatus !== undefined && errStatus >= 400 && errStatus < 600 ? errStatus : 502;
    const retryAfterSec = errorRetryAfter(err);
    const headers: Record<string, string> = retryAfterSec ? { 'Retry-After': String(retryAfterSec) } : {};
    return json({ error: errorMessage(err) }, { status, headers });
  }
}
