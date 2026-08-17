/**
 * Shows international borders as officially recognised by India.
 *
 * The CARTO basemap (OpenStreetMap) draws the de-facto Line of Control / Line of Actual
 * Control and Chinese claim lines. Here:
 *  - zoom >= 5: basemap borders tagged `disputed` inside South Asia are hidden, as are the
 *    Pakistan-China lines in Gilgit-Baltistan / Shaksgam, then India's official outline
 *    (Natural Earth "India point of view") is drawn in the same style;
 *  - zoom < 5: the basemap's generalised borders can't be filtered reliably, so they are
 *    replaced worldwide by Natural Earth 1:50m borders from the same point of view.
 */
const SWITCH_ZOOM = 5;
const box = ({ w, s, e, n }) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const SOUTH_ASIA = box({ w: 66, s: 26, e: 98, n: 38 });
const GILGIT_SHAKSGAM = box({ w: 72.4, s: 34, e: 81.1, n: 37.3 });
const BASEMAP_LAYERS = ['boundary_country_outline', 'boundary_country_inner'];

const isPair = (a, b) => [
  'any',
  ['all', ['==', ['coalesce', ['get', 'adm0_l'], ''], a], ['==', ['coalesce', ['get', 'adm0_r'], ''], b]],
  ['all', ['==', ['coalesce', ['get', 'adm0_l'], ''], b], ['==', ['coalesce', ['get', 'adm0_r'], ''], a]],
];

let dataPromise = null;

export async function applyIndiaView(map) {
  let data;
  try {
    dataPromise ??= fetch('/api/boundaries/in').then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    data = await dataPromise;
  } catch (err) {
    dataPromise = null;
    console.warn('India boundaries unavailable:', err.message);
    return;
  }
  if (!map.isStyleLoaded()) await new Promise((r) => map.once('idle', r));

  const filter = [
    'all',
    ['==', ['get', 'admin_level'], 2],
    ['==', ['coalesce', ['get', 'maritime'], 0], 0],
    ['!', ['all', ['==', ['coalesce', ['get', 'disputed'], 0], 1], ['within', SOUTH_ASIA]]],
    ['!', ['all', isPair('PAK', 'CHN'), ['within', GILGIT_SHAKSGAM]]],
  ];

  if (map.getSource('borders-in')) return; // already applied to this style
  map.addSource('borders-in', { type: 'geojson', data, tolerance: 0.2 });
  for (const id of BASEMAP_LAYERS) {
    const layer = map.getLayer(id);
    if (!layer) continue;
    map.setFilter(id, filter);
    map.setLayerZoomRange(id, Math.max(layer.minzoom ?? 0, SWITCH_ZOOM), layer.maxzoom ?? 24);
    const style = map.getStyle().layers.find((l) => l.id === id);
    const next = map.getStyle().layers[map.getStyle().layers.findIndex((l) => l.id === id) + 1]?.id;
    const add = (suffix, kinds, minzoom, maxzoom) =>
      map.addLayer(
        {
          id: `${id}-in-${suffix}`,
          type: 'line',
          source: 'borders-in',
          minzoom,
          maxzoom,
          filter: ['match', ['get', 'kind'], kinds, true, false],
          layout: style.layout ?? {},
          paint: style.paint ?? {},
        },
        next,
      );
    add('low', ['world', 'india'], 0, SWITCH_ZOOM);
    add('high', ['india', 'disputed-in'], SWITCH_ZOOM, 24);
  }
}
