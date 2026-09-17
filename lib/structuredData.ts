// schema.org JSON-LD. One linked @graph so search engines see that the website, the app and
// the source code are all by the same Person (Vishal Raghav).
import { AUTHOR, AUTHOR_PROFILES, PERSON_ID, SITE, SITE_URL, WEBSITE_ID } from './site.ts';

type JsonLd = Record<string, unknown>;

export const person: JsonLd = {
  '@type': 'Person',
  '@id': PERSON_ID,
  name: AUTHOR.name,
  url: `${SITE_URL}/about`,
  jobTitle: AUTHOR.jobTitle,
  description: AUTHOR.description,
  sameAs: AUTHOR_PROFILES,
  knowsAbout: ['Next.js', 'React', 'TypeScript', 'Node.js', 'WebGL', 'deck.gl', 'MapLibre', 'ADS-B', 'DevOps'],
};

const website: JsonLd = {
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  url: SITE_URL,
  name: SITE.name,
  alternateName: SITE.alternateNames,
  description: SITE.description,
  inLanguage: 'en',
  author: { '@id': PERSON_ID },
  publisher: { '@id': PERSON_ID },
  creator: { '@id': PERSON_ID },
};

const webApp: JsonLd = {
  '@type': 'WebApplication',
  '@id': `${SITE_URL}/#app`,
  name: SITE.name,
  url: SITE_URL,
  description: SITE.description,
  applicationCategory: 'TravelApplication',
  operatingSystem: 'Any (web browser with WebGL)',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  image: `${SITE_URL}/opengraph-image.jpg`,
  author: { '@id': PERSON_ID },
  creator: { '@id': PERSON_ID },
  isPartOf: { '@id': WEBSITE_ID },
};

const sourceCode: JsonLd = {
  '@type': 'SoftwareSourceCode',
  '@id': `${SITE.repo}#code`,
  name: `${SITE.name} (FlyingAero)`,
  codeRepository: SITE.repo,
  programmingLanguage: 'TypeScript',
  runtimePlatform: 'Node.js',
  license: 'https://opensource.org/licenses/MIT',
  author: { '@id': PERSON_ID },
  targetProduct: { '@id': `${SITE_URL}/#app` },
};

/** Graph for the home page (the live map). */
export const homeGraph: JsonLd = {
  '@context': 'https://schema.org',
  '@graph': [website, webApp, sourceCode, person],
};

/** Graph for /about: a ProfilePage whose main entity is the author. */
export const aboutGraph: JsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'ProfilePage',
      '@id': `${SITE_URL}/about#page`,
      url: `${SITE_URL}/about`,
      name: `${AUTHOR.name}, creator of ${SITE.name}`,
      isPartOf: { '@id': WEBSITE_ID },
      mainEntity: { '@id': PERSON_ID },
      about: { '@id': PERSON_ID },
    },
    website,
    person,
  ],
};

/** Serialises JSON-LD for a <script> tag; escaping `<` keeps the content from closing the tag. */
export function jsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
