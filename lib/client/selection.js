import { PathLayer } from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
/**
 * Selected aircraft: panel, trail, route, follow mode and the ?aircraft= deep link.
 * Behaviour follows FR24:
 *  - click an aircraft to select it, click empty map (or Esc) to close
 *  - the selected flight is always requested from the feed, even off-screen
 *  - Follow keeps the map centred on the moving aircraft; dragging the map stops it
 *  - the dashed line to the destination follows the great circle
 * When the aircraft stops reporting, the panel stays open with the outcome:
 * "Landed at DEL" if it was low near an airport, otherwise "Signal lost".
 */
import { Trail } from './trail.js';
import { Panel } from './panel.js';
import { formatAltitude, formatFlightLevel, formatSpeed, formatUtcTime } from './format.js';
import { interpolate } from './geo.js';
import { flightPhase, resolveRoute, timeRemaining } from './route.js';
import { showTooltip, hideTooltip } from './tooltip.js';
import { findPhotos } from './photos.js';
import { theme } from './mapstyles.js';

const PARAM = 'aircraft';
const LANDING_ALT_FT = 3000;
const LANDING_RADIUS_M = 15_000;
// FR24 draws the route in black at alpha 100 on its light map; light lines on dark maps
const routeLineColor = () => (theme.current.light ? [0, 0, 0, 110] : [255, 255, 255, 130]);

