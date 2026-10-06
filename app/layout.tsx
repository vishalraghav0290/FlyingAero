import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/500.css';
import '@fontsource/open-sans/600.css';
import '@fontsource/roboto-condensed/400.css';
import '@fontsource/roboto-condensed/700.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import { AUTHOR, SITE, SITE_URL } from '@/lib/site';

const TITLE = `${SITE.name} by ${AUTHOR.name} · ${SITE.tagline}`;

// Search-console verification tokens, set as Vercel env vars once the site is registered.
const verification: Metadata['verification'] = {
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
  ...(process.env.BING_SITE_VERIFICATION ? { other: { 'msvalidate.01': process.env.BING_SITE_VERIFICATION } } : {}),
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s · ${SITE.name} by ${AUTHOR.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: AUTHOR.name, url: `${SITE_URL}/about` }],
  creator: AUTHOR.name,
  publisher: AUTHOR.name,
  keywords: [
    'Vishal Raghav',
    'AeroTrack',
    'Areotrack',
    'AeroTrack Vishal Raghav',
    'live flight tracker',
    'flight radar',
    'flight tracker India',
    'ADS-B tracker',
    'open source flight tracker',
  ],
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: `${SITE.name} by ${AUTHOR.name}`,
    title: TITLE,
    description: SITE.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: SITE.description,
    creator: AUTHOR.twitterHandle,
    site: AUTHOR.twitterHandle,
  },
  category: 'travel',
  verification,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: SITE.themeColor,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* the map engine sets data-theme / has-panel on <body> at runtime */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
