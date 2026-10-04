import type { Metadata, Viewport } from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'AeroTrack — Live Flight Tracker | Real-Time Aircraft Radar Map',
  description:
    'Track flights in real-time on an interactive 3D map. See live positions, altitude, speed, and trail history for thousands of aircraft worldwide. Free, fast, and open-source flight radar.',
  keywords: [
    'flight tracker',
    'live flight tracker',
    'flight radar',
    'aircraft tracker',
    'plane tracker',
    'live flight map',
    'ADS-B tracker',
    'real time flight tracking',
    'flight status',
    'airplane radar',
    'air traffic',
    'aviation tracker',
    'flight path tracker',
    'aircraft radar live',
    'plane spotter',
    'flightradar',
    'flight tracking map',
    'aerotrack',
  ],
  authors: [{ name: 'AeroTrack', url: 'https://aerotrack.live' }],
  creator: 'AeroTrack',
  publisher: 'AeroTrack',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'AeroTrack',
    title: 'AeroTrack — Live Flight Tracker | Real-Time Aircraft Radar Map',
    description:
      'Track flights in real-time on an interactive 3D map. See live positions, altitude, speed, and trail history for thousands of aircraft worldwide.',
    url: 'https://aerotrack.live',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AeroTrack — Live Flight Tracker',
    description:
      'Track thousands of flights in real-time on an interactive 3D map. Free and open-source aviation radar.',
    creator: '@aerotrack',
  },
  alternates: {
    canonical: 'https://aerotrack.live',
  },
  category: 'technology',
  classification: 'Aviation, Flight Tracking, Maps',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0c12' },
  ],
};

// ─── JSON-LD Structured Data ─────────────────────────────────────────────────

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'AeroTrack',
  url: 'https://aerotrack.live',
  description:
    'Real-time flight tracker with interactive 3D map. Track aircraft positions, altitude, speed, and flight trails worldwide using live ADS-B data.',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  featureList: [
    'Real-time flight tracking',
    'Interactive 3D map',
    'Aircraft type identification',
    'Flight trail visualization',
    'Global coverage',
    'Airline identification',
    'Emergency squawk detection',
  ],
  author: {
    '@type': 'Organization',
    name: 'AeroTrack',
    url: 'https://aerotrack.live',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <head>
        {/* Preconnect to external APIs for faster loading */}
        <link rel="preconnect" href="https://tiles.openfreemap.org" />
        <link rel="preconnect" href="https://api.adsb.lol" />
        <link rel="dns-prefetch" href="https://opendata.adsb.fi" />
        <link rel="dns-prefetch" href="https://api.airplanes.live" />

        {/* JSON-LD structured data for rich search results */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}