import type { NextRequest } from 'next/server';
import { services, json } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

interface ProbeResult {
  name: string;
  ok: boolean;
  status?: number;
  error?: string;
  detail?: string;
  ms: number;
}

/** Network errors from fetch (undici) carry the system error in `cause`. */
interface ErrorCause {
  code?: string;
  message?: string;
}

// Upstreams the server depends on. ?probe=1 checks each from this server's network, which
// is how to tell "OpenSky blocks this host's IPs" apart from an app bug.
const PROBES: ReadonlyArray<readonly [name: string, url: string]> = [
  ['opensky-auth', 'https://auth.opensky-network.org/auth/realms/opensky-network/.well-known/openid-configuration'],
  ['opensky-api', 'https://opensky-network.org/api/states/all?lamin=0&lomin=0&lamax=0.01&lomax=0.01'],
  ['adsbdb', 'https://api.adsbdb.com/v0/callsign/DLH400'],
  ['adsb.lol', 'https://api.adsb.lol/v2/point/28.5/77.1/20'],
  ['adsb.fi', 'https://opendata.adsb.fi/api/v3/lat/28.5/lon/77.1/dist/20'],
  ['control (example.com)', 'https://example.com/'],
];

async function probe([name, url]: readonly [string, string]): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
      headers: { 'User-Agent': 'AeroTrack/0.3 (+https://github.com/vishalraghav0290/FlyingAero)' },
    });
    await r.arrayBuffer();
    return { name, ok: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch (err) {
    // cause.code is the useful part (ECONNRESET, ETIMEDOUT, UND_ERR_CONNECT_TIMEOUT, ...)
    const e = err instanceof Error ? err : new Error(String(err));
    const cause = e.cause as ErrorCause | null | undefined;
    return { name, ok: false, error: cause?.code || e.name, detail: String(cause?.message || e.message).slice(0, 120), ms: Date.now() - t0 };
  }
}

export async function GET(request: NextRequest) {
  const { client, db, config, feed } = services();
  const base = {
    authenticated: client.authenticated,
    sourceMode: client.mode,
    currentSource: client.kind,
    lastSource: client.sourceName,
    aircraftDb: db.loaded,
    warmRegions: client.adsb.warmStatus(),
    credits: client.credits,
    dailyCredits: config.feed.dailyCredits,
    lastError: feed.lastError,
    region: process.env.VERCEL_REGION ?? 'local',
    cacheEntries: feed.cache.map((e) => ({ bbox: e.bbox, cost: e.cost, ageMs: Date.now() - e.fetchedAt, count: e.states.length })),
  };
  const body: typeof base & { probes?: ProbeResult[] } = base;
  if (new URL(request.url).searchParams.get('probe') === '1') body.probes = await Promise.all(PROBES.map(probe));
  return json(body);
}
