'use client';

import { useEffect } from 'react';
import type { SVGProps } from 'react';

const PlaneIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
  </svg>
);

/**
 * The live map UI.
 *
 * React renders this markup once. The map engine in lib/client (MapLibre + deck.gl,
 * aircraft animation, panel, menus) then drives these DOM nodes directly by id. The
 * component has no state, so React never re-renders over that work. Animating thousands
 * of aircraft at up to 60 fps through React state would be far slower.
 * The engine is loaded in an effect, so none of it runs during server rendering.
 */
export default function AeroTrackApp() {
  useEffect(() => {
    let cancelled = false;
    import('@/lib/client/main')
      .then((m) => m.start())
      .catch((err) => {
        if (cancelled) return;
        console.error('AeroTrack failed to start:', err);
        const toast = document.getElementById('toast');
        if (toast) {
          toast.textContent = 'The map could not start. Your browser may not support WebGL.';
          toast.dataset.kind = 'error';
          toast.hidden = false;
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div id="app">
      <main id="map" aria-label="Live flight map" />

      <header className="header" aria-label="Site header">
        <div className="header__gradient" aria-hidden="true" />
        <a className="header__logo" href="/" aria-label="AeroTrack home">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".6" />
            <path d="M12 12 L19.4 4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          </svg>
          <span className="header__wordmark">
            aero<strong>track</strong>
          </span>
        </a>
        <a className="header__byline" href="/about">
          by Vishal Raghav
        </a>
        <h1 className="visually-hidden">AeroTrack: live flight tracker by Vishal Raghav</h1>
        <div className="header__right">
          <span className="clock" aria-label="Current UTC time">
            <time id="utc-clock">--:--</time>
            <span className="clock__utc">UTC</span>
          </span>
        </div>
      </header>

      <nav className="map-controls" aria-label="Map controls">
        <button type="button" className="map-btn" id="zoom-in" title="Zoom in" aria-label="Zoom in">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button type="button" className="map-btn" id="zoom-out" title="Zoom out" aria-label="Zoom out">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <button type="button" className="map-btn" id="locate" title="Centre on my location" aria-label="Centre on my location">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 20.5 3.5 12.5 21l-1.6-7.9z" /></svg>
        </button>
        <button
          type="button"
          className="map-btn"
          id="style-toggle"
          title="Map style"
          aria-label="Map style"
          aria-expanded="false"
          aria-controls="style-menu"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 3 9 5-9 5-9-5z" />
            <path d="m3 12.5 9 5 9-5" />
            <path d="m3 16.5 9 5 9-5" />
          </svg>
        </button>
      </nav>

      <section id="style-menu" className="style-menu" aria-label="Map style" hidden>
        <h2 className="style-menu__title">Map style</h2>
        <div className="style-menu__grid" id="style-options" role="radiogroup" aria-label="Basemap" />
        <label className="style-menu__row" htmlFor="brightness">
          <span>
            Map brightness <output id="brightness-value" />
          </span>
          <input type="range" id="brightness" min="40" max="140" step="5" />
        </label>
        <label className="style-menu__row style-menu__row--inline">
          <input type="checkbox" id="show-airports" />
          <span>Show airports</span>
        </label>
        <label className="style-menu__row style-menu__row--inline">
          <input type="checkbox" id="show-navaids" />
          <span>Navaids (VOR / DME / NDB)</span>
        </label>
        <p className="style-menu__hint">Navaids show from zoom 6 (NDBs from 8). Community data, not for navigation.</p>
      </section>

      <div id="labels" className="labels" />
      <div id="trail-tooltip" className="map-tooltip" role="tooltip" hidden />

      <aside id="panel" className="panel" aria-labelledby="panel-callsign" hidden>
        <header className="panel__header">
          <div className="panel__heading">
            <h2 id="panel-callsign" className="panel__callsign" />
            <div className="panel__badges" id="panel-badges" />
          </div>
          <p className="panel__operator" id="panel-operator" />
          <button type="button" className="panel__close" id="panel-close" aria-label="Close aircraft details" title="Close (Esc)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19" /></svg>
          </button>
        </header>
        <div className="panel__alert" id="panel-alert" role="status" hidden />
        <section className="route" id="panel-route" aria-label="Route" hidden>
          <div className="route__ends">
            <div className="route__end">
              <span className="route__code" id="route-from-code" />
              <span className="route__city" id="route-from-city" />
            </div>
            <svg className="route__plane" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"
                transform="rotate(90 12 12)"
              />
            </svg>
            <div className="route__end route__end--to">
              <span className="route__code" id="route-to-code" />
              <span className="route__city" id="route-to-city" />
            </div>
          </div>
          <div
            className="route__bar"
            id="route-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Flight progress"
          >
            <div className="route__fill" id="route-fill" />
          </div>
          <div className="route__meta">
            <span id="route-flown" />
            <span id="route-eta" />
            <span id="route-remaining" />
          </div>
          <p className="route__note" id="route-note" />
        </section>
        <div className="panel__status" id="panel-status" />
        <div className="panel__body">
          <figure className="photo" id="panel-photo" data-state="empty" aria-roledescription="carousel" aria-label="Aircraft photos">
            <div className="photo__track" id="photo-track" />
            <div className="photo__placeholder" id="photo-placeholder">
              <PlaneIcon />
              <span id="photo-message">Loading photo…</span>
            </div>
            <button type="button" className="photo__nav photo__nav--prev" id="photo-prev" aria-label="Previous photo" hidden>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
            </button>
            <button type="button" className="photo__nav photo__nav--next" id="photo-next" aria-label="Next photo" hidden>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
            </button>
            <div className="photo__dots" id="photo-dots" role="tablist" aria-label="Choose photo" />
            <figcaption className="photo__credit">
              <span id="photo-credit" aria-live="polite" />
              <a id="photo-jetphotos" target="_blank" rel="noopener" hidden>
                JetPhotos ↗
              </a>
            </figcaption>
          </figure>
          <div className="panel__model" id="panel-model" />
          <section className="panel__graph" aria-label="Altitude profile">
            <div className="panel__graph-head">
              <span>Altitude profile</span>
              <span id="panel-graph-range" />
            </div>
            <svg
              id="panel-graph"
              viewBox="0 0 320 80"
              preserveAspectRatio="none"
              role="img"
              aria-label="Altitude over time"
            />
          </section>
          <section className="panel__section">
            <h3>Flight data</h3>
            <dl className="panel__grid" id="panel-flight" />
          </section>
          <section className="panel__section">
            <h3>Aircraft</h3>
            <dl className="panel__grid" id="panel-aircraft" />
          </section>
          <p className="panel__note" id="panel-note" />
        </div>
        <footer className="panel__actions">
          <button type="button" className="panel__action" id="panel-follow" aria-pressed="false">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="7.5" />
              <circle cx="12" cy="12" r="2" />
              <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
            </svg>
            <span>Follow</span>
          </button>
          <button type="button" className="panel__action" id="panel-center">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
            <span>Center</span>
          </button>
          <button type="button" className="panel__action" id="panel-share">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6" />
              <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
            </svg>
            <span>Share</span>
          </button>
        </footer>
      </aside>

      <footer className="statusbar" role="status" aria-live="polite">
        <span className="statusbar__dot" id="status-dot" aria-hidden="true" />
        <span id="status-text">Connecting…</span>
      </footer>

      <div id="slow-notice" className="slow-notice" role="status" hidden>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span id="slow-notice-text" />
        <button type="button" id="slow-notice-close" aria-label="Dismiss notice" title="Dismiss">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      <div id="toast" className="toast" role="alert" hidden />
    </div>
  );
}
