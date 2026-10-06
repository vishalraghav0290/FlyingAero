import { existsSync } from 'node:fs';
import path from 'node:path';

// Project root. Next.js and the npm scripts both run from it; import.meta.url can't be used
// because Next bundles server code into .next/.
export const ROOT_DIR = process.cwd();

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig() {
  // Next.js loads .env itself; the standalone scripts (setup, check:opensky) need it loaded.
  const envFile = path.join(ROOT_DIR, '.env');
  if (!process.env.NEXT_RUNTIME && existsSync(envFile)) process.loadEnvFile(envFile);

  const e = process.env;
  return {
    opensky: {
      clientId: (e.OPENSKY_CLIENT_ID || '').trim(),
      clientSecret: (e.OPENSKY_CLIENT_SECRET || '').trim(),
      // optional relay for hosts OpenSky blocks (see legacy/relay/server.js)
      relayUrl: (e.OPENSKY_RELAY_URL || '').trim(),
      relayKey: (e.OPENSKY_RELAY_KEY || '').trim(),
    },
    feed: {
      // OpenSky's authenticated time resolution is 5 s, so polling faster is pointless.
      minIntervalMs: Math.max(5000, num(e.MIN_POLL_INTERVAL_MS, 5000)),
      // Poll interval for a 1-credit (<= 25 sq°) area. Bigger areas cost more and poll slower.
      baseIntervalMs: Math.max(5000, num(e.FEED_BASE_INTERVAL_MS, 10_000)),
      dailyCredits: num(e.OPENSKY_DAILY_CREDITS, 4000),
      // opensky | adsb | auto (OpenSky first, ADS-B when OpenSky can't be reached)
      // default adsb: works from any host. opensky / auto are opt-in (home connections only)
      source: (e.DATA_SOURCE || 'adsb').trim().toLowerCase(),
      // shared poll interval for the free ADS-B aggregators (they ask for ~1 req/s at most)
      adsbIntervalMs: Math.max(3000, num(e.ADSB_INTERVAL_MS, 5000)),
    },
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
export type OpenSkyConfig = AppConfig['opensky'];
export type FeedConfig = AppConfig['feed'];
