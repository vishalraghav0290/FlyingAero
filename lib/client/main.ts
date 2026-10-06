import { MapboxOverlay } from '@deck.gl/mapbox';
import { Map as MapLibreMap, AttributionControl, setWorkerUrl } from 'maplibre-gl';
import { AircraftStore, EMERGENCY_SQUAWKS } from './store.ts';
import { AircraftLayers, MAX_ANIMATED_ICONS } from './layers.ts';
import { Feed } from './feed.ts';
import { animationTickMs } from './animation.ts';
import { SHAPE_FRAMES } from './sprites.ts';
import { initialView, saveView } from './view.ts';
import { Selection } from './selection.ts';
import { AirportLayer } from './airports.ts';
import { applyIndiaView } from './boundaries.ts';
import { showTooltip, hideTooltip } from './tooltip.ts';
import { theme, themeById, buildStyle } from './mapstyles.ts';
import { initStyleMenu, applyBrightness } from './stylemenu.ts';
import { settings } from './settings.ts';
import { NavaidLayer, formatFrequency } from './navaids.ts';
import { runLoader } from './loader.ts';
import type { PickingInfo } from '@deck.gl/core';
import type { Aircraft, FeedStatus, ToastKind } from './types.ts';

/** Debug handle exposed as `window.aerotrack`. */
export interface AeroTrackDebug {
  map: MapLibreMap;
  store: AircraftStore;
  layers: AircraftLayers;
  overlay: MapboxOverlay;
  selection: Selection;
  airports: AirportLayer;
}

declare global {
  interface Window {
    aerotrack?: AeroTrackDebug;
  }
}

/**
 * Boots the live map. The map, feed, timers and listeners live for the whole page, so this
 * runs once per page load (React Strict Mode calls effects twice in development).
 */
let started: Promise<void> | null = null;
export function start(): Promise<void> {
  started ??= run();
  return started;
}

