/**
 * Shared client-side types: aircraft records held by the store, /api/states payloads as the
 * browser consumes them, animation output, trail points and user settings.
 * Type-only module (no runtime code).
 */
import type { RenderTypeValue } from './animation.ts';

// --- Geometry -------------------------------------------------------------------------

/** A point on the globe in degrees. Every geo helper takes and returns this shape. */
export interface LatLon {
  latitude: number;
  longitude: number;
}

/** [longitude, latitude], the coordinate order deck.gl and MapLibre expect. */
export type LngLat = [number, number];

/** Opaque RGB colour, 0..255 per channel. */
export type RGB = [number, number, number];

/** RGBA colour, 0..255 per channel. */
export type RGBA = [number, number, number, number];

// --- /api/states ----------------------------------------------------------------------

/** Viewport box sent to /api/states (degrees, rounded and padded). */
export interface Bbox {
  lamin: number;
  lamax: number;
  lomin: number;
  lomax: number;
}

/** Value type of each column in a /api/states row (OpenSky units: metres, m/s, seconds). */
export interface StateFieldValues {
  icao24: string;
  callsign: string;
  country: string;
  /** Unix seconds of the last position (or of the estimate). */
  timePosition: number;
  lastContact: number;
  lon: number;
  lat: number;
  /** Barometric altitude, metres. */
  baroAlt: number | null;
  onGround: boolean;
  /** Ground speed, m/s. */
  velocity: number | null;
  /** True track, degrees. */
  track: number | null;
  /** Vertical rate, m/s. */
  vrate: number | null;
  /** Geometric altitude, metres. */
  geoAlt: number | null;
  squawk: string | null;
  spi: boolean;
  /** 0 ADS-B, 1 ASTERIX, 2 MLAT, 3 FLARM. */
  posSource: number;
  category: number;
  typecode: string;
  reg: string;
  operatorIcao: string;
  /** Silhouette key (see sprites.ts). */
  shape: string;
  /** Seconds the server dead-reckoned this position; 0 for a real report. */
  estimatedAge: number;
}

/** Column name in a /api/states row. */
export type StateField = keyof StateFieldValues;

/** One aircraft row from /api/states; column order is given by `StatesResponse.fields`. */
export type StateRow = StateFieldValues[StateField][];

/** ADS-B grid coverage of the requested area. */
export interface AreaCoverage {
  loaded: number;
  cells: number;
  clipped?: boolean;
}

/** Remaining OpenSky credits (empty object for other sources). */
export interface Credits {
  states?: number | null;
  daily?: number;
}

/** Body of a successful /api/states response. */
export interface StatesResponse {
  /** Server clock, ms. */
  now: number;
  /** Unix seconds of the upstream snapshot. */
  snapshotTime: number;
  intervalMs: number;
  nextPollMs?: number;
  stale: boolean;
  error: string | null;
  area: {
    bbox: Bbox | null;
    cost: number;
    clipped: boolean;
    loading: AreaCoverage | null;
    coverage: AreaCoverage | null;
  };
  source: string;
  credits: Credits;
  fields: StateField[];
  count: number;
  states: StateRow[];
}

/** Feed status after a successful poll. */
export interface FeedOkStatus {
  ok: true;
  failing?: undefined;
  stale: boolean;
  message: string | null | undefined;
  credits: Credits;
  intervalMs: number;
  source: string;
  /** Round-trip time of the request, ms. */
  tookMs: number;
  loading: AreaCoverage | null;
}

/** Feed status after a failed poll (or before the first one). */
export interface FeedErrorStatus {
  ok: false;
  /** True after MAX_RETRIES consecutive errors. */
  failing?: boolean;
  message?: string;
  stale?: undefined;
  credits?: undefined;
  intervalMs?: undefined;
  source?: undefined;
  tookMs?: undefined;
  loading?: undefined;
}

/** What `Feed` reports through `onStatus`. Discriminate on `ok`. */
export type FeedStatus = FeedOkStatus | FeedErrorStatus;

// --- Aircraft --------------------------------------------------------------------------

/** An aircraft in the store, converted to FR24 units (ft, kt, fpm). */
export interface Aircraft extends LatLon {
  /** ICAO 24-bit address, lowercase hex. */
  id: string;
  callsign: string;
  country: string;
  /** Time of the position, ms. */
  timestamp: number;
  /** Seconds between the position and the snapshot. */
  positionAgeS: number;
  onGround: boolean;
  /** Barometric altitude, ft (0 on the ground). */
  altitude: number;
  /** Geometric altitude, ft. */
  geoAltitude: number | null;
  /** Ground speed, kt. */
  speed: number | null;
  /** True track, degrees. */
  track: number | null;
  /** Vertical speed, fpm. */
  vspeed: number | null;
  squawk: string;
  emergency: boolean;
  spi: boolean;
  /** 0 ADS-B, 1 ASTERIX, 2 MLAT, 3 FLARM (index into POSITION_SOURCES). */
  positionSource: number;
  category: number;
  typecode: string;
  reg: string;
  operatorIcao: string;
  /** Silhouette key (see sprites.ts). */
  shape: string;
  /** > 0 when the server moved it along its last track because there was no fresh position. */
  estimatedAge: number;
  lastContact: number;
  /** Position is a server estimate, not a real report. */
  estimated: boolean;
  /** Drawn dimmed: estimated, or no update for a while. */
  stale: boolean;
}

// --- Animation -------------------------------------------------------------------------

/** A reported (or seeded) position in the animation buffer. */
export interface TrackPoint extends LatLon {
  /** ms */
  timestamp: number;
  track: number | null;
  /** kt */
  speed: number | null;
}

/** Fields of an aircraft the animation engine reads on each update. */
export type AnimationInput = Pick<
  Aircraft,
  'id' | 'latitude' | 'longitude' | 'track' | 'speed' | 'timestamp' | 'onGround' | 'positionSource'
>;

/** Drawn position of an aircraft at a moment, computed by `AnimationEngine.calculate`. */
export interface RenderStatus extends LatLon {
  track: number;
  /** Data time the aircraft is drawn at, ms. */
  timestamp: number;
  type: RenderTypeValue;
}

/** Where to draw an aircraft: the animated position, or the raw report before the first frame. */
export type DrawnPosition = RenderStatus | Aircraft;

// --- Trail -----------------------------------------------------------------------------

/** A vertex of a drawn trail path. */
export interface TrailPathPoint extends LatLon {
  /** Altitude, metres (null when unknown). */
  altM: number | null;
}

/** A trail vertex with a time (real points and the live end point). */
export interface TrailTimedPoint extends TrailPathPoint {
  /** Unix seconds. */
  t: number;
  /** Came from the live feed rather than the stored track. */
  live: boolean;
}

/** A real trail point (hoverable dot). */
export interface TrailPoint extends TrailTimedPoint {
  speedKt: number | null;
  ground: boolean;
}

/** Row of `trail` from /api/aircraft/[icao24]: [t, lat, lon, altM, velocityMs, track, onGround, live]. */
export type TrailRow = [
  t: number,
  lat: number,
  lon: number,
  altM: number | null,
  velocityMs: number | null,
  track: number | null,
  onGround: boolean,
  live?: boolean,
];

// --- Settings & view -------------------------------------------------------------------

/** Basemap ids (see THEMES in mapstyles.ts). */
export type MapStyleId = 'dark' | 'light' | 'streets' | 'satellite';

/** User settings persisted in localStorage. */
export interface Settings {
  /** Keep estimated aircraft for up to this many minutes; 0 disables. */
  estimationMinutes: number;
  mapStyle: MapStyleId;
  /** Basemap brightness %, 40..140. */
  brightness: number;
  showAirports: boolean;
  showNavaids: boolean;
}

/** Map view in Google zoom scale (MapLibre zoom + 1). */
export interface MapView {
  lat: number;
  lon: number;
  zoom: number;
}

// --- UI --------------------------------------------------------------------------------

/** Toast kinds: 'error' stays until cleared, the others disappear after a few seconds. */
export type ToastKind = 'error' | 'info' | 'notice';

/** Callback modules use to show a toast (Selection's `notify`). */
export type Notify = (message: string, kind?: ToastKind) => void;
