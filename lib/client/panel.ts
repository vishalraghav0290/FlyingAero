// Selected-aircraft panel. All values go in with textContent (no HTML injection).
import { EMERGENCY_SQUAWKS } from './store.ts';
import { altitudeHex } from './trail.ts';
import {
  CLIMB_ARROW, DESCENT_ARROW, POSITION_SOURCES, WAKE_CATEGORIES, formatAgo, formatAltitude,
  formatCoord, formatSpeed, formatTrack, formatVspeed, verticalTrend,
} from './format.ts';
import type { Trail } from './trail.ts';
import type { PanelPhoto } from './photos.ts';
import type { ResolvedRoute, RouteEndpoint } from './route.ts';
import type { Aircraft } from './types.ts';
import type { AircraftDetails } from '../server/aircraftDb.ts';

/** Panel button callbacks. */
export interface PanelOptions {
  onClose: () => void;
  onFollow: () => void;
  onCenter: () => void;
  onShare: () => void;
}

/** What `setPhotos` needs to know about the aircraft (registration for links, type for alt text). */
export interface PhotoSubject {
  reg?: string;
  typecode?: string;
}

/** Options of a grid row: value class, tooltip, full width, or a node instead of text. */
interface GridRowOptions {
  cls?: string;
  title?: string;
  wide?: boolean;
  node?: Node;
}

/** [label, value, options] */
type GridRow = [label: string, value: string | null, opts?: GridRowOptions];

// Elements rendered by AeroTrackApp; they're always in the markup.
const $ = <T extends Element = HTMLElement>(id: string): T => document.getElementById(id) as unknown as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, text?: string | null): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function badge(text: string, kind: string, title?: string): HTMLSpanElement {
  const b = el('span', `badge badge--${kind}`, text);
  if (title) b.title = title;
  return b;
}

/** rows: [label, value, { cls, title, wide, node }] */
function fillGrid(dl: HTMLElement, rows: GridRow[]): void {
  const frag = document.createDocumentFragment();
  for (const [label, value, opts = {}] of rows) {
    const wrap = el('div', `panel__cell${opts.wide ? ' panel__cell--wide' : ''}`);
    wrap.append(el('dt', null, label));
    const dd = el('dd', opts.cls ?? null);
    if (opts.node) dd.append(opts.node);
    else dd.textContent = value ?? '—';
    if (opts.title) dd.title = opts.title;
    wrap.append(dd);
    frag.append(wrap);
  }
  dl.replaceChildren(frag);
}

export class Panel {
  root: HTMLElement;
  followBtn: HTMLButtonElement;
  /** Trail state the altitude graph was drawn for. */
  graphKey: string;
  /** Airline name from the scheduled route (shown when the aircraft DB has no operator). */
  declare airline?: string;
  /** Photo srcs currently in the slider. */
  declare photoKey?: string;
  declare photos?: PanelPhoto[];
  declare photoIndex: number;
  declare photoNavBound?: boolean;
  /** The last pointer gesture was a swipe (suppresses the click). */
  declare swiped?: boolean;

  constructor({ onClose, onFollow, onCenter, onShare }: PanelOptions) {
    this.root = $('panel');
    this.followBtn = $<HTMLButtonElement>('panel-follow');
    $('panel-close').addEventListener('click', onClose);
    this.followBtn.addEventListener('click', onFollow);
    $('panel-center').addEventListener('click', onCenter);
    $('panel-share').addEventListener('click', onShare);
    this.graphKey = '';
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    document.body.classList.add('has-panel');
  }

  hide(): void {
    this.root.hidden = true;
    document.body.classList.remove('has-panel');
    this.graphKey = '';
  }

  setFollowing(on: boolean): void {
    this.followBtn.setAttribute('aria-pressed', String(on));
    this.followBtn.querySelector('span')!.textContent = on ? 'Following' : 'Follow';
  }

  /** kind: 'alert' (red), 'landed' (green), 'lost' (grey) */
  flash(message: string, kind: 'alert' | 'landed' | 'lost' = 'alert'): void {
    const a = $('panel-alert');
    a.textContent = message;
    a.dataset.kind = kind;
    a.hidden = !message;
  }

