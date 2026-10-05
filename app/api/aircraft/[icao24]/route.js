import { services, json, openSkyTrack, mergeTrail, ICAO24 } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

/** Aircraft metadata + full trail (OpenSky track since take-off merged with live positions). */
export async function GET(request, { params }) {
  const icao24 = String((await params).icao24).toLowerCase();
  if (!ICAO24.test(icao24)) return json({ error: 'Invalid ICAO 24-bit address' }, { status: 400 });
  const { db, feed, airports, client } = services();
  const withTrail = new URL(request.url).searchParams.get('trail') !== '0';
  const track = withTrail ? await openSkyTrack(icao24) : [];
  const history = feed.getHistory(icao24);
  const trail = mergeTrail(track, history);
  // Where the trail starts on (or just above) the ground, that airport is the real origin.
  const first = trail[0];
  const departedFrom =
    first && (first[6] || (first[3] ?? 9999) < 1000) ? airports.nearest(first[1], first[2], 12_000, 1) : null;
  return json({
    icao24,
    details: db.details(icao24),
    departedFrom,
    trail,
    trailSources: { opensky: track.length, live: history.length },
    credits: { tracks: client.credits.tracks },
  }, { request });
}
