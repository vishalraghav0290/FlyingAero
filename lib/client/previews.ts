/**
 * Style thumbnails rendered from the real map styles. CARTO's raster tiles now need an API
 * key (that was the "API key required" image), but the vector styles we use don't. One
 * hidden 240x150 MapLibre map renders each style once; results are cached in localStorage.
 */
import { Map as MapLibreMap } from 'maplibre-gl';
import type { MapOptions } from 'maplibre-gl';
import { THEMES, buildStyle } from './mapstyles.ts';
import { applyIndiaView } from './boundaries.ts';

/** Id of a basemap theme (see THEMES in mapstyles.ts). */
export type PreviewThemeId = (typeof THEMES)[number]['id'];

/** Receives each rendered thumbnail as a JPEG data URL. */
export type PreviewReady = (themeId: PreviewThemeId, dataUrl: string) => void;

const KEY = 'aerotrack.previews.v1';
const VIEW: Pick<MapOptions, 'center' | 'zoom'> = { center: [78.5, 23.5], zoom: 3.4 }; // South Asia, matches the India border work
const W = 240;
const H = 150;

/** Theme id -> data URL. */
function loadCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

/** Calls onReady(themeId, dataUrl) for every style, from cache or freshly rendered. */
export async function renderPreviews(onReady: PreviewReady): Promise<void> {
  const cache = loadCache();
  const missing = THEMES.filter((t) => {
    if (cache[t.id]) onReady(t.id, cache[t.id]);
    return !cache[t.id];
  });
  if (!missing.length) return;

  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${W}px;height:${H}px;pointer-events:none`;
  host.setAttribute('aria-hidden', 'true');
  document.body.append(host);
  const firstStyle = await buildStyle(missing[0]);
  const map = new MapLibreMap({
    container: host,
    style: firstStyle,
    ...VIEW,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    pixelRatio: 2,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });

  try {
    for (const [i, t] of missing.entries()) {
      const styleLoaded = new Promise((r) => map.once('style.load', r));
      if (i > 0) map.setStyle(await buildStyle(t), { diff: false });
      await styleLoaded;
      await applyIndiaView(map);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 15_000); // give up on slow tiles
        map.once('idle', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      const url = map.getCanvas().toDataURL('image/jpeg', 0.82);
      cache[t.id] = url;
      onReady(t.id, url);
    }
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('Style previews:', (err as Error).message);
  } finally {
    map.remove();
    host.remove();
  }
}
