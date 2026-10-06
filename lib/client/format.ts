// Number formatting in FR24 style (default units: ft, kts, fpm). Unit settings come later.
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const CLIMB_ARROW = '➚';
export const DESCENT_ARROW = '➘';

export const formatAltitude = (ft: number | null | undefined): string => (ft == null ? '—' : `${nf.format(ft)} ft`);
export const formatFlightLevel = (ft: number): string => `FL${String(Math.round(ft / 100)).padStart(3, '0')}`;
export const formatSpeed = (kt: number | null | undefined): string => (kt == null ? '—' : `${nf.format(Math.round(kt))} kts`);
export const formatTrack = (deg: number | null | undefined): string => (deg == null ? '—' : `${Math.round(deg) % 360}°`);

export function formatVspeed(fpm: number | null | undefined): string {
  if (fpm == null) return '—';
  const v = Math.round(fpm / 64) * 64; // ADS-B reports vertical rate in 64 fpm steps
  return `${v > 0 ? '+' : ''}${nf.format(v)} fpm`;
}

/** FR24 shows an arrow when |vertical speed| > 128 fpm. */
export function verticalTrend(fpm: number | null | undefined): -1 | 0 | 1 {
  if (fpm == null) return 0;
  return fpm > 128 ? 1 : fpm < -128 ? -1 : 0;
}

export function formatCoord(lat: number, lon: number): string {
  const f = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
  return `${f(lat, 'N', 'S')}, ${f(lon, 'E', 'W')}`;
}

export function formatAgo(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 2) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60} s ago`;
}

/** `sec`: Unix seconds. */
export const formatUtcTime = (sec: number): string => `UTC ${new Date(sec * 1000).toISOString().slice(11, 19)}`;

/** Indexed by `Aircraft.positionSource`. */
export const POSITION_SOURCES: readonly string[] = ['ADS-B', 'ASTERIX (radar)', 'MLAT', 'FLARM'];
/** ICAO wake turbulence category letter -> label. */
export const WAKE_CATEGORIES: Readonly<Record<string, string>> = { L: 'Light', M: 'Medium', H: 'Heavy', J: 'Super' };
