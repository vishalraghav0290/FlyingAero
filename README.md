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
- OpenSky may block cloud provider IP ranges (Vercel / AWS among them). `/api/health?probe=1` shows whether OpenSky is reachable from wherever the app is running. `worker/` contains an optional, key-protected Cloudflare Worker relay.
- On Vercel, set `SITE_PASSWORD` (and optionally `SITE_USER`). Without a password the site refuses to serve, because the API spends your OpenSky credits.

## Data sources

| Data | Source |
|---|---|
| Flight data | [OpenSky Network](https://opensky-network.org) |
| Aircraft metadata | OpenSky aircraft database |
| Scheduled routes | [adsbdb](https://www.adsbdb.com) |
| Airports and navaids | [OurAirports](https://ourairports.com) (public domain) |
| Borders | [Natural Earth](https://www.naturalearthdata.com) |
| Basemaps | [CARTO](https://carto.com), with imagery from [Esri](https://www.esri.com) |
| Photos | [Planespotters.net](https://www.planespotters.net), [Wikimedia Commons](https://commons.wikimedia.org), [airport-data.com](https://www.airport-data.com) |

Photos are credited to their photographers and link back to the original pages. Navaid data is crowd-maintained and must not be used for navigation.

## License

MIT