  /**
   * photos: array of { src, link, credit, source, small } (max 3), or 'loading' / 'none'.
   * Slider in FR24 style: swipe or arrows, dots underneath, credit for the visible photo.
   */
  setPhotos(photos: PanelPhoto[] | 'loading' | 'none', ac: PhotoSubject | null | undefined, done = true): void {
    const fig = $('panel-photo');
    const track = $('photo-track');
    const reg = ac?.reg;
    const jp = $<HTMLAnchorElement>('photo-jetphotos');
    jp.hidden = !reg;
    if (reg) jp.href = `https://www.jetphotos.com/registration/${encodeURIComponent(reg)}`;
    const list = Array.isArray(photos) ? photos : [];
    const key = list.map((p) => p.src).join('|');

    if (!list.length) {
      this.photoKey = '';
      track.replaceChildren();
      fig.dataset.state = 'empty';
      $('photo-dots').replaceChildren();
      $('photo-prev').hidden = $('photo-next').hidden = true;
      $('photo-credit').textContent = '';
      $('photo-message').textContent = photos === 'loading' || !done ? 'Loading photos…' : 'No photos of this aircraft yet';
      return;
    }
    if (key === this.photoKey) return;
    // keep the photo the user is looking at when more arrive
    const current = this.photos?.[this.photoIndex]?.src;
    this.photoKey = key;
    this.photos = list;
    this.photoIndex = Math.max(0, list.findIndex((p) => p.src === current));

    const name = `${reg || 'Aircraft'}${ac?.typecode ? ` (${ac.typecode})` : ''}`;
    track.replaceChildren(
      ...list.map((p, i) => {
        const a = el('a', `photo__slide${p.small ? ' photo__slide--small' : ''}`);
        a.href = p.link; // plain link to the photo page (Planespotters terms)
        a.target = '_blank';
        a.rel = 'noopener';
        a.setAttribute('aria-roledescription', 'slide');
        a.setAttribute('aria-label', `Photo ${i + 1} of ${list.length}, open on ${p.source}`);
        const img = el('img');
        img.decoding = 'async';
        img.loading = i === 0 ? 'eager' : 'lazy';
        img.alt = `${name}, ${p.credit}`;
        img.onload = () => {
          if (i === this.photoIndex) fig.dataset.state = 'ready';
          img.classList.add('is-loaded');
        };
        img.onerror = () => a.classList.add('is-broken');
        img.src = p.src;
        a.append(img);
        return a;
      }),
    );
    $('photo-dots').replaceChildren(
      ...list.map((_, i) => {
        const b = el('button', 'photo__dot');
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-label', `Photo ${i + 1}`);
        b.addEventListener('click', () => this.showPhoto(i));
        return b;
      }),
    );
    if (!this.photoNavBound) {
      this.photoNavBound = true;
      $('photo-prev').addEventListener('click', () => this.showPhoto(this.photoIndex - 1));
      $('photo-next').addEventListener('click', () => this.showPhoto(this.photoIndex + 1));
      fig.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') this.showPhoto(this.photoIndex - 1);
        if (e.key === 'ArrowRight') this.showPhoto(this.photoIndex + 1);
      });
      let x0: number | null = null;
      track.addEventListener('pointerdown', (e) => (x0 = e.clientX));
      track.addEventListener('pointerup', (e) => {
        if (x0 == null) return;
        const dx = e.clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 40) this.showPhoto(this.photoIndex + (dx < 0 ? 1 : -1));
      });
      // a swipe shouldn't also open the photo page
      track.addEventListener('click', (e) => {
        if (this.swiped) e.preventDefault();
        this.swiped = false;
      });
      track.addEventListener('pointermove', (e) => {
        if (x0 != null && Math.abs(e.clientX - x0) > 10) this.swiped = true;
      });
    }
    this.showPhoto(this.photoIndex);
  }

  showPhoto(i: number): void {
    const n = this.photos?.length ?? 0;
    if (!n) return;
    this.photoIndex = (i + n) % n;
    const track = $('photo-track');
    track.style.transform = `translateX(-${this.photoIndex * 100}%)`;
    [...track.children].forEach((s, k) => {
      s.toggleAttribute('inert', k !== this.photoIndex);
      if (k === this.photoIndex && s.querySelector('img.is-loaded')) $('panel-photo').dataset.state = 'ready';
    });
    [...$('photo-dots').children].forEach((d, k) => d.setAttribute('aria-selected', String(k === this.photoIndex)));
    $('photo-prev').hidden = $('photo-next').hidden = n < 2;
    const p = this.photos![this.photoIndex]; // n > 0
    $('photo-credit').textContent = `${p.credit} · ${p.source}`;
  }

  setStatus(text: string | null | undefined): void {
    $('panel-status').textContent = text || '';
  }

  /** route: resolveRoute() result or null; eta: seconds or null */
  setRoute(route: ResolvedRoute | null, eta: number | null, loading: boolean): void {
    const box = $('panel-route');
    if (!route && !loading) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const label = (a: RouteEndpoint | null | undefined) => (a ? a.iata || a.icao : '—');
    const city = (a: RouteEndpoint | null | undefined) => (a ? a.city || a.name : 'Unknown');
    $('route-from-code').textContent = loading && !route ? '···' : label(route?.origin);
    $('route-from-code').title = route?.origin?.name || '';
    $('route-from-city').textContent = loading && !route ? '' : city(route?.origin);
    $('route-to-code').textContent = loading && !route ? '···' : label(route?.destination);
    $('route-to-code').title = route?.destination?.name || '';
    $('route-to-city').textContent = loading && !route ? '' : city(route?.destination);

    const pct = route?.progress != null ? Math.round(route.progress * 100) : null;
    const bar = $('route-bar');
    bar.hidden = pct == null;
    if (pct != null) {
      $('route-fill').style.width = `${pct}%`;
      bar.setAttribute('aria-valuenow', String(pct));
    }
    const km = (m: number) => `${Math.round(m / 1000).toLocaleString()} km`;
    $('route-flown').textContent = route?.flown != null ? `${km(route.flown)} flown` : '';
    $('route-remaining').textContent = route?.remaining != null ? `${km(route.remaining)} to go` : '';
    $('route-eta').textContent = eta ? `~${eta >= 3600 ? `${Math.floor(eta / 3600)} h ` : ''}${Math.round((eta % 3600) / 60)} min` : '';
    $('route-eta').title = eta ? 'Estimated from current ground speed, not the airline schedule' : '';
    const note = route?.note || (route && !route.verified ? 'Scheduled route, not confirmed' : '');
    $('route-note').textContent = note;
    $('route-note').hidden = !note;
  }

  /** ac: store aircraft, details: /api/aircraft details (may be null), trail: Trail */
  update(ac: Aircraft | null | undefined, details: AircraftDetails | null | undefined, trail: Trail, nowSec: number): void {
    if (!ac) return;
    $('panel-callsign').textContent = ac.callsign || ac.reg || ac.id.toUpperCase();

    const badges: HTMLSpanElement[] = [];
    if (ac.typecode) badges.push(badge(ac.typecode, 'type', 'Aircraft ICAO type code'));
    if (ac.reg) badges.push(badge(ac.reg, 'reg', 'Aircraft registration'));
    if (ac.emergency) badges.push(badge(ac.squawk, 'squawk', `Squawk ${ac.squawk}: ${EMERGENCY_SQUAWKS[ac.squawk]}`));
    if (ac.estimated) badges.push(badge('EST', 'est', 'Estimated position: no fresh data from OpenSky'));
    $('panel-badges').replaceChildren(...badges);

    const operator = details?.operator || this.airline || '';
    $('panel-operator').textContent = operator
      ? `${operator}${details?.operatorIcao ? ` (${details.operatorIcao})` : ''}`
      : ac.country || '';

    const model = [details?.manufacturer, details?.model].filter(Boolean).join(' ');
    $('panel-model').textContent = model || (ac.typecode ? `Type ${ac.typecode}` : 'Aircraft type unknown');

    // ---- flight data ----
    const trend = verticalTrend(ac.vspeed);
    const vsNode = el('span', trend > 0 ? 'vs vs--up' : trend < 0 ? 'vs vs--down' : 'vs');
    vsNode.textContent = `${trend > 0 ? `${CLIMB_ARROW} ` : trend < 0 ? `${DESCENT_ARROW} ` : ''}${formatVspeed(ac.vspeed)}`;

    const trackNode = el('span', 'track');
    const arrow = el('span', 'track__arrow', '➤');
    arrow.style.transform = `rotate(${(ac.track ?? 0) - 90}deg)`;
    arrow.setAttribute('aria-hidden', 'true');
    trackNode.append(arrow, document.createTextNode(` ${formatTrack(ac.track)}`));

    const dataAge = ac.estimated ? ac.estimatedAge : nowSec - ac.timestamp / 1000;
    fillGrid($('panel-flight'), [
      ['Barometric altitude', ac.onGround ? 'On ground' : formatAltitude(ac.altitude), { cls: 'panel__value--big' }],
      ['Vertical speed', null, { node: vsNode, cls: 'panel__value--big' }],
      ['GPS altitude', ac.onGround ? '—' : formatAltitude(ac.geoAltitude)],
      ['Ground speed', formatSpeed(ac.speed)],
      ['Track', null, { node: trackNode }],
      [
        'Squawk',
        ac.squawk || '—',
        ac.emergency ? { cls: 'panel__value--alert', title: EMERGENCY_SQUAWKS[ac.squawk] } : {},
      ],
      ['Position', formatCoord(ac.latitude, ac.longitude), { wide: true }],
      ['Data source', POSITION_SOURCES[ac.positionSource] ?? 'Unknown'],
      [
        ac.estimated ? 'Estimated for' : 'Last position',
        ac.estimated ? `${Math.round(dataAge)} s` : formatAgo(dataAge),
        ac.estimated ? { cls: 'panel__value--warn' } : {},
      ],
    ]);

    // ---- aircraft ----
    const built = Number(details?.built);
    // (a missing wtc looks up no category, as before)
    const wake = details?.wtc != null ? WAKE_CATEGORIES[details.wtc] : undefined;
    fillGrid($('panel-aircraft'), [
      ['Type', ac.typecode || details?.typecode || '—'],
      ['Registration', ac.reg || details?.reg || '—'],
      ['Country of registration', ac.country || '—', { wide: true }],
      ['ICAO 24-bit address', ac.id.toUpperCase()],
      ['Wake category', wake ?? '—'],
      ['Built', built > 1900 ? `${built} (${new Date().getUTCFullYear() - built} yrs)` : '—'],
      ['Class', details?.icaoClass || '—'],
    ]);

    $('panel-note').textContent = trail.loading
      ? 'Loading flight trail…'
      : trail.points.length
        ? ''
        : 'No trail history available for this aircraft yet.';

    this._graph(trail);
  }

  /** Altitude profile from the trail, stroked with the same altitude colours as the map trail. */
  _graph(trail: Trail): void {
    const pts = trail.points;
    const svg = $<SVGSVGElement>('panel-graph');
    const key = `${trail.icao}:${pts.length}:${pts.at(-1)?.t ?? 0}`;
    if (key === this.graphKey) return;
    this.graphKey = key;
    if (pts.length < 2) {
      svg.replaceChildren();
      $('panel-graph-range').textContent = '';
      return;
    }
    const W = 320;
    const H = 80;
    const t0 = pts[0].t;
    const t1 = pts.at(-1)!.t; // pts.length >= 2
    const maxAlt = Math.max(1000, ...pts.map((p) => p.altM ?? 0)) * 1.1;
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
    const y = (a: number | null) => H - ((a ?? 0) / maxAlt) * (H - 4);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.altM).toFixed(1)}`).join('');

    const ns = 'http://www.w3.org/2000/svg';
    // setAttribute stringifies numbers
    const mk = (tag: string, attrs: Record<string, string | number>) => {
      const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v as string);
      return n;
    };
    const grad = mk('linearGradient', { id: 'alt-grad', x1: 0, y1: H, x2: 0, y2: 0, gradientUnits: 'userSpaceOnUse' });
    for (let a = 0; a <= maxAlt; a += maxAlt / 24) {
      grad.append(mk('stop', { offset: (a / maxAlt).toFixed(3), 'stop-color': altitudeHex(a) }));
    }
    const defs = mk('defs', {});
    defs.append(grad);
    svg.replaceChildren(
      defs,
      mk('path', { d: `${line}L${W},${H}L0,${H}Z`, fill: 'url(#alt-grad)', opacity: '0.18' }),
      mk('path', { d: line, fill: 'none', stroke: 'url(#alt-grad)', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }),
    );
    const mins = Math.round((t1 - t0) / 60);
    const peakFt = Math.round(Math.max(...pts.map((p) => p.altM ?? 0)) / 0.3048 / 100) * 100;
    $('panel-graph-range').textContent = `last ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`} · max ${peakFt.toLocaleString()} ft`;
  }
}
