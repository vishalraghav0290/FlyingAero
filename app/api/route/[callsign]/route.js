import { services, json } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

/** Scheduled origin / destination for a callsign (adsbdb.com, cached). */
export async function GET(request, { params }) {
  const route = await services().routes.lookup((await params).callsign);
  return json({ route });
}
