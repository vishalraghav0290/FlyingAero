# AeroTrack

A Flightradar24-style live flight tracker by [Vishal Raghav](https://github.com/vishalraghav0290), built with Next.js, TypeScript (strict), MapLibre GL and deck.gl, using free ADS-B data from [adsb.lol](https://adsb.lol) and [adsb.fi](https://adsb.fi).

Live at [areotrack.vishalraghav.dev](https://areotrack.vishalraghav.dev).

## Features

- **Live aircraft** rendered on the GPU with type-specific silhouettes sized by real airframe dimensions, altitude-offset shadows and emergency-squawk highlighting
- **Smooth movement**: a playout-delay animation engine interpolates real positions along great circles instead of snapping, with short dead reckoning and FR24-style estimated positions for briefly lost aircraft
- **Aircraft panel**: route (origin, destination, progress, time to go), flight phase, altitude profile, flight data, aircraft details and a photo slider
- **Trails** coloured by altitude, with dotted gaps for missing data and hover tooltips for each point
- **Map layers**: dark, light, streets and satellite styles, map brightness, airports, VOR/DME/NDB navaids, and borders as officially recognised by India
- **Credit-aware backend**: viewport requests are expanded to the largest area with the same OpenSky credit cost, cached and shared, and polling slows down as daily credits run low

## Getting started

Requires Node.js 22.18 or later. No API keys are needed with the default ADS-B source.

```bash
npm install
npm run dev                 # http://127.0.0.1:3000
npm run setup               # optional: refresh the aircraft database, airports, navaids and borders in data/
```

OpenSky is optional: copy `.env.example` to `.env`, add `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET`, and set `DATA_SOURCE=auto`.

Check your credentials with `npm run check:opensky`.

For production, run `npm run build` and then `npm start`. Type-check with `npx tsc --noEmit`. Requires Node.js 22.18+ because the scripts in `scripts/` run as TypeScript directly.

## Deployment notes

- The live feed, caches and aircraft database are kept in server memory, so the app works best as one long-running Node process.
- OpenSky blocks cloud provider IPs (Vercel, Cloudflare and Render were all tested). Browsers can't call it directly either, because its CORS policy only allows opensky-network.org. So the app has two data sources, chosen with `DATA_SOURCE`:
  - `adsb` (default): adsb.lol + adsb.fi, merged. Works from any host, including Vercel.
  - `auto`: OpenSky first; if it can't be reached or credits run out, it switches to ADS-B for 15 minutes.
  - `opensky`: OpenSky only. Good for running at home.
- With ADS-B, the world is covered as a grid of 250 NM cells that are cached and refreshed in the background, India first. Flight history comes from adsb.lol traces.
- `data/` (aircraft database, airports, navaids, borders) is committed, so a fresh clone works without `npm run setup`.
- `/api/health?probe=1` shows which sources are reachable from wherever the app runs. The unused OpenSky relays are kept in `legacy/` (see its README).
- The site is public. API requests are rate-limited per IP (240 per minute).

## Data sources

| Data | Source |
|---|---|
| Flight data | [OpenSky Network](https://opensky-network.org), [adsb.lol](https://adsb.lol) and [adsb.fi](https://adsb.fi) (ODbL) |
| Aircraft metadata | OpenSky aircraft database |
| Scheduled routes | [adsbdb](https://www.adsbdb.com) |
| Airports and navaids | [OurAirports](https://ourairports.com) (public domain) |
| Borders | [Natural Earth](https://www.naturalearthdata.com) |
| Basemaps | [CARTO](https://carto.com), with imagery from [Esri](https://www.esri.com) |
| Photos | [Planespotters.net](https://www.planespotters.net), [Wikimedia Commons](https://commons.wikimedia.org), [airport-data.com](https://www.airport-data.com) |

Photos are credited to their photographers and link back to the original pages. Navaid data is crowd-maintained and must not be used for navigation.

## License

MIT
