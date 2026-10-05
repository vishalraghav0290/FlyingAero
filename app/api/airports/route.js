import { services, rawJson } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

/** All airports (built by `npm run setup:geodata`). */
export function GET(request) {
  return rawJson(request, 'airports.json', services().airports.raw);
}
