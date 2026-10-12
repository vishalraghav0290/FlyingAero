/**
 * AeroTrack OpenSky relay: a tiny Node server for Koyeb / Render (no dependencies).
 *
 * OpenSky drops connections from Vercel and Cloudflare, so the app sends its OpenSky calls
 * here instead. Not an open proxy:
 *  - GET  /health          public: liveness check ("ok", no data)
 *  - GET  /probe           checks whether OpenSky answers from this host (needs X-Relay-Key)
 *  - POST /token           -> OpenSky OAuth2 token endpoint       (needs X-Relay-Key)
 *  - GET  /api/states/all  -> OpenSky /api/states/all             (needs X-Relay-Key)
 *  - GET  /api/tracks/all  -> OpenSky /api/tracks/all             (needs X-Relay-Key)
 * Anything else returns 404. The OpenSky credentials stay with the app; they only pass
 * through in the token request and are never logged.
 * Successful /api answers are cached in memory for CACHE_TTL_S seconds (default 5); see below.
 */
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** fetch() rejects with an Error whose `cause` carries the network error code (ECONNRESET, ...). */
type FetchError = Error & { cause?: { code?: string } };

const PORT = Number(process.env.PORT) || 8000;
// RELAY_KEY_FILE (Docker secret) is preferred: env values show up in `docker inspect`.
const KEY = (process.env.RELAY_KEY_FILE ? readFileSync(process.env.RELAY_KEY_FILE, 'utf8') : process.env.RELAY_KEY || '').trim();
const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const API = 'https://opensky-network.org';
const API_PATHS = new Set(['/api/states/all', '/api/tracks/all']);
const FORWARD_REQ = ['authorization', 'content-type', 'accept'] as const;
const FORWARD_RES = ['content-type', 'x-rate-limit-remaining', 'x-rate-limit-retry-after-seconds'];
const MAX_BODY = 8 * 1024;

// Short in-memory cache for OpenSky answers (CACHE_TTL_S, default 5 s; 0 turns it off).
// OpenSky's own time resolution is 5 s, so a 5 s cache loses nothing, and several app
// instances (Vercel + local dev) asking for the same area cost one credit instead of many.
const TTL_S = Math.max(0, Number(process.env.CACHE_TTL_S ?? 5) || 0);
const TTL_MS = TTL_S * 1000;
const MAX_CACHE_ENTRIES = 40;
const MAX_CACHED_BODY = 4 * 1024 * 1024;

interface Cached {
  at: number;
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}
const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<Cached>>();

async function toCached(upstream: Response): Promise<Cached> {
  const headers: Record<string, string> = {};
  for (const h of FORWARD_RES) {
    const v = upstream.headers.get(h);
    if (v) headers[h] = v;
  }
  return { at: Date.now(), status: upstream.status, headers, body: Buffer.from(await upstream.arrayBuffer()) };
}

function remember(key: string, c: Cached): void {
  cache.delete(key); // re-insert so the Map's order is oldest-first
  cache.set(key, c);
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
}

/**
 * Sends an upstream answer. Successful API answers get `private, max-age`: the browser or
 * app may reuse them briefly, but Cloudflare's shared cache must not (a shared copy would
 * be served without the X-Relay-Key check). Everything else stays no-store.
 */
function reply(res: ServerResponse, c: Cached, state: 'HIT' | 'MISS', cacheable: boolean): void {
  const out: Record<string, string> = { ...c.headers, 'x-relay-cache': state };
  if (cacheable && TTL_S > 0) {
    out['cache-control'] = `private, max-age=${Math.max(0, Math.ceil(TTL_S - (Date.now() - c.at) / 1000))}`;
    out.age = String(Math.floor((Date.now() - c.at) / 1000));
  } else {
    out['cache-control'] = 'no-store';
    out['cdn-cache-control'] = 'no-store';
  }
  res.writeHead(c.status, out);
  res.end(c.body);
}

