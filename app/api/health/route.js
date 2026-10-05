import { services, json } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

// Upstreams the server depends on. ?probe=1 checks each from this server's network, which
// is how to tell "OpenSky blocks this host's IPs" apart from an app bug.
const PROBES = [
  ['opensky-auth', 'https://auth.opensky-network.org/auth/realms/opensky-network/.well-known/openid-configuration'],
  ['opensky-api', 'https://opensky-network.org/api/states/all?lamin=0&lomin=0&lamax=0.01&lomax=0.01'],
  ['adsbdb', 'https://api.adsbdb.com/v0/callsign/DLH400'],
  ['control (example.com)', 'https://example.com/'],
];

async function probe([name, url]) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    await r.arrayBuffer();
    return { name, ok: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch (err) {
    // cause.code is the useful part (ECONNRESET, ETIMEDOUT, UND_ERR_CONNECT_TIMEOUT, ...)
    return { name, ok: false, error: err.cause?.code || err.name, detail: String(err.cause?.message || err.message).slice(0, 120), ms: Date.now() - t0 };
  }
}

export async function GET(request) {
  const { client, db, config, feed } = services();
  const body = {
    authenticated: client.authenticated,
    aircraftDb: db.loaded,
    credits: client.credits,
    dailyCredits: config.feed.dailyCredits,
    lastError: feed.lastError,
    region: process.env.VERCEL_REGION ?? 'local',
    cacheEntries: feed.cache.map((e) => ({ bbox: e.bbox, cost: e.cost, ageMs: Date.now() - e.fetchedAt, count: e.states.length })),
  };
  if (new URL(request.url).searchParams.get('probe') === '1') body.probes = await Promise.all(PROBES.map(probe));
  return json(body);
}
