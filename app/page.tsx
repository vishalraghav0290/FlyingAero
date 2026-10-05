import type { Metadata } from 'next';
import FlightMap from '@/components/map/flightMap';

export const metadata: Metadata = {
  title: 'AeroTrack — Live Flight Tracker | Real-Time Aircraft Radar Map by Vishal Raghav',
  description:
    'Track flights in real-time on a beautiful interactive 3D map. View live positions, altitude, speed, heading, and flight trails for thousands of aircraft worldwide. Free, open-source flight tracker built by Vishal Raghav. No API key required.',
};

export default function Home() {
  return (
    <main
      id="aerotrack-app"
      role="application"
      aria-label="AeroTrack Live Flight Tracker by Vishal Raghav"
      className="flex min-h-screen flex-col items-center justify-between"
    >
      {/* SEO: Hidden accessible heading and rich description for crawlers */}
      <h1
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          borderWidth: 0,
        }}
      >
        AeroTrack — Live Flight Tracker &amp; Real-Time Aircraft Radar Map by Vishal Raghav
      </h1>
      <div
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          borderWidth: 0,
        }}
      >
        <p>
          AeroTrack is a free, open-source, real-time flight tracker that displays live aircraft
          positions on an interactive 3D map. Built by Vishal Raghav using Next.js, deck.gl, and
          MapLibre GL. Track commercial jets, cargo planes, helicopters, and light aircraft with
          altitude, speed, heading, and flight trail data. Powered by community-driven ADS-B
          receivers worldwide including OpenSky Network, adsb.lol, adsb.fi, and airplanes.live.
        </p>
        <h2>Key Features of AeroTrack</h2>
        <ul>
          <li>Real-time tracking of thousands of flights globally across 18 regions</li>
          <li>Smooth 60fps animation using dead reckoning and exponential rubber-banding</li>
          <li>Multiple ADS-B data sources with automatic failover</li>
          <li>70+ airline identification with country flags</li>
          <li>Aircraft model lookup — Boeing 737, Airbus A320, and more</li>
          <li>Emergency squawk detection (7500, 7600, 7700)</li>
          <li>Three map themes: Dark, Light, and Satellite</li>
          <li>Flight detail sidebar with altitude, speed, heading, and airline information</li>
          <li>No API key required — completely free and open source</li>
        </ul>
        <h2>About the Developer</h2>
        <p>
          AeroTrack was created by Vishal Raghav, a full stack developer specializing in real-time
          data visualization, Next.js, React, TypeScript, and WebGL technologies. View the source
          code on GitHub at github.com/vishalraghav0290/FlyingAero.
        </p>
      </div>
      <FlightMap />
    </main>
  );
}