/**
 * AeroTrack OpenSky relay (Cloudflare Worker).
 *
 * OpenSky drops connections from Vercel/AWS IPs, so the Next.js server sends its OpenSky
 * calls here instead. This is NOT an open proxy:
 *  - every request needs the X-Relay-Key header (secret RELAY_KEY)
 *  - only OpenSky's token endpoint (POST) and /api/states/all, /api/tracks/all (GET) are allowed
 *  - the OpenSky credentials stay on the Vercel side; they only pass through in the token call
 */
/** Worker bindings (set with `wrangler secret put RELAY_KEY`). */
interface Env {
  RELAY_KEY?: string;
}

interface ProbeResult {
  ok: boolean;
  status?: number;
  error?: string;
  ms: number;
}

const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const API = 'https://opensky-network.org';
const ALLOWED_API = new Set(['/api/states/all', '/api/tracks/all']);
const FORWARD_REQ = ['authorization', 'content-type', 'accept'];
const FORWARD_RES = ['content-type', 'x-rate-limit-remaining', 'x-rate-limit-retry-after-seconds'];

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const text = (body: string, status: number): Response => new Response(body, { status, headers: { 'content-type': 'text/plain' } });

async function probe(): Promise<Response> {
  const out: Record<string, ProbeResult> = {};
  for (const [name, url] of [['opensky-auth', TOKEN_URL.replace('/protocol/openid-connect/token', '/.well-known/openid-configuration')], ['opensky-api', `${API}/api/states/all?lamin=0&lomin=0&lamax=0.01&lomax=0.01`]]) {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      await r.arrayBuffer();
      out[name] = { ok: r.ok, status: r.status, ms: Date.now() - t0 };
    } catch (e) {
      out[name] = { ok: false, error: String((e as Error).message || e).slice(0, 120), ms: Date.now() - t0 };
    }
  }
  return Response.json(out);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.RELAY_KEY) return text('Relay not configured', 503);
    if (!safeEqual(request.headers.get('x-relay-key') || '', env.RELAY_KEY)) return text('Forbidden', 403);

    const url = new URL(request.url);
    let target: string;
    if (url.pathname === '/probe' && request.method === 'GET') return probe();
    if (url.pathname === '/token' && request.method === 'POST') target = TOKEN_URL;
    else if (ALLOWED_API.has(url.pathname) && request.method === 'GET') target = API + url.pathname + url.search;
    else return text('Not found', 404);

    const headers = new Headers();
    for (const h of FORWARD_REQ) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }
    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers,
        body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      return text(`Upstream error: ${String((e as Error).message || e).slice(0, 120)}`, 502);
    }
    const resHeaders = new Headers({ 'cache-control': 'no-store' });
    for (const h of FORWARD_RES) {
      const v = upstream.headers.get(h);
      if (v) resHeaders.set(h, v);
    }
    return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
  },
};
