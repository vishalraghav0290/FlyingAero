# ✈️ AeroTrack — Real-Time Global Flight Tracker

A live flight tracking web app that renders thousands of aircraft on a smooth, animated map in real time. Built with Next.js, deck.gl, and MapLibre GL — no paid APIs, no API keys needed to get started.

**Live Demo →** [aerotrack.live](https://aerotrack.live)

![AeroTrack Screenshot](https://img.shields.io/badge/status-live-brightgreen) ![Next.js](https://img.shields.io/badge/Next.js-16-black) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## What is this?

I wanted a flight tracker that actually looks good and doesn't charge me $50/month for an API key. So I built one.

AeroTrack pulls live ADS-B data from multiple community-driven sources, animates aircraft positions at 60fps using dead reckoning, and renders everything on a beautiful dark map with distinct aircraft silhouettes. Click any plane to see its flight details, trail history, airline info, and more.

It's not a toy demo — it tracks **thousands of real flights** across the globe, updates every 10 seconds, and handles provider failures gracefully behind the scenes.

---

## Features

- **Live Global Coverage** — Tracks aircraft across 18 regions worldwide (Americas, Europe, Middle East, India, East Asia, Southeast Asia, Oceania)
- **Smooth 60fps Animation** — Dead reckoning + exponential rubber-banding between API updates. No teleporting planes
- **Multiple Data Sources** — OpenSky Network as primary, with automatic fallback to adsb.lol, adsb.fi, and airplanes.live
- **Distinct Aircraft Icons** — Different silhouettes for jets, widebody airliners, helicopters, cargo planes, and light aircraft
- **Flight Trails** — Trails build continuously from when a flight is first detected. Click any plane to see its full path
- **70+ Airline Recognition** — Automatically identifies airlines from ICAO callsign prefixes with country flags
- **Aircraft Model Lookup** — Maps ICAO type codes (B738, A320, etc.) to readable names like "Boeing 737-800"
- **Emergency Detection** — Highlights flights squawking 7500, 7600, or 7700
- **Smart Gap Recovery** — If a data provider returns fewer flights than expected, it automatically backfills from other sources
- **Position Continuity** — Rejects impossible position jumps (>150km between updates) to prevent visual glitches
- **Three Map Themes** — Dark, Light, and Satellite views via OpenFreeMap (no API key required)
- **Flight Detail Sidebar** — Altitude, speed, heading, vertical rate, squawk code, airline logo, and more
- **Filter by Type** — Toggle visibility for jets, helicopters, cargo, light aircraft, and emergencies
- **Fully Responsive** — Works on desktop and mobile browsers

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Map Rendering | MapLibre GL + react-map-gl |
| Data Visualization | deck.gl (IconLayer, PathLayer, ScatterplotLayer) |
| Map Tiles | OpenFreeMap (free, no key needed) |
| Flight Data | OpenSky Network + ADS-B Exchange community APIs |
| Animation | Custom dead reckoning engine with heading smoothing |
| Deployment | Vercel |
| Language | TypeScript |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
# Clone the repo
git clone https://github.com/vishalraghav0290/FlyingAero.git
cd FlyingAero

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [https://flying-aero.vercel.app](https://flying-aero.vercel.app) and you should see live flights within a few seconds.

### Environment Variables (Optional)

Create a `.env` file in the root if you want to use OpenSky with authentication for higher rate limits:

```env
OPENSKY_USERNAME=your_username
OPENSKY_PASSWORD=your_password
```

Without these, the app still works fine — it just uses the anonymous OpenSky tier and falls back to ADS-B providers when rate limited.

---

## How It Works

### Data Pipeline

1. The Next.js API route (`/api/flight`) tries OpenSky Network first
2. If OpenSky returns a rate limit error or fails, it seamlessly falls back to community ADS-B providers
3. For ADS-B, it queries 18 geographic regions distributed across 3 providers (round-robin to avoid hammering any single source)
4. If any region returns fewer flights than expected, it retries with alternative providers
5. Results are cached server-side for 12 seconds to reduce API load

### Animation Engine

The frontend doesn't just snap planes to new positions every 10 seconds. That would look terrible.

Instead, it runs a 60fps animation loop that:

1. **Dead reckons** each aircraft forward based on its heading and speed
2. **Rubber-bands** the render position toward the API truth using exponential decay (half-life: 4s)
3. **Smoothly rotates** headings so turns look natural, not jerky
4. **Builds trails** continuously for every tracked flight (ring buffer, ~5 min history)
5. **Keeps flights alive** for 3 missed polls to prevent mass-disappearance when different providers return different subsets

### Resilience

- Stale cache served for up to 60 seconds if all providers fail
- Mock flight data as absolute last resort (120 simulated aircraft)
- Position continuity checks reject >150km jumps between updates
- Forward-only guard prevents "snap backward" when stale data arrives

---

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── flight/route.ts          # Main data endpoint
│   │   └── airline-image/route.ts   # Airline logo proxy
│   ├── layout.tsx                   # Root layout with SEO metadata
│   ├── page.tsx                     # Landing page
│   ├── sitemap.ts                   # Dynamic sitemap
│   └── robots.ts                    # Crawler config
├── components/
│   ├── map/
│   │   └── flightMap.tsx            # Main map component (deck.gl layers)
│   └── ui/
│       └── FlightSidebar.tsx        # Flight detail panel
├── lib/
│   ├── api/
│   │   └── opensky.ts              # Multi-source data fetching logic
│   └── flight/
│       ├── types.ts                 # TypeScript interfaces
│       ├── useAnimatedFlights.ts    # Animation engine hook
│       └── angleSmoother.ts         # Heading unwrapping utility
└── public/
    └── assets/                      # Aircraft icon PNGs
```

---

## Deployment

### Vercel (Recommended)

Just push to GitHub and connect the repo to Vercel. It works out of the box — no special config needed.

```bash
npm run build   # verify build passes
git push        # deploy
```

### Self-Hosted

```bash
npm run build
npm start
```

Runs on port 3000 by default.

---

## Contributing

Feel free to open issues or PRs. Some ideas if you want to contribute:

- More airline entries in the ICAO database
- Airport overlay layer (runways, taxiways)
- Flight path prediction based on known routes
- Historical playback mode
- WebSocket-based real-time updates instead of polling

---

## License

MIT — do whatever you want with it.

---

Built by [Vishal Raghav](https://github.com/vishalraghav0290)
