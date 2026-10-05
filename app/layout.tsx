import type { Metadata, Viewport } from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://aerotrack.vishalraghav.dev'),
  title: {
    default: 'AeroTrack — Live Flight Tracker | Real-Time Aircraft Radar Map by Vishal Raghav',
    template: '%s | AeroTrack by Vishal Raghav',
  },
  description:
    'AeroTrack is a free, open-source real-time flight tracker built by Vishal Raghav. Track thousands of live aircraft on an interactive 3D map with altitude, speed, heading, flight trails, airline identification, and emergency squawk detection. Powered by community ADS-B data.',
  keywords: [
    // Primary brand keywords
    'AeroTrack',
    'aerotrack.vishalraghav.dev',
    'vishalraghav.dev',
    'VISHALRAGHAV.DEV',
    'AERO',
    'AEROTRACK',
    'AEROTRACK.VISHALRAGHAV.DEV',
    'aerotrack.live',
    'aerotrack live',
    'aerotrack flight tracker',
    // Creator keywords — critical for personal SEO
    'Vishal Raghav',
    'vishal raghav developer',
    'vishal raghav github',
    'vishal raghav projects',
    'vishal raghav portfolio',
    'vishal raghav software engineer',
    'vishal raghav full stack developer',
    'vishalraghav0290',
    // Core product keywords
    'flight tracker',
    'live flight tracker',
    'flight radar',
    'aircraft tracker',
    'plane tracker',
    'live flight map',
    'real time flight tracking',
    'flight status',
    // Long-tail keywords
    'free flight tracker no api key',
    'open source flight tracker',
    'ADS-B flight tracker',
    'ADS-B tracker live',
    'adsb exchange viewer',
    'aircraft radar live map',
    'airplane radar real time',
    'live aircraft positions map',
    'global flight tracking map',
    'flight path visualization',
    'flight trail tracker',
    '3D flight map',
    'interactive flight map',
    'deck.gl flight tracker',
    'next.js flight tracker',
    'aviation tracker app',
    'plane spotter online',
    'flightradar alternative',
    'flightradar24 alternative free',
    'air traffic live map',
    // Tech keywords for developer searches
    'maplibre flight tracker',
    'react flight tracker',
    'typescript flight tracker',
    'dead reckoning aircraft animation',
    'opensky network viewer',
  ],
  authors: [
    { name: 'Vishal Raghav', url: 'https://github.com/vishalraghav0290' },
  ],
  creator: 'Vishal Raghav',
  publisher: 'Vishal Raghav',
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'AeroTrack by Vishal Raghav',
    title: 'AeroTrack — Live Flight Tracker | Real-Time Aircraft Radar Map',
    description:
      'Track flights in real-time on an interactive 3D map. See live positions, altitude, speed, and trail history for thousands of aircraft worldwide. Built by Vishal Raghav — free and open-source.',
    url: 'https://aerotrack.live',
    images: [
      {
        url: 'https://aerotrack.live/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'AeroTrack — Real-Time Global Flight Tracker by Vishal Raghav',
        type: 'image/jpeg',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AeroTrack — Live Flight Tracker by Vishal Raghav',
    description:
      'Track thousands of flights in real-time on an interactive 3D map. Free and open-source aviation radar built by Vishal Raghav.',
    creator: '@vishalraghav',
    images: [
      {
        url: 'https://aerotrack.live/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'AeroTrack — Real-Time Global Flight Tracker',
      },
    ],
  },
  alternates: {
    canonical: 'https://aerotrack.live',
  },
  category: 'technology',
  classification: 'Aviation, Flight Tracking, Maps, Open Source Software',
  // Add verification codes when you register with search engines
  verification: {
    google: 'YOUR_GOOGLE_SEARCH_CONSOLE_VERIFICATION_CODE',
    // yandex: 'YOUR_YANDEX_CODE',
    // yahoo: 'YOUR_YAHOO_CODE',
  },
  other: {
    'msapplication-TileColor': '#0a0c12',
    'application-name': 'AeroTrack',
    // Bing Webmaster Tools
    'msvalidate.01': 'YOUR_BING_VERIFICATION_CODE',
  },
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

// ─── JSON-LD Structured Data (Multiple Schemas) ─────────────────────────────

// Schema 1: WebApplication — tells Google this is a web app
const webAppSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  '@id': 'https://aerotrack.live/#webapp',
  name: 'AeroTrack',
  alternateName: ['AeroTrack Live', 'AeroTrack Flight Tracker'],
  url: 'https://aerotrack.live',
  description:
    'Real-time flight tracker with interactive 3D map. Track aircraft positions, altitude, speed, and flight trails worldwide using live ADS-B data. Built by Vishal Raghav.',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  browserRequirements: 'Requires JavaScript, WebGL support',
  softwareVersion: '1.0.0',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  featureList: [
    'Real-time flight tracking',
    'Interactive 3D map with deck.gl',
    'Aircraft type identification (jets, helicopters, cargo, light aircraft)',
    'Flight trail visualization',
    'Global coverage across 18 regions',
    '70+ airline identification with country flags',
    'Emergency squawk detection (7500, 7600, 7700)',
    'Smooth 60fps animation with dead reckoning',
    'Multiple data sources with automatic failover',
    'Three map themes (Dark, Light, Satellite)',
    'No API key required',
  ],
  screenshot: 'https://aerotrack.live/og-image.jpg',
  author: {
    '@type': 'Person',
    '@id': 'https://github.com/vishalraghav0290#person',
    name: 'Vishal Raghav',
    url: 'https://github.com/vishalraghav0290',
  },
  creator: {
    '@type': 'Person',
    name: 'Vishal Raghav',
    url: 'https://github.com/vishalraghav0290',
  },
  image: 'https://aerotrack.live/og-image.jpg',
  inLanguage: 'en',
};

