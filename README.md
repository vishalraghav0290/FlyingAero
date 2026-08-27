# SkyRadar

A Flightradar24-style live flight tracker built with Next.js, MapLibre GL and deck.gl, using data from the [OpenSky Network](https://opensky-network.org).

## Features

- **Live aircraft** rendered on the GPU with type-specific silhouettes sized by real airframe dimensions, altitude-offset shadows and emergency-squawk highlighting
- **Smooth movement**: a playout-delay animation engine interpolates real positions along great circles instead of snapping, with short dead reckoning and FR24-style estimated positions for briefly lost aircraft
- **Aircraft panel**: route (origin, destination, progress, time to go), flight phase, altitude profile, flight data, aircraft details and a photo slider
- **Trails** coloured by altitude, with dotted gaps for missing data and hover tooltips for each point
- **Map layers**: dark, light, streets and satellite styles, map brightness, airports, VOR/DME/NDB navaids, and borders as officially recognised by India
- **Credit-aware backend**: viewport requests are expanded to the largest area with the same OpenSky credit cost, cached and shared, and polling slows down as daily credits run low

## Getting started

Requires Node.js 20.9 or later and an OpenSky API client (OAuth2 client credentials).

```bash
npm install
cp .env.example .env        # add OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET
npm run setup               # downloads the aircraft database, airports, navaids and borders into data/
npm run dev                 # http://127.0.0.1:3000
```

Check your credentials with `npm run check:opensky`.

For production, run `npm run build` and then `npm start`.

## Deployment notes

- The live feed, caches and aircraft database are kept in server memory, so the app works best as one long-running Node process.
- OpenSky blocks cloud provider IPs (Vercel, Cloudflare and Render were all tested). Browsers can't call it directly either, because its CORS policy only allows opensky-network.org. So the app has two data sources, chosen with `DATA_SOURCE`:
  - `auto` (default): OpenSky first; if it can't be reached or credits run out, it switches to the ADS-B aggregators for 15 minutes.
  - `opensky`: OpenSky only. Good for running at home.
  - `adsb`: adsb.lol + adsb.fi only, merged. Use this on Vercel and other cloud hosts.
- With ADS-B, one request covers at most a 250 NM radius, so very zoomed-out views show only the centre. Trails then come only from positions the server has seen, because there's no flight-history endpoint.
- `/api/health?probe=1` shows which sources are reachable from wherever the app runs. `relay/` (Node) and `worker/` (Cloudflare) contain optional key-protected OpenSky relays.
- On Vercel, set `SITE_PASSWORD` (and optionally `SITE_USER`). Without a password the site refuses to serve, because the API spends your OpenSky credits.

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