export class Selection {
  constructor({ map, store, airports, render, notify }) {
    this.map = map;
    this.store = store;
    this.airports = airports;
    this.render = render;
    this.notify = notify;
    this.trail = new Trail();
    this.reset();
    this.following = false;
    this.pendingCenter = false;
    this.controller = null;
    this.panel = new Panel({
      onClose: () => this.deselect(),
      onFollow: () => this.setFollowing(!this.following),
      onCenter: () => this.center(true),
      onShare: () => this.share(),
    });

    map.on('dragstart', () => this.setFollowing(false));
    map.on('movestart', () => hideTooltip(0));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.id && !e.target.closest?.('input, textarea')) this.deselect();
    });
    setInterval(() => this._updatePanel(), 1000);

    const fromUrl = new URLSearchParams(location.search).get(PARAM);
    if (fromUrl && /^[0-9a-f]{6}$/i.test(fromUrl)) {
      this.pendingCenter = true;
      this.select(fromUrl.toLowerCase());
    }
  }

  reset() {
    this.details = null;
    this.departedFrom = null;
    this.scheduled = null;
    this.routeCallsign = null;
    this.routeLoading = false;
    this.route = null;
    this.lastAc = null;
    this.ended = null; // { kind: 'landed' | 'lost', airport, at }
    this.misses = 0;
    this.photoRequested = false;
  }

  async _loadPhoto(id, reg) {
    if (this.photoRequested) return;
    this.photoRequested = true;
    const ac = () => this.store.aircraft.get(id) ?? this.lastAc ?? { reg };
    const photos = await findPhotos(id, reg, (partial) => {
      if (this.id === id) this.panel.setPhotos(partial, ac(), false);
    });
    if (this.id === id) this.panel.setPhotos(photos, ac(), true);
  }

  get id() {
    return this.store.selected;
  }

  /** What the feed should keep requesting (nothing once the flight has ended). */
  get liveId() {
    return this.ended ? null : this.id;
  }

  select(id) {
    if (this.id === id) return;
    this.controller?.abort();
    this.store.selected = id;
    this.reset();
    this.trail.clear();
    this.trail.icao = id;
    this.trail.loading = true;
    this.panel.flash('');
    this.panel.setStatus('');
    this.panel.setRoute(null, null, true);
    this.panel.show();
    this._setUrl(id);
    this._load(id);
    const ac = this.store.aircraft.get(id);
    this.panel.setPhotos('loading', ac);
    if (ac) {
      this.lastAc = ac;
      this._loadRoute(ac.callsign);
      this._loadPhoto(id, ac.reg);
    }
    this._updatePanel();
    this.render();
  }

  deselect() {
    if (!this.id) return;
    this.controller?.abort();
    this.setFollowing(false);
    this.store.selected = null;
    this.trail.clear();
    this.reset();
    this.panel.hide();
    this.airports.setHighlighted([]);
    hideTooltip(0);
    this._setUrl(null);
    this.render();
  }

  async _load(id) {
    const controller = new AbortController();
    this.controller = controller;
    try {
      const res = await fetch(`/api/aircraft/${id}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (this.id !== id) return;
      this.details = body.details;
      this.departedFrom = body.departedFrom;
      this.trail.set(id, body.trail);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('Aircraft details failed:', err.message);
    } finally {
      if (this.id === id) this.trail.loading = false;
      this._updatePanel();
      this.render();
    }
  }

  async _loadRoute(callsign) {
    if (!callsign || callsign === this.routeCallsign) return;
    this.routeCallsign = callsign;
    this.routeLoading = true;
    const id = this.id;
    try {
      const res = await fetch(`/api/route/${encodeURIComponent(callsign)}`);
      const body = await res.json();
      if (this.id === id) this.scheduled = body.route;
    } catch {
      // route stays unknown
    } finally {
      if (this.id === id) this.routeLoading = false;
      this._updatePanel();
      this.render();
    }
  }

  /** Called after every feed update. */
  onFeed() {
    const id = this.id;
    if (!id) return;
    const ac = this.store.aircraft.get(id);
    if (!ac) {
      if (this.ended) return;
      // The server looks the selected aircraft up even off-screen, so two misses in a row
      // means OpenSky no longer has it.
      this.misses += 1;
      if (this.misses >= 2 || this.store.lost?.includes(id)) this._end();
      return;
    }
    if (this.ended) {
      this.ended = null; // it's back
      this.panel.flash('');
    }
    this.misses = 0;
    this.lastAc = ac;
    this.trail.append(ac);
    this._loadRoute(ac.callsign);
    this._loadPhoto(id, ac.reg);
    if (this.pendingCenter) {
      this.pendingCenter = false;
      this.center(false);
    }
    this._updatePanel();
  }

  /** Aircraft stopped reporting: decide whether it landed. */
  _end() {
    const ac = this.lastAc;
    this.setFollowing(false);
    const name = ac?.callsign || this.id.toUpperCase();
    if (!ac) {
      this.ended = { kind: 'lost', at: Date.now() };
      this.panel.flash(this.pendingCenter ? `${name} is not being tracked right now` : 'No live data');
      this.pendingCenter = false;
      this._updatePanel();
      return;
    }
    const dest = this.route?.destination;
    const nearest = this.airports.nearest(ac.latitude, ac.longitude, LANDING_RADIUS_M);
    const low = ac.onGround || ac.altitude < LANDING_ALT_FT;
    const atDest = dest && nearest && dest.icao && nearest.icao === dest.icao;
    if (low && (nearest || atDest)) {
      const apt = atDest ? dest : nearest;
      this.ended = { kind: 'landed', airport: apt, at: Date.now() };
      this.panel.flash(`Landed at ${apt.name} (${apt.iata || apt.icao})`, 'landed');
      this.notify(`${name} landed at ${apt.iata || apt.icao}`, 'info');
    } else {
      this.ended = { kind: 'lost', at: Date.now() };
      const where = ac.onGround ? 'on the ground' : `at ${formatFlightLevel(ac.altitude)}`;
      this.panel.flash(`Signal lost ${where} · last seen ${new Date().toISOString().slice(11, 16)} UTC`, 'lost');
      this.notify(`Lost contact with ${name}`);
    }
    this._updatePanel();
    this.render();
  }

  _updatePanel() {
    if (!this.id || !this.panel.open) return;
    const ac = this.store.aircraft.get(this.id) ?? this.lastAc;
    if (!ac) {
      document.getElementById('panel-callsign').textContent = this.id.toUpperCase();
      document.getElementById('panel-note').textContent = 'Waiting for live data…';
      return;
    }
    const live = this.ended ? null : this.store.engine.render.get(ac.id);
    const pos = live ? { ...ac, latitude: live.latitude, longitude: live.longitude } : ac;
    this.route = resolveRoute({ ac: pos, scheduled: this.scheduled, departedFrom: this.departedFrom });
    this.panel.airline = this.scheduled?.airline || '';
    this.panel.setRoute(this.route, this.ended ? null : timeRemaining(this.route, ac), this.routeLoading);
    this.airports.setHighlighted([this.route?.origin?.icao, this.route?.destination?.icao, this.ended?.airport?.icao]);

    if (this.ended?.kind === 'landed') {
      this.panel.setStatus(`Landed at ${this.ended.airport.iata || this.ended.airport.icao}`);
    } else if (this.ended) {
      this.panel.setStatus('No signal');
    } else {
      const nearest = this.airports.nearest(pos.latitude, pos.longitude, 45_000);
      let status = flightPhase(ac, this.route, nearest);
      if (ac.positionAgeS > 20 && !ac.estimated && ac.altitude < LANDING_ALT_FT) {
        status = nearest ? `No signal near ${nearest.iata || nearest.icao}, probably landing` : 'No signal at low altitude';
      }
      this.panel.setStatus(status);
    }
    this.panel.update(ac, this.details, this.trail, this.store.now() / 1000);
  }

  center(animate) {
    const ac = this.store.aircraft.get(this.id) ?? this.lastAc;
    if (!ac) return;
    const p = this.store.renderPosition(ac);
    const opts = { center: [p.longitude, p.latitude], zoom: Math.max(this.map.getZoom(), 7) };
    if (animate) this.map.easeTo({ ...opts, duration: 600 });
    else this.map.jumpTo(opts);
  }

  setFollowing(on) {
    on = Boolean(on && this.id && !this.ended);
    if (on === this.following) return;
    this.following = on;
    this.panel.setFollowing(on);
    if (on) this._followFrame();
    else cancelAnimationFrame(this.followRaf);
  }

  /** Every frame: recompute the selected aircraft and glide the camera onto it. */
  _followFrame() {
    if (!this.following) return;
    const ac = this.store.aircraft.get(this.id);
    if (ac) {
      const p = this.store.engine.calculate(ac.id, this.store.now()) ?? ac;
      const a = this.map.project(this.map.getCenter());
      const b = this.map.project([p.longitude, p.latitude]);
      const f = Math.hypot(b.x - a.x, b.y - a.y) > 2 ? 0.18 : 1; // ease in, then lock on
      this.map.jumpTo({ center: this.map.unproject([a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f]) });
      this.render();
    }
    this.followRaf = requestAnimationFrame(() => this._followFrame());
  }

  async share() {
    const url = new URL(location.href);
    url.searchParams.set(PARAM, this.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      this.notify('Link copied', 'info');
    } catch {
      this.notify(url.toString(), 'info');
    }
  }

  _setUrl(id) {
    const url = new URL(location.href);
    if (id) url.searchParams.set(PARAM, id);
    else url.searchParams.delete(PARAM);
    history.replaceState(null, '', url);
  }

  /** deck.gl layers for the trail and remaining route (drawn under the aircraft icons). */
  layers(googleZoom) {
    if (!this.id) return [];
    const ac = this.store.aircraft.get(this.id);
    const live = ac && !this.ended ? this.store.engine.render.get(ac.id) : null;
    const out = [];

    // FR24 route line: dashed great circle from the aircraft to its destination
    const dest = this.route?.verified ? this.route.destination : null;
    if (live && dest && !ac.onGround) {
      const n = googleZoom <= 10 ? 25 : 50;
      const path = [];
      for (let i = 0; i <= n; i++) {
        const p = interpolate(i / n, live, dest);
        path.push([p.longitude, p.latitude]);
      }
      out.push(
        new PathLayer({
          id: 'route-line',
          data: [path],
          getPath: (d) => d,
          getWidth: 2,
          widthUnits: 'pixels',
          getColor: routeLineColor(),
          getDashArray: [3, 5],
          dashJustified: true,
          capRounded: true,
          jointRounded: true,
          wrapLongitude: true,
          parameters: { depthCompare: 'always' },
          extensions: [new PathStyleExtension({ dash: true })],
          updateTriggers: { getPath: live.timestamp },
        }),
      );
    }

    if (this.trail.points.length) {
      out.push(
        ...this.trail.layers({
          live,
          liveAltM: ac ? ac.altitude * 0.3048 : null,
          liveEstimated: Boolean(ac?.estimated),
          googleZoom,
          onHover: (p) => this._trailTooltip(p),
        }),
      );
    }
    return out;
  }

  _trailTooltip(p) {
    if (!p) return hideTooltip();
    showTooltip(
      this.map,
      [
        ['Time', formatUtcTime(p.t)],
        ['Ground speed', formatSpeed(p.speedKt)],
        ['Altitude', p.ground ? 'On ground' : formatAltitude(Math.round((p.altM ?? 0) / 0.3048))],
      ],
      [p.longitude, p.latitude],
    );
  }
}
