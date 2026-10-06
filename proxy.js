import { NextResponse } from 'next/server';

/**
 * The site is public (no password). API requests are rate-limited per IP so one client
 * can't flood the free ADS-B aggregators through us. The limit is per server instance,
 * a backstop rather than a guarantee.
 */
const API_LIMIT_PER_MIN = 240;
const hits = new Map(); // ip -> { windowStart, count }

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
  if (rateLimited(request)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '30' } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
