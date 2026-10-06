import type { NextRequest } from 'next/server';
import { services, rawJson } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

/** All airports (built by `npm run setup:geodata`). */
export function GET(request: NextRequest) {
  return rawJson(request, 'airports.json', services().airports.raw);
}
