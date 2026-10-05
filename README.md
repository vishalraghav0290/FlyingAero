# ✈️ AeroTrack — Real-Time Global Flight Tracker

> **Built by [Vishal Raghav](https://github.com/vishalraghav0290)** — Full Stack Developer specializing in real-time data visualization, Next.js, React, TypeScript & WebGL

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-aerotrack.live-00d4ff?style=for-the-badge&labelColor=0a0c12)](https://aerotrack.live)
[![GitHub](https://img.shields.io/badge/GitHub-vishalraghav0290-181717?style=for-the-badge&logo=github)](https://github.com/vishalraghav0290)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Live-brightgreen?style=for-the-badge)]()

<p align="center">
  <img src="public/og-image.jpg" alt="AeroTrack — Real-Time Global Flight Tracker by Vishal Raghav" width="800" />
</p>

<p align="center">
  <strong>A live flight tracking web application that renders thousands of aircraft on a smooth, animated map in real time.</strong><br/>
  Built with Next.js 16, deck.gl, and MapLibre GL — no paid APIs, no API keys needed.
</p>

---

## 🎯 What is AeroTrack?

I'm **[Vishal Raghav](https://github.com/vishalraghav0290)**, and I wanted a flight tracker that actually looks good and doesn't charge $50/month for an API key. So I built one.

**AeroTrack** pulls live ADS-B data from multiple community-driven sources, animates aircraft positions at **60fps** using dead reckoning, and renders everything on a beautiful dark map with distinct aircraft silhouettes. Click any plane to see its flight details, trail history, airline info, and more.

It's not a toy demo — it tracks **thousands of real flights** across the globe, updates every 10 seconds, and handles provider failures gracefully behind the scenes.

**🌐 Live Demo → [aerotrack.live](https://aerotrack.live)**

---

## ✨ Features

### Real-Time Tracking
- **Live Global Coverage** — Tracks aircraft across **18 regions** worldwide (Americas, Europe, Middle East, India, East Asia, Southeast Asia, Oceania)
- **Smooth 60fps Animation** — Dead reckoning + exponential rubber-banding between API updates. No teleporting planes
- **Multiple Data Sources** — OpenSky Network as primary, with automatic fallback to adsb.lol, adsb.fi, and airplanes.live

### Aircraft Intelligence
- **Distinct Aircraft Icons** — Different silhouettes for jets, widebody airliners, helicopters, cargo planes, and light aircraft
- **70+ Airline Recognition** — Automatically identifies airlines from ICAO callsign prefixes with country flags
- **Aircraft Model Lookup** — Maps ICAO type codes (B738, A320, etc.) to readable names like "Boeing 737-800"
- **Emergency Detection** — Highlights flights squawking **7500** (hijack), **7600** (radio failure), or **7700** (general emergency)

### Visualization
- **Flight Trails** — Trails build continuously from when a flight is first detected. Click any plane to see its full path
- **Three Map Themes** — Dark, Light, and Satellite views via OpenFreeMap (no API key required)
- **Flight Detail Sidebar** — Altitude, speed, heading, vertical rate, squawk code, airline logo, and more
- **Filter by Type** — Toggle visibility for jets, helicopters, cargo, light aircraft, and emergencies

### Resilience
- **Smart Gap Recovery** — If a data provider returns fewer flights than expected, it automatically backfills from other sources
- **Position Continuity** — Rejects impossible position jumps (>150km between updates) to prevent visual glitches
- **Stale Cache Fallback** — Serves cached data for up to 60 seconds if all providers fail
- **Fully Responsive** — Works on desktop and mobile browsers

---

## 🛠 Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | Next.js 16 (App Router, Turbopack) | Server-side rendering, API routes, SEO |
| **Map Rendering** | MapLibre GL + react-map-gl | Free, open-source map rendering |
| **Data Visualization** | deck.gl (IconLayer, PathLayer, ScatterplotLayer) | GPU-accelerated layers for thousands of aircraft |
| **Map Tiles** | OpenFreeMap | Free, no API key needed |
| **Flight Data** | OpenSky Network + ADS-B Exchange community APIs | Live ADS-B transponder data |
| **Animation** | Custom dead reckoning engine | Smooth movement between 10s API updates |
| **Deployment** | Vercel | Edge network, instant deploys |
| **Language** | TypeScript | Type safety across the entire codebase |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Quick Start

```bash
# Clone the repo
git clone https://github.com/vishalraghav0290/FlyingAero.git
cd FlyingAero

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and you should see live flights within a few seconds.

**Live deployment:** [aerotrack.live](https://aerotrack.live)

### Environment Variables (Optional)

Create a `.env` file if you want higher OpenSky rate limits:

```env
OPENSKY_USERNAME=your_username
OPENSKY_PASSWORD=your_password
```

Without these, the app still works fine — it uses the anonymous OpenSky tier and falls back to ADS-B providers when rate limited.

---

## ⚙️ How It Works

### Data Pipeline

```
OpenSky Network ──┐
                   ├──→ Next.js API Route ──→ Server Cache (12s) ──→ Client
ADS-B Providers ──┘     (/api/flight)
  ├── adsb.lol
  ├── adsb.fi
  └── airplanes.live
```

1. The Next.js API route (`/api/flight`) tries OpenSky Network first
2. If OpenSky returns a rate limit error or fails, it seamlessly falls back to community ADS-B providers
3. For ADS-B, it queries 18 geographic regions distributed across 3 providers (round-robin)
4. If any region returns fewer flights than expected, it retries with alternative providers
5. Results are cached server-side for 12 seconds to reduce API load

### Animation Engine

The frontend doesn't just snap planes to new positions every 10 seconds. That would look terrible.

Instead, it runs a **60fps animation loop** that:

1. **Dead reckons** each aircraft forward based on its heading and speed
2. **Rubber-bands** the render position toward the API truth using exponential decay (half-life: 4s)
3. **Smoothly rotates** headings so turns look natural, not jerky
4. **Builds trails** continuously for every tracked flight (ring buffer, ~5 min history)
5. **Keeps flights alive** for 3 missed polls to prevent mass-disappearance

### Resilience Architecture

- Stale cache served for up to 60 seconds if all providers fail
- Mock flight data as absolute last resort (120 simulated aircraft)
- Position continuity checks reject >150km jumps between updates
- Forward-only guard prevents "snap backward" when stale data arrives

---

## 📁 Project Structure

```
├── app/
│   ├── api/
│   │   ├── flight/route.ts          # Main data endpoint
│   │   └── airline-image/route.ts   # Airline logo proxy
│   ├── layout.tsx                   # Root layout with SEO metadata + JSON-LD
│   ├── page.tsx                     # Landing page with semantic content
│   ├── sitemap.ts                   # Dynamic sitemap for search engines
│   ├── robots.ts                    # Crawler configuration
│   ├── manifest.ts                  # PWA manifest
│   ├── opengraph-image.jpg          # Social sharing preview
│   └── twitter-image.jpg            # Twitter card image
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
    ├── og-image.jpg                 # Social preview image
    └── assets/                      # Aircraft icon PNGs
```

---

## 🌐 Deployment

### Vercel (Recommended)

Push to GitHub and connect the repo to [Vercel](https://vercel.com). It works out of the box.

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

## 🤝 Contributing

Feel free to open issues or PRs. Some ideas if you want to contribute:

- More airline entries in the ICAO database
- Airport overlay layer (runways, taxiways)
- Flight path prediction based on known routes
- Historical playback mode
- WebSocket-based real-time updates instead of polling

---

## 📄 License

MIT — do whatever you want with it.

---

## 👨‍💻 About the Developer

**Vishal Raghav** is a full stack developer passionate about building real-time, data-intensive web applications. AeroTrack showcases expertise in:

- **Real-time data visualization** with deck.gl and WebGL
- **Next.js 16** with App Router and server-side rendering
- **TypeScript** for type-safe full-stack development
- **Animation engineering** with dead reckoning and interpolation
- **API resilience** with multi-provider failover and caching strategies

📧 **GitHub:** [github.com/vishalraghav0290](https://github.com/vishalraghav0290)
🌐 **Live Project:** [aerotrack.live](https://aerotrack.live)

---

<p align="center">
  <strong>Built with ❤️ by <a href="https://github.com/vishalraghav0290">Vishal Raghav</a></strong>
</p>
