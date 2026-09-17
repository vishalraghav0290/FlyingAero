# Legacy

Code that is no longer used by the app but is kept for reference. Nothing here is built or deployed. Both relays are TypeScript (`server.ts`, `relay.ts`); the Node one runs directly with Node's built-in type stripping (Node 22.18+), and Wrangler bundles `.ts` itself.

## relay/

A small Node server that forwarded OpenSky API calls (token + `/states/all`), protected by a shared key. It was meant to run on a host whose IPs OpenSky doesn't block (Koyeb, Render) so the Vercel app could reach OpenSky through it.

Why it's unused: Koyeb's free tier closed, and OpenSky blocks Render as well. The app now gets its data from adsb.lol + adsb.fi instead. The app still honours `OPENSKY_RELAY_URL` / `OPENSKY_RELAY_KEY` if you run this relay somewhere OpenSky accepts (for example a home server) and set `DATA_SOURCE=opensky` or `auto`.

## worker/

The same relay as a Cloudflare Worker (`wrangler deploy`).

Why it's unused: OpenSky blocks Cloudflare's IPs too, so the worker was deleted from Cloudflare.
