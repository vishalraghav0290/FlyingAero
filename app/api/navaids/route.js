import { dataFile, json, rawJson } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

/** VOR / DME / NDB from OurAirports (built by `npm run setup:geodata`). */
export function GET(request) {
  const text = dataFile('navaids.json');
  return text ? rawJson(request, 'navaids.json', text) : json({ error: 'Run npm run setup:geodata' }, { status: 404 });
}
