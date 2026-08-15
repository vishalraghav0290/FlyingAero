import { dataFile, json, rawJson } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

/** Borders as officially recognised by India (Natural Earth point-of-view data). */
export function GET(request) {
  const text = dataFile('boundaries-in.json');
  return text
    ? rawJson(request, 'boundaries-in.json', text)
    : json({ error: 'Run npm run setup:geodata' }, { status: 404 });
}
