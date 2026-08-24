import { NextResponse } from 'next/server';

/**
 * Access control for public deployments.
 *
 * The API spends the owner's OpenSky credits, so on Vercel the whole site sits behind HTTP
 * Basic auth (SITE_PASSWORD, optional SITE_USER). After the browser's login prompt it
 * resends the credentials on every request, including the map's API calls.
 * Deployed without SITE_PASSWORD, the site refuses to serve (fail closed). Local runs
 * (`npm run dev` / `npm start`) stay open unless SITE_PASSWORD is set.
 *
 * API requests are also rate-limited per IP. The limit is per server instance, a backstop
 * on top of the password, not a guarantee.
 */
const REALM = 'SkyRadar';
const API_LIMIT_PER_MIN = 240;
const hits = new Map(); // ip -> { windowStart, count }

function safeEqual(a, b) {
  // constant-time comparison so the password can't be guessed from response timing
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function authorized(request, user, password) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded = '';
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  // evaluate both so a wrong user name takes as long as a wrong password
  const okUser = safeEqual(decoded.slice(0, i), user);
  const okPass = safeEqual(decoded.slice(i + 1), password);
  return okUser && okPass;
}

function rateLimited(request) {
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.windowStart > 60_000) {
    hits.set(ip, { windowStart: now, count: 1 });
    if (hits.size > 5000) hits.delete(hits.keys().next().value);
    return false;
  }
  h.count += 1;
  return h.count > API_LIMIT_PER_MIN;
}

export function proxy(request) {
  const password = process.env.SITE_PASSWORD || '';
  const deployed = Boolean(process.env.VERCEL);

  if (!password && deployed) {
    return new NextResponse('SITE_PASSWORD is not configured for this deployment.', { status: 503 });
  }
  if (password && !authorized(request, process.env.SITE_USER || 'skyradar', password)) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
    });
  }
  if (request.nextUrl.pathname.startsWith('/api/') && rateLimited(request)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '30' } });
  }
  return NextResponse.next();
}

export const config = {
  // everything except Next's own build assets (they contain no data)
  matcher: ['/((?!_next/static|_next/image).*)'],
};
