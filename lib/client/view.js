// Initial map view: New Delhi every time the site opens. A shared link with an explicit
// "#lat,lon/zoom" (Google zoom scale, FR24 style) still opens at that spot.
const HOME = { lat: 28.56, lon: 77.1, zoom: 7 }; // New Delhi (IGI airport area)

const valid = (v) => v && Math.abs(v.lat) <= 85 && Math.abs(v.lon) <= 180 && v.zoom >= 2 && v.zoom <= 20;

export function initialView() {
  const m = location.hash.match(/^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (m) {
    const v = { lat: Number(m[1]), lon: Number(m[2]), zoom: Number(m[3]) };
    if (valid(v)) return v;
  }
  return HOME;
}

/** Current view as a shareable "#lat,lon/zoom" fragment (not written automatically). */
export function viewHash(map) {
  const c = map.getCenter().wrap();
  return `#${c.lat.toFixed(2)},${c.lng.toFixed(2)}/${(map.getZoom() + 1).toFixed(1)}`;
}

// Kept for main.js: the view is no longer remembered, so reopening always shows Delhi.
export function saveView() {}