async function run(): Promise<void> {
  // MapLibre's worker can't be resolved relative to the bundled module; it's copied to
  // /public by scripts/copy-maplibre-worker.js (npm postinstall).
  setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.mjs');

  theme.current = themeById(settings.mapStyle);
  document.body.dataset.theme = theme.current.light ? 'light' : 'dark';
  const initialStyle = await buildStyle(theme.current);
  const FRAME_INTERVAL_MS = 250; // FR24 advances animated sprite frames every 250 ms

  // Elements rendered by AeroTrackApp; they're always in the markup.
  const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

  // ---------- Map ----------
  const view = initialView();
  const map = new MapLibreMap({
    container: 'map',
    style: initialStyle,
    center: [view.lon, view.lat],
    zoom: view.zoom - 1, // MapLibre zoom = Google zoom - 1
    minZoom: 1,
    maxZoom: 18,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    attributionControl: false,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(
    new AttributionControl({
      compact: true,
      customAttribution:
        'Flight data © <a href="https://opensky-network.org" target="_blank" rel="noopener">The OpenSky Network</a>, <a href="https://adsb.lol" target="_blank" rel="noopener">adsb.lol</a> and <a href="https://adsb.fi" target="_blank" rel="noopener">adsb.fi</a> (ODbL)',
    }),
    'bottom-right',
  );

  const googleZoom = () => map.getZoom() + 1;

  // ---------- Aircraft ----------
  const store = new AircraftStore();
  const layers = new AircraftLayers(store);
  const airports = new AirportLayer({
    onHover: (a) => {
      if (!a) return hideTooltip();
      const place = [a.city, a.country].filter(Boolean).join(', ');
      showTooltip(
        map,
        [
          [null, `${a.name}`],
          ['Code', [a.iata, a.icao].filter(Boolean).join(' / ')],
          ...(place ? [['Location', place]] : []),
          ['Elevation', `${a.elevationFt.toLocaleString()} ft`],
        ],
        [a.longitude, a.latitude],
        26,
      );
    },
  });
  airports.load().then(() => render());

  const NAVAID_NAMES: Record<string, string> = { VOR: 'VOR', 'VOR-DME': 'VOR/DME', VORTAC: 'VORTAC', TACAN: 'TACAN', DME: 'DME', NDB: 'NDB', 'NDB-DME': 'NDB/DME' };
  const navaids = new NavaidLayer({
    onHover: (n) => {
      if (!n) return hideTooltip();
      showTooltip(
        map,
        [
          [null, `${n.ident} · ${n.name} ${NAVAID_NAMES[n.type]}`],
          ['Frequency', formatFrequency(n) || '—'],
          ...(n.dmeChannel ? [['DME channel', n.dmeChannel]] : []),
          ...(n.power ? [['Power', n.power.toLowerCase()]] : []),
          ...(n.airport ? [['Airport', n.airport]] : []),
          ['Elevation', `${n.elevationFt.toLocaleString()} ft`],
        ],
        [n.longitude, n.latitude],
        14,
      );
    },
  });
  const syncNavaids = () => {
    if (settings.showNavaids) navaids.ensureLoaded(render);
  };
  syncNavaids();

  const overlay = new MapboxOverlay({
    interleaved: false,
    layers: [],
    pickingRadius: 4,
    getCursor: ({ isDragging, isHovering }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'),
    onHover: ({ object, layer }: PickingInfo) => {
      // objects of the aircraft layers are Aircraft
      const id = AIRCRAFT_LAYERS.has(layer?.id) ? (object as Aircraft | undefined)?.id ?? null : null;
      if (id !== store.hovered) {
        store.hovered = id;
        render();
      }
    },
    onClick: ({ object, layer }: PickingInfo) => {
      if (AIRCRAFT_LAYERS.has(layer?.id) && object) selection.select((object as Aircraft).id);
      else if (!layer) selection.deselect(); // empty map; trail / airport clicks keep the selection
    },
  });
  const AIRCRAFT_LAYERS = new Set<string | undefined>(['aircraft-icons', 'ground-icons']);
  map.addControl(overlay);

  // ---------- Highlight bubbles (callsign above hovered / selected aircraft) ----------
  const labelsEl = $('labels');
  const bubbles = new Map<string, HTMLDivElement>();

  function updateBubbles() {
    const ids = store.highlightedIds();
    for (const [id, el] of bubbles) {
      if (!ids.has(id)) {
        el.remove();
        bubbles.delete(id);
      }
    }
    const gz = googleZoom();
    for (const id of ids) {
      const ac = store.aircraft.get(id)!; // highlightedIds() only returns stored ids
      let el = bubbles.get(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'bubble';
        labelsEl.append(el);
        bubbles.set(id, el);
      }
      const text = ac.callsign || ac.reg || 'N/A';
      if (el.textContent !== text) el.textContent = text;
      el.classList.toggle('bubble--emergency', ac.emergency);
      el.title = ac.emergency ? `Squawk ${ac.squawk}: ${EMERGENCY_SQUAWKS[ac.squawk]}` : '';
      const p = store.renderPosition(ac);
      const pt = map.project([p.longitude, p.latitude]);
      const lift = layers.iconPixels(ac, gz) / 2 + 8;
      el.style.transform = `translate(${pt.x}px, ${pt.y - lift}px) translate(-50%, -100%)`;
    }
  }

  // ---------- Render loop ----------
  let renderQueued = false;
  function render() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      const gz = googleZoom();
      const [shadows, ground, air] = layers.build(gz);
      // FR24 order: shadows + trail + route, ground traffic, airports, airborne traffic
      overlay.setProps({
        layers: [
          ...navaids.layers(gz, settings.showNavaids),
          shadows,
          ...selection.layers(gz),
          ground,
          ...airports.layers(gz, settings.showAirports),
          air,
        ],
      });
      updateBubbles();
    });
  }

  let tickTimer: ReturnType<typeof setTimeout> | null = null;
  function tick() {
    clearTimeout(tickTimer ?? undefined);
    store.tick();
    render();
    const ms = animationTickMs(store.aircraft.size, googleZoom(), map.getCenter().lat);
    tickTimer = setTimeout(() => requestAnimationFrame(tick), ms);
  }

  setInterval(() => {
    if (store.air.length > MAX_ANIMATED_ICONS) return;
    const hasAnimated = store.air.some((ac) => SHAPE_FRAMES[ac.shape]) || store.ground.some((ac) => SHAPE_FRAMES[ac.shape]);
    if (!hasAnimated) return;
    layers.frame = (layers.frame + 1) % 100;
    render();
  }, FRAME_INTERVAL_MS);

  map.on('zoom', render);
  map.on('move', updateBubbles);
  map.on('moveend', () => saveView(map));

  // ---------- Feed ----------
  const statusDot = $('status-dot');
  const statusText = $('status-text');
  const toast = $('toast');
  let feedState: FeedStatus = { ok: false };

  // ---------- Slow-source notice ----------
  // The free community feeds are rate-limited, so wide views fill in gradually. Tell the
  // user why instead of leaving them wondering. Dismissing hides it for this session.
  const slowEl = $('slow-notice');
  const slowText = $('slow-notice-text');
  let slowDismissed = sessionStorage.getItem('aerotrack.slowNotice') === 'off';
  $('slow-notice-close').addEventListener('click', () => {
    slowDismissed = true;
    slowEl.hidden = true;
    sessionStorage.setItem('aerotrack.slowNotice', 'off');
  });
  function updateSlowNotice(s: FeedStatus) {
    let text = '';
    if (s.ok && s.loading) {
      const pct = Math.round((s.loading.loaded / s.loading.cells) * 100);
      text = `Free flight data sources are slow. India loads first, other areas follow (${pct}% of this view loaded).`;
    } else if (s.ok && s.tookMs > 4000) {
      text = 'The flight data source is responding slowly. Aircraft may update late.';
    }
    slowText.textContent = text;
    slowEl.hidden = !text || slowDismissed;
  }

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let feedToast = false;
  /** kind: 'error' stays until cleared, 'info' / 'notice' disappear after a few seconds */
  function showToast(message: string, kind: ToastKind = 'error') {
    clearTimeout(toastTimer ?? undefined);
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.hidden = !message;
    if (message && kind !== 'error') toastTimer = setTimeout(() => (toast.hidden = true), 4000);
  }

  const selection = new Selection({
    map,
    store,
    airports,
    render,
    notify: (message: string, kind: ToastKind = 'notice') => showToast(message, kind),
  });

  function updateStatus() {
    const parts: string[] = [];
    if (store.lastDataAt) {
      parts.push(`${store.aircraft.size.toLocaleString()} aircraft`);
      const ago = Math.max(0, Math.round((Date.now() - store.lastDataAt) / 1000));
      parts.push(ago < 2 ? 'updated now' : `updated ${ago}s ago`);
    }
    if (feedState.source) parts.push(`via ${feedState.source}`);
    if (feedState.intervalMs) parts.push(`refresh ${Math.round(feedState.intervalMs / 1000)}s`);
    if (feedState.credits?.states != null) parts.push(`${feedState.credits.states.toLocaleString()} credits left`);
    if (feedState.message) parts.push(feedState.message);
    statusText.textContent = parts.join(' · ') || 'Connecting…';
    statusDot.dataset.state = !feedState.ok ? 'error' : feedState.stale ? 'stale' : 'live';
  }
  setInterval(updateStatus, 1000);

  const feed = new Feed(map, {
    getSelected: () => selection.liveId,
    isFollowing: () => selection.following,
    onData: (body) => {
      store.apply(body);
      selection.onFeed();
      tick();
    },
    onStatus: (s) => {
      updateSlowNotice(s);
      feedState = s;
      layers.feedError = Boolean(s.failing);
      if (s.failing) {
        showToast('Live data unavailable. Retrying…');
        feedToast = true;
      } else if (feedToast) {
        showToast('');
        feedToast = false;
      }
      updateStatus();
      render();
    },
  });

  // ---------- Controls ----------
  $('zoom-in').addEventListener('click', () => map.zoomIn());
  $('zoom-out').addEventListener('click', () => map.zoomOut());
  $('locate').addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLElement;
    if (!navigator.geolocation) return;
    btn.setAttribute('aria-busy', 'true');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        btn.removeAttribute('aria-busy');
        map.flyTo({ center: [coords.longitude, coords.latitude], zoom: Math.max(map.getZoom(), 8) });
      },
      () => btn.removeAttribute('aria-busy'),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  });

  const clock = $('utc-clock');
  const updateClock = () => {
    clock.textContent = new Date().toISOString().slice(11, 16);
  };
  updateClock();
  setInterval(updateClock, 10_000);

  // The feed starts as soon as the map loads; the loading screen covers it until India is in,
  // then one refresh pulls everything the warm-up loaded.
  const mapReady = new Promise<void>((resolve) => map.once('load', () => resolve()));
  mapReady.then(() => feed.start());
  runLoader({ mapReady, onDone: () => mapReady.then(() => feed.refresh()) });
  // Every style load (first load and each switch) needs India's borders applied again.
  map.on('style.load', () => applyIndiaView(map));
  applyBrightness(map, settings.brightness);
  initStyleMenu({
    map,
    onChange: () => {
      document.body.dataset.theme = theme.current.light ? 'light' : 'dark';
      airports.version++;
      syncNavaids();
      render();
    },
  });
  map.on('error', (e) => console.warn('Map error:', e.error?.message ?? e));

  // Debug handle for the console
  window.aerotrack = { map, store, layers, overlay, selection, airports };
}
