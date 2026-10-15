import type { Map as MapLibreMap } from 'maplibre-gl';
import type { MapView } from './types.ts';

// Where the map opens, first match wins:
//  1. a shared link with an explicit "#lat,lon/zoom" (Google zoom scale, FR24 style)
//  2. the view the user left the site with (remembered in this browser)
//  3. the visitor's approximate location (/api/geo, from the host's IP headers)
//  4. New Delhi, when nothing else is known (for example local development)
const HOME: MapView = { lat: 28.56, lon: 77.1, zoom: 7 }; // New Delhi (IGI airport area)
const REGION_ZOOM = 7; // roughly a region, since an IP address only gives a city-level guess
const STORAGE_KEY = 'aerotrack.view.v1';
const GEO_TIMEOUT_MS = 1500; // never hold the map back for the location guess

const valid = (v: MapView | null | undefined): v is MapView =>
  !!v && Number.isFinite(v.lat) && Number.isFinite(v.lon) && Number.isFinite(v.zoom) &&
  Math.abs(v.lat) <= 85 && Math.abs(v.lon) <= 180 && v.zoom >= 2 && v.zoom <= 20;

function fromHash(): MapView | null {
  const m = location.hash.match(/^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const v = { lat: Number(m[1]), lon: Number(m[2]), zoom: Number(m[3]) };
  return valid(v) ? v : null;
}

function fromStorage(): MapView | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as MapView | null;
    return valid(v) ? v : null;
  } catch {
    return null;
  }
}

async function fromVisitorLocation(): Promise<MapView | null> {
  try {
    const res = await fetch('/api/geo', { cache: 'no-store', signal: AbortSignal.timeout(GEO_TIMEOUT_MS) });
    if (!res.ok) return null;
    const g = (await res.json()) as { lat?: number; lon?: number };
    const v = { lat: Number(g.lat), lon: Number(g.lon), zoom: REGION_ZOOM };
    return g.lat == null || g.lon == null || !valid(v) ? null : v;
  } catch {
    return null;
  }
}

export async function initialView(): Promise<MapView> {
  return fromHash() ?? fromStorage() ?? (await fromVisitorLocation()) ?? HOME;
}

/** Current view as a shareable "#lat,lon/zoom" fragment (not written automatically). */
export function viewHash(map: MapLibreMap): string {
  const c = map.getCenter().wrap();
  return `#${c.lat.toFixed(2)},${c.lng.toFixed(2)}/${(map.getZoom() + 1).toFixed(1)}`;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Remember where the user is looking, so the next visit opens there. */
export function saveView(map: MapLibreMap): void {
  clearTimeout(saveTimer ?? undefined);
  saveTimer = setTimeout(() => {
    const c = map.getCenter().wrap();
    const v: MapView = { lat: +c.lat.toFixed(3), lon: +c.lng.toFixed(3), zoom: +(map.getZoom() + 1).toFixed(2) };
    if (!valid(v)) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    } catch {
      // storage full or blocked: the view just isn't remembered
    }
  }, 500);
}
