import type { NextRequest } from 'next/server';
import { services, json } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

/** Scheduled origin / destination for a callsign (adsbdb.com, cached). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ callsign: string }> }) {
  const route = await services().routes.lookup((await params).callsign);
  return json({ route });
}
