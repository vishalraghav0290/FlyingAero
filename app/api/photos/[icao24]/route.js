import { services, json, ICAO24 } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

// airport-data.com's free API has no CORS and an unreliable HTTPS endpoint, so the server
// does the JSON lookup; the browser loads the images straight from their CDN.
const AIRPORT_DATA = 'http://www.airport-data.com/api/ac_thumb.json';
const TTL_MS = 24 * 3600_000;
const ALLOWED = /^https:\/\/(www\.)?airport-data\.com\//;

export async function GET(request, { params }) {
  const icao24 = String((await params).icao24).toLowerCase();
  if (!ICAO24.test(icao24)) return json({ error: 'Invalid ICAO 24-bit address' }, { status: 400 });
  const { db, photoCache } = services();
  const hit = photoCache.get(icao24);
  if (hit && Date.now() - hit.at < TTL_MS) return json({ photos: hit.photos });

  const reg = db.basic(icao24)?.reg;
  const query = reg ? `r=${encodeURIComponent(reg)}` : `m=${icao24.toUpperCase()}`;
  try {
    const r = await fetch(`${AIRPORT_DATA}?${query}&n=3`, {
      headers: { 'User-Agent': 'SkyRadar/0.2 personal flight tracker' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    const j = r.ok ? await r.json() : null;
    const photos = (j?.data ?? [])
      .filter((p) => ALLOWED.test(p.image) && ALLOWED.test(p.link))
      .slice(0, 3)
      .map((p) => ({
        src: p.image,
        link: p.link,
        photographer: String(p.photographer || 'Unknown').slice(0, 60),
        source: 'airport-data.com',
      }));
    photoCache.set(icao24, { at: Date.now(), photos });
    if (photoCache.size > 1000) photoCache.delete(photoCache.keys().next().value);
    return json({ photos });
  } catch {
    return json({ photos: [] });
  }
}
