/**
 * Basemap styles. CARTO's three GL styles share layer ids, so the India border handling
 * (boundaries.js) works on all of them. Satellite = Esri World Imagery with CARTO's place
 * labels and borders on top, recoloured for photos.
 */
import { addProtocol } from 'maplibre-gl';

const CARTO = 'https://basemaps.cartocdn.com/gl/';
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';
const ESRI_IMAGERY = 'esri-fill://{z}/{y}/{x}';
const MAX_FALLBACK_LEVELS = 5;

/**
 * Esri answers with a grey "Map data not yet available" JPEG wherever it has no imagery at a
 * zoom level (rural areas above z17-18, oceans). That placeholder is byte-identical
 * everywhere, so we detect it and instead enlarge the matching quarter of the parent tile
 * (or grandparent, ...) that has real imagery, the way maps normally overzoom.
 */
let placeholder = null; // Promise<{ size, hash }>
async function digest(buf) {
  const h = await crypto.subtle.digest('SHA-1', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function referencePlaceholder() {
  // a z19 tile in the middle of the Pacific never has imagery
  placeholder ??= fetch(`${ESRI}19/258063/43776`)
    .then((r) => r.arrayBuffer())
    .then(async (b) => ({ size: b.byteLength, hash: await digest(b) }))
    .catch(() => ({ size: -1, hash: '' }));
  return placeholder;
}
async function isPlaceholder(buf) {
  const ref = await referencePlaceholder();
  return buf.byteLength === ref.size && (await digest(buf)) === ref.hash;
}

addProtocol('esri-fill', async (params, abortController) => {
  const [z, y, x] = params.url.slice('esri-fill://'.length).split('/').map(Number);
  const signal = abortController.signal;
  for (let up = 0; up <= MAX_FALLBACK_LEVELS && z - up >= 0; up++) {
    const pz = z - up;
    const px = x >> up;
    const py = y >> up;
    const res = await fetch(`${ESRI}${pz}/${py}/${px}`, { signal });
    if (!res.ok) throw new Error(`Esri ${res.status}`);
    const buf = await res.arrayBuffer();
    if (await isPlaceholder(buf)) continue;
    if (up === 0) return { data: buf };
    // crop the quarter (or 1/16, ...) of the parent that covers this tile and scale it up
    const bitmap = await createImageBitmap(new Blob([buf]));
    const part = bitmap.width / 2 ** up;
    const sx = (x - (px << up)) * part;
    const sy = (y - (py << up)) * part;
    const canvas = new OffscreenCanvas(256, 256);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, part, part, 0, 0, 256, 256);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    return { data: await blob.arrayBuffer() };
  }
  // nothing found at any level: transparent tile instead of the grey placeholder
  const empty = await new OffscreenCanvas(1, 1).convertToBlob({ type: 'image/png' });
  return { data: await empty.arrayBuffer() };
});

export const THEMES = [
  { id: 'dark', label: 'Dark', light: false, url: `${CARTO}dark-matter-gl-style/style.json` },
  { id: 'light', label: 'Light', light: true, url: `${CARTO}positron-gl-style/style.json` },
  { id: 'streets', label: 'Streets', light: true, url: `${CARTO}voyager-gl-style/style.json` },
  { id: 'satellite', label: 'Satellite', light: false, satellite: true, url: `${CARTO}dark-matter-gl-style/style.json` },
];

/** Current theme, read by layers that need light/dark-aware colours. */
export const theme = { current: THEMES[0] };

export const themeById = (id) => THEMES.find((t) => t.id === id) ?? THEMES[0];

const KEEP_ON_SATELLITE = /^(place_|watername_|boundary_country|boundary_state)/;

/** Returns a style object (or URL) for MapLibre's setStyle. */
export async function buildStyle(t) {
  if (!t.satellite) return t.url;
  const base = await (await fetch(t.url)).json();
  const layers = base.layers
    .filter((l) => KEEP_ON_SATELLITE.test(l.id))
    .map((l) => {
      const paint = { ...l.paint };
      if (l.type === 'symbol') {
        paint['text-color'] = l.id.startsWith('watername') ? '#a9d4ff' : '#ffffff';
        paint['text-halo-color'] = 'rgba(0,0,0,0.85)';
        paint['text-halo-width'] = 1.4;
      } else if (l.id === 'boundary_country_inner') {
        paint['line-color'] = 'rgba(255,255,255,0.8)';
      } else if (l.id === 'boundary_country_outline') {
        paint['line-color'] = 'rgba(0,0,0,0.45)';
      } else if (l.id === 'boundary_state') {
        paint['line-color'] = 'rgba(255,255,255,0.35)';
      }
      return { ...l, paint };
    });
  return {
    ...base,
    sources: {
      ...base.sources,
      satellite: {
        type: 'raster',
        tiles: [ESRI_IMAGERY],
        tileSize: 256,
        maxzoom: 19, // Esri's deepest level; beyond it MapLibre enlarges z19 tiles
        attribution: 'Imagery © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#0b0f14' } },
      { id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-fade-duration': 150 } },
      ...layers,
    ],
  };
}