// Schema 2: Person — THIS IS THE KEY for "Vishal Raghav" searches
const personSchema = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  '@id': 'https://github.com/vishalraghav0290#person',
  name: 'Vishal Raghav',
  alternateName: ['vishalraghav0290', 'Vishal Raghav Developer'],
  url: 'https://github.com/vishalraghav0290',
  sameAs: [
    'https://github.com/vishalraghav0290',
    'https://aerotrack.live',
  ],
  jobTitle: 'Full Stack Developer',
  knowsAbout: [
    'Next.js',
    'React',
    'TypeScript',
    'JavaScript',
    'Node.js',
    'WebGL',
    'deck.gl',
    'MapLibre',
    'Real-time data visualization',
    'Aviation technology',
    'ADS-B',
    'Flight tracking systems',
    'Full stack development',
    'Open source software',
  ],
  makesOffer: {
    '@type': 'Offer',
    itemOffered: {
      '@type': 'WebApplication',
      name: 'AeroTrack',
      url: 'https://aerotrack.live',
    },
  },
};

// Schema 3: SoftwareSourceCode — links repo to the person
const sourceCodeSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareSourceCode',
  '@id': 'https://github.com/vishalraghav0290/FlyingAero#code',
  name: 'AeroTrack (FlyingAero)',
  alternateName: 'FlyingAero',
  description:
    'Open-source real-time flight tracker built with Next.js, deck.gl, and MapLibre GL. Tracks thousands of live aircraft with smooth 60fps animation, dead reckoning, and multi-provider failover.',
  codeRepository: 'https://github.com/vishalraghav0290/FlyingAero',
  url: 'https://aerotrack.live',
  programmingLanguage: ['TypeScript', 'JavaScript', 'CSS'],
  runtimePlatform: 'Node.js',
  targetProduct: {
    '@type': 'WebApplication',
    name: 'AeroTrack',
    url: 'https://aerotrack.live',
  },
  author: {
    '@type': 'Person',
    '@id': 'https://github.com/vishalraghav0290#person',
    name: 'Vishal Raghav',
    url: 'https://github.com/vishalraghav0290',
  },
  license: 'https://opensource.org/licenses/MIT',
  dateCreated: '2026-10-01',
  dateModified: new Date().toISOString().split('T')[0],
  isAccessibleForFree: true,
};

// Schema 4: WebSite — enables sitelinks search box in Google
const webSiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': 'https://aerotrack.live/#website',
  name: 'AeroTrack',
  alternateName: 'AeroTrack Flight Tracker',
  url: 'https://aerotrack.live',
  description:
    'Free, real-time global flight tracker. Track live aircraft positions on an interactive 3D map.',
  publisher: {
    '@type': 'Person',
    '@id': 'https://github.com/vishalraghav0290#person',
    name: 'Vishal Raghav',
  },
  inLanguage: 'en',
};

// Schema 5: BreadcrumbList — structured navigation for Google
const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'AeroTrack',
      item: 'https://aerotrack.live',
    },
  ],
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
        <link rel="dns-prefetch" href="https://github.com" />

        {/* JSON-LD structured data — multiple schemas for maximum rich result coverage */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(sourceCodeSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}