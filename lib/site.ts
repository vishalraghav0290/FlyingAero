// Site identity, shared by metadata, structured data, the manifest, robots and sitemap.
// NEXT_PUBLIC_SITE_URL overrides the canonical origin (for example on a preview domain).

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://areotrack.vishalraghav.dev').replace(/\/$/, '');

export const SITE = {
  name: 'AeroTrack',
  alternateNames: ['AeroTrack by Vishal Raghav', 'Areotrack', 'AeroTrack Flight Tracker', 'FlyingAero'],
  tagline: 'Live Flight Tracker',
  description:
    'AeroTrack is a free, open-source live flight tracker built by Vishal Raghav. Follow aircraft in real time on an interactive map with routes, altitude profiles, flight trails, aircraft photos, airports and navaids.',
  themeColor: '#222121',
  repo: 'https://github.com/vishalraghav0290/FlyingAero',
} as const;

export const AUTHOR = {
  name: 'Vishal Raghav',
  jobTitle: 'Software Engineer',
  description: 'Software Engineer specializing in Frontend, Backend, and DevOps.',
  github: 'https://github.com/vishalraghav0290',
  twitterHandle: '@vishalRaghav666',
  twitter: 'https://x.com/vishalRaghav666',
} as const;

/** Profiles that represent the author. Search engines use these to tie the name to this site. */
export const AUTHOR_PROFILES: readonly string[] = [AUTHOR.github, AUTHOR.twitter];

export const PERSON_ID = `${SITE_URL}/#vishal-raghav`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
