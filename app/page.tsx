import type { Metadata } from 'next';
import FlightMap from '@/components/map/flightMap';

export const metadata: Metadata = {
  title: 'AeroTrack — Live Flight Tracker | Real-Time Aircraft Radar Map',
  description:
    'Track flights in real-time on a beautiful interactive 3D map. View live positions, altitude, speed, heading, and flight trails for thousands of aircraft worldwide. Powered by community ADS-B data.',
};

export default function Home() {
  return (
    <main
      id="aerotrack-app"
      role="application"
      aria-label="AeroTrack Live Flight Tracker"
      className="flex min-h-screen flex-col items-center justify-between"
    >
      {/* SEO: Hidden accessible heading and description for crawlers */}
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
        AeroTrack — Live Flight Tracker &amp; Real-Time Aircraft Radar Map
      </h1>
      <p
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
        AeroTrack is a free, real-time flight tracker that displays live aircraft
        positions on an interactive 3D map. Track commercial jets, cargo planes,
        helicopters, and light aircraft with altitude, speed, heading, and flight
        trail data. Powered by community-driven ADS-B receivers worldwide.
      </p>
      <FlightMap />
    </main>
  );
}