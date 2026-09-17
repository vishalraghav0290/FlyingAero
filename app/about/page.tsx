import type { Metadata } from 'next';
import { AUTHOR, SITE } from '@/lib/site';
import { aboutGraph, jsonLd } from '@/lib/structuredData';

export const metadata: Metadata = {
  title: `About ${AUTHOR.name}`,
  description: `${AUTHOR.name} is a software engineer and the creator of ${SITE.name}, a free, open-source live flight tracker. ${AUTHOR.description}`,
  alternates: { canonical: '/about' },
  openGraph: { type: 'profile', url: '/about', title: `${AUTHOR.name}, creator of ${SITE.name}` },
};

// A real, crawlable text page. The home page is a full-screen WebGL map with almost no text,
// so this is the page that can rank for the author's name.
export default function About() {
  return (
    <div className="about">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(aboutGraph) }} />
      <main className="about__main">
        <p className="about__eyebrow">
          <a href="/">← Back to the live map</a>
        </p>
        <h1>{AUTHOR.name}</h1>
        <p className="about__lead">
          {AUTHOR.jobTitle} specializing in frontend, backend and DevOps. Creator of {SITE.name}.
        </p>

        <section aria-labelledby="about-aerotrack">
          <h2 id="about-aerotrack">{SITE.name}</h2>
          <p>
            {SITE.name} is a free, open-source live flight tracker that I built and maintain. It shows
            aircraft around the world in real time, with a focus on India: smooth animated positions,
            origin and destination with flight progress, altitude profiles, colour-coded trails, aircraft
            photos, airports, VOR/DME/NDB navaids and borders as officially recognised by India.
          </p>
          <p>
            It is built with Next.js, TypeScript, MapLibre GL and deck.gl, and uses community ADS-B data
            from adsb.lol and adsb.fi, so it needs no paid API.
          </p>
        </section>

        <section aria-labelledby="about-links">
          <h2 id="about-links">Find me</h2>
          <ul className="about__links">
            <li>
              <a href="/">{SITE.name}: live flight map</a>
            </li>
            <li>
              <a href={SITE.repo} rel="me noopener" target="_blank">
                Source code on GitHub (FlyingAero)
              </a>
            </li>
            <li>
              <a href={AUTHOR.github} rel="me noopener" target="_blank">
                GitHub: vishalraghav0290
              </a>
            </li>
            <li>
              <a href={AUTHOR.twitter} rel="me noopener" target="_blank">
                X / Twitter: {AUTHOR.twitterHandle}
              </a>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
