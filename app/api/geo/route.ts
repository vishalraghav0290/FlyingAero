import type { NextRequest } from 'next/server';
import { json } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

const coord = (value: string | null): number | undefined => {
  if (value == null || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Approximate (city-level) location of the visitor, used only to open the map near them.
 * It comes from the IP headers the hosting platform adds (Vercel, or Cloudflare with
 * "Add visitor location headers" enabled). Nothing is stored or logged. When the headers
 * are missing (local development) the answer is empty and the app falls back to its default.
 */
export function GET(request: NextRequest) {
  const h = request.headers;
  const lat = coord(h.get('x-vercel-ip-latitude')) ?? coord(h.get('cf-iplatitude'));
  const lon = coord(h.get('x-vercel-ip-longitude')) ?? coord(h.get('cf-iplongitude'));
  if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({});
  return json({ lat, lon });
}