const send = (res: ServerResponse, status: number, body: string, type = 'text/plain'): void => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'cdn-cache-control': 'no-store' });
  res.end(body);
};

function keyOk(req: IncomingMessage): boolean {
  if (!KEY) return false;
  const a = Buffer.from(String(req.headers['x-relay-key'] || ''));
  const b = Buffer.from(KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}

let probeCache: { at: number; body: string } | null = null;
async function probe(): Promise<string> {
  if (probeCache && Date.now() - probeCache.at < 30_000) return probeCache.body;
  const targets = {
    'opensky-auth': TOKEN_URL.replace('/protocol/openid-connect/token', '/.well-known/openid-configuration'),
    'opensky-api': `${API}/api/states/all?lamin=28&lomin=77&lamax=28.5&lomax=77.5`,
    'control (example.com)': 'https://example.com/',
  };
  const out: Record<string, string | boolean> = { host: process.env.RENDER ? 'render' : process.env.KOYEB_APP_NAME ? 'koyeb' : 'other', keyConfigured: Boolean(KEY) };
  await Promise.all(
    Object.entries(targets).map(async ([name, url]) => {
      const t0 = Date.now();
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        await r.arrayBuffer();
        out[name] = `HTTP ${r.status} in ${Date.now() - t0} ms`;
      } catch (e) {
        const err = e as FetchError;
        out[name] = `FAILED after ${Date.now() - t0} ms: ${err.cause?.code || err.name}`;
      }
    }),
  );
  probeCache = { at: Date.now(), body: JSON.stringify(out, null, 2) };
  return probeCache.body;
}

function readBody(req: IncomingMessage) {
  return new Promise<Buffer<ArrayBuffer>>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) reject(new Error('body too large'));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // req.url is always set for requests received by an http.Server
  const url = new URL(req.url as string, 'http://relay');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, 'ok');
    if (req.method === 'GET' && url.pathname === '/probe') {
      if (!keyOk(req)) return send(res, KEY ? 403 : 503, KEY ? 'Forbidden' : 'RELAY_KEY not configured');
      return send(res, 200, await probe(), 'application/json');
    }

    let target: string;
    if (req.method === 'POST' && url.pathname === '/token') target = TOKEN_URL;
    else if (req.method === 'GET' && API_PATHS.has(url.pathname)) target = API + url.pathname + url.search;
    else return send(res, 404, 'Not found');
    if (!keyOk(req)) return send(res, KEY ? 403 : 503, KEY ? 'Forbidden' : 'RELAY_KEY not configured');

    const headers: Record<string, string> = {};
    for (const h of FORWARD_REQ) {
      const v = req.headers[h];
      if (v) headers[h] = v;
    }

    if (req.method === 'POST') {
      // token requests are never cached or shared
      const upstream = await fetch(target, { method: 'POST', headers, body: await readBody(req), signal: AbortSignal.timeout(25_000) });
      return reply(res, await toCached(upstream), 'MISS', false);
    }

    // GET /api/...: identical requests within CACHE_TTL_S share one OpenSky call (and one credit)
    const key = url.pathname + url.search;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return reply(res, hit, 'HIT', true);
    let pending = inflight.get(key);
    const joined = Boolean(pending);
    if (!pending) {
      pending = fetch(target, { headers, signal: AbortSignal.timeout(25_000) })
        .then(toCached)
        .then((c) => {
          // only successful answers are kept; errors (429, 5xx) are never replayed
          if (TTL_MS > 0 && c.status === 200 && c.body.length <= MAX_CACHED_BODY) remember(key, c);
          return c;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    const fresh = await pending;
    return reply(res, fresh, joined ? 'HIT' : 'MISS', fresh.status === 200);
  } catch (e) {
    const err = e as FetchError;
    send(res, 502, `Upstream error: ${err.cause?.code || err.message}`);
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`OpenSky relay listening on :${PORT}`));
