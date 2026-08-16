// Number formatting in FR24 style (default units: ft, kts, fpm). Unit settings come later.
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const CLIMB_ARROW = '➚';
export const DESCENT_ARROW = '➘';

export const formatAltitude = (ft) => (ft == null ? '—' : `${nf.format(ft)} ft`);
export const formatFlightLevel = (ft) => `FL${String(Math.round(ft / 100)).padStart(3, '0')}`;
export const formatSpeed = (kt) => (kt == null ? '—' : `${nf.format(Math.round(kt))} kts`);
export const formatTrack = (deg) => (deg == null ? '—' : `${Math.round(deg) % 360}°`);

export function formatVspeed(fpm) {
  if (fpm == null) return '—';
  const v = Math.round(fpm / 64) * 64; // ADS-B reports vertical rate in 64 fpm steps
  return `${v > 0 ? '+' : ''}${nf.format(v)} fpm`;
}

/** FR24 shows an arrow when |vertical speed| > 128 fpm. */
export function verticalTrend(fpm) {
  if (fpm == null) return 0;
  return fpm > 128 ? 1 : fpm < -128 ? -1 : 0;
}

export function formatCoord(lat, lon) {
  const f = (v, pos, neg) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
  return `${f(lat, 'N', 'S')}, ${f(lon, 'E', 'W')}`;
}

export function formatAgo(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 2) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60} s ago`;
}

export const formatUtcTime = (sec) => `UTC ${new Date(sec * 1000).toISOString().slice(11, 19)}`;

export const POSITION_SOURCES = ['ADS-B', 'ASTERIX (radar)', 'MLAT', 'FLARM'];
export const WAKE_CATEGORIES = { L: 'Light', M: 'Medium', H: 'Heavy', J: 'Super' };
