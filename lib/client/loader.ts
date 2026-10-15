/**
 * Initial loading screen, only rendered when the app runs on the free ADS-B sources
 * (adsb.lol / adsb.fi). They allow about one request per second, so a view fills in cell by
 * cell, starting from the middle of what the user is looking at. The screen follows that
 * progress (reported by every /api/states response) and closes once the cells around the
 * centre are in; the rest of the view streams in behind the map. OpenSky answers a whole area
 * in one request, so with OpenSky there is no loading screen at all.
 *
 * It can be skipped and gives up after MAX_WAIT_MS, so a slow source never locks anyone out.
 */
import type { FeedStatus } from './types.ts';

export interface Loader {
  /** Feed the latest feed status in; closes the screen when the view is loaded. */
  update(status: FeedStatus): void;
}

const MAX_WAIT_MS = 30_000;
const FADE_MS = 400;
// The server loads cells nearest the middle of the view first, so this many is enough to
// show the map.
const READY_CELLS = 8;

const NOOP: Loader = { update() {} };

export function runLoader(): Loader {
  const el = document.getElementById('loader');
  if (!el || el.hidden) return NOOP;

  // Shared links (a "#lat,lon/zoom" view or ?aircraft=) open somewhere specific: no wait.
  if (/^#-?\d/.test(location.hash) || new URLSearchParams(location.search).has('aircraft')) {
    el.hidden = true;
    return NOOP;
  }

  const fill = document.getElementById('loader-fill') as HTMLElement;
  const bar = document.getElementById('loader-bar') as HTMLElement;
  const sub = document.getElementById('loader-sub') as HTMLElement;
  const count = document.getElementById('loader-count') as HTMLElement;
  const skip = document.getElementById('loader-skip') as HTMLButtonElement;

  let finished = false;
  const timer = setTimeout(finish, MAX_WAIT_MS);

  function finish(): void {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    el!.dataset.state = 'done';
    el!.setAttribute('aria-busy', 'false');
    setTimeout(() => (el!.hidden = true), FADE_MS);
  }

  skip.addEventListener('click', finish);

  return {
    update(s: FeedStatus): void {
      if (finished) return;
      // don't hold the map hostage to a failing feed; it has its own error message
      if (!s.ok) {
        if (s.failing) finish();
        return;
      }
      const l = s.loading;
      if (!l) return finish();
      const pct = l.cells ? Math.round((l.loaded / l.cells) * 100) : 0;
      fill.style.width = `${pct}%`;
      bar.setAttribute('aria-valuenow', String(pct));
      sub.textContent = 'Loading aircraft around your view. Free data sources load one area at a time.';
      count.textContent = `${l.loaded} of ${l.cells} areas · ${s.count.toLocaleString()} aircraft`;
      if (l.loaded >= Math.min(l.cells, READY_CELLS)) finish();
    },
  };
}
