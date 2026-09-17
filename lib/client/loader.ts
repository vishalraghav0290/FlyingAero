/**
 * Initial loading screen. The free ADS-B sources allow about one request per second, so the
 * server loads India cell by cell, from New Delhi outwards (see lib/server/adsb.ts warm-up).
 * The screen stays up until all of India is loaded and the map is ready, so the first view
 * is complete instead of filling in. It shows progress, can be skipped, and gives up after
 * MAX_WAIT_MS so a slow source never locks anyone out.
 */
import type { IndiaProgress } from '../server/adsb.ts';

/** Body of /api/warmup. */
interface WarmupProgress extends IndiaProgress {
  done: boolean;
}

export interface LoaderOptions {
  /** Resolves when the map has loaded. */
  mapReady: Promise<void>;
  /** Called once when the screen closes (India loaded, skipped or timed out). */
  onDone: () => void;
}

const POLL_MS = 1000;
// A cold server needs ~50 s for all of India (39 areas at ~1 request/s per free source);
// a warm one answers at once.
const MAX_WAIT_MS = 75_000;
const MAX_FAILURES = 3;
const FADE_MS = 400;

export function runLoader({ mapReady, onDone }: LoaderOptions): void {
  const el = document.getElementById('loader');
  if (!el || el.hidden) {
    onDone();
    return;
  }
  const fill = document.getElementById('loader-fill') as HTMLElement;
  const bar = document.getElementById('loader-bar') as HTMLElement;
  const sub = document.getElementById('loader-sub') as HTMLElement;
  const count = document.getElementById('loader-count') as HTMLElement;
  const skip = document.getElementById('loader-skip') as HTMLButtonElement;

  let finished = false;
  let mapLoaded = false;
  let indiaLoaded = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function finish(): void {
    if (finished) return;
    finished = true;
    clearTimeout(timer ?? undefined);
    el!.dataset.state = 'done';
    el!.setAttribute('aria-busy', 'false');
    setTimeout(() => (el!.hidden = true), FADE_MS);
    onDone();
  }

  // Shared links (a "#lat,lon/zoom" view or ?aircraft=) open somewhere specific: no wait.
  if (/^#-?\d/.test(location.hash) || new URLSearchParams(location.search).has('aircraft')) {
    el.hidden = true;
    finished = true;
    onDone();
    return;
  }

  skip.addEventListener('click', finish);
  mapReady.then(() => {
    mapLoaded = true;
    if (indiaLoaded) finish();
  });

  function show(p: WarmupProgress): void {
    const pct = p.cells ? Math.round((p.loaded / p.cells) * 100) : 100;
    fill.style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(pct));
    sub.textContent = p.loaded
      ? 'Spreading out from New Delhi. Free data sources load one area at a time.'
      : 'Starting from New Delhi…';
    count.textContent = p.cells
      ? `${p.loaded} of ${p.cells} areas · ${p.aircraft.toLocaleString()} aircraft`
      : 'Almost ready…';
  }

  async function poll(): Promise<void> {
    if (finished) return;
    try {
      const r = await fetch('/api/warmup', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const p = (await r.json()) as WarmupProgress;
      failures = 0;
      show(p);
      if (p.done) {
        indiaLoaded = true;
        if (mapLoaded) finish();
        else count.textContent = `${p.aircraft.toLocaleString()} aircraft loaded · drawing the map…`;
      }
    } catch {
      // the map has its own error handling; don't hold it hostage to the progress endpoint
      if (++failures >= MAX_FAILURES) return finish();
    }
    if (!indiaLoaded) timer = setTimeout(poll, POLL_MS);
    else mapReady.then(finish); // India is in; close as soon as the map is drawn
  }

  // after MAX_WAIT_MS close regardless (e.g. the map itself is slow to load)
  setTimeout(finish, MAX_WAIT_MS);
  poll();
}
