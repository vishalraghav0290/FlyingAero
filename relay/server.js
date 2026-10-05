/**
 * SkyRadar OpenSky relay: a tiny Node server for Koyeb / Render (no dependencies).
 *
 * OpenSky drops connections from Vercel and Cloudflare, so the app sends its OpenSky calls
 * here instead. Not an open proxy:
 *  - GET  /probe           public: checks whether OpenSky answers from this host (cached 30 s)
 *  - GET  /health          public: liveness check for the platform
 *  - POST /token           -> OpenSky OAuth2 token endpoint       (needs X-Relay-Key)
 *  - GET  /api/states/all  -> OpenSky /api/states/all             (needs X-Relay-Key)
 *  - GET  /api/tracks/all  -> OpenSky /api/tracks/all             (needs X-Relay-Key)
 * Anything else returns 404. The OpenSky credentials stay with the app; they only pass
 * through in the token request and are never logged.
 */
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT) || 8000;
const KEY = process.env.RELAY_KEY || '';
const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const API = 'https://opensky-network.org';
const API_PATHS = new Set(['/api/states/all', '/api/tracks/all']);
const FORWARD_REQ = ['authorization', 'content-type', 'accept'];
const FORWARD_RES = ['content-type', 'x-rate-limit-remaining', 'x-rate-limit-retry-after-seconds'];
const MAX_BODY = 8 * 1024;

const send = (res, status, body, type = 'text/plain') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};

function keyOk(req) {
  if (!KEY) return false;
  const a = Buffer.from(String(req.headers['x-relay-key'] || ''));
  const b = Buffer.from(KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}

let probeCache = null;
async function probe() {
  if (probeCache && Date.now() - probeCache.at < 30_000) return probeCache.body;
  const targets = {
    'opensky-auth': TOKEN_URL.replace('/protocol/openid-connect/token', '/.well-known/openid-configuration'),
    'opensky-api': `${API}/api/states/all?lamin=28&lomin=77&lamax=28.5&lomax=77.5`,
    'control (example.com)': 'https://example.com/',
  };
  const out = { host: process.env.RENDER ? 'render' : process.env.KOYEB_APP_NAME ? 'koyeb' : 'other', keyConfigured: Boolean(KEY) };
  await Promise.all(
    Object.entries(targets).map(async ([name, url]) => {
      const t0 = Date.now();
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        await r.arrayBuffer();
        out[name] = `HTTP ${r.status} in ${Date.now() - t0} ms`;
      } catch (e) {
        out[name] = `FAILED after ${Date.now() - t0} ms: ${e.cause?.code || e.name}`;
      }
    }),
  );
  probeCache = { at: Date.now(), body: JSON.stringify(out, null, 2) };
  return probeCache.body;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) reject(new Error('body too large'));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://relay');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, 'ok');
    if (req.method === 'GET' && url.pathname === '/probe') return send(res, 200, await probe(), 'application/json');

    let target;
    if (req.method === 'POST' && url.pathname === '/token') target = TOKEN_URL;
    else if (req.method === 'GET' && API_PATHS.has(url.pathname)) target = API + url.pathname + url.search;
    else return send(res, 404, 'Not found');
    if (!keyOk(req)) return send(res, KEY ? 403 : 503, KEY ? 'Forbidden' : 'RELAY_KEY not configured');

    const headers = {};
    for (const h of FORWARD_REQ) if (req.headers[h]) headers[h] = req.headers[h];
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? await readBody(req) : undefined,
      signal: AbortSignal.timeout(25_000),
    });
    const out = { 'cache-control': 'no-store' };
    for (const h of FORWARD_RES) {
      const v = upstream.headers.get(h);
      if (v) out[h] = v;
    }
    res.writeHead(upstream.status, out);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    send(res, 502, `Upstream error: ${e.cause?.code || e.message}`);
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`OpenSky relay listening on :${PORT}`));
