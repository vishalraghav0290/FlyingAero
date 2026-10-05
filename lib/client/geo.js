// Spherical geometry helpers (same formulas FR24 uses: R = 6371 km).
export const EARTH_RADIUS_M = 6371e3;
export const KT_TO_MS = 0.514444;
export const M_TO_FT = 1 / 0.3048;
export const MS_TO_FPM = 196.850394;

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export const normalizeDeg = (d) => ((d % 360) + 360) % 360;
export const wrapLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Great-circle distance in metres. */
export function distance(a, b) {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude));
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Initial bearing a -> b, degrees 0..360. */
export function bearing(a, b) {
  const la1 = rad(a.latitude);
  const la2 = rad(b.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const y = Math.cos(la2) * Math.sin(dLon);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return normalizeDeg(deg(Math.atan2(y, x)));
}

/** Point reached from `p` after `dist` metres on initial bearing `brg`. */
export function destination(p, brg, dist) {
  const d = dist / EARTH_RADIUS_M;
  const t = rad(brg);
  const la1 = rad(p.latitude);
  const lo1 = rad(p.longitude);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(t));
  const lo2 =
    lo1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { latitude: deg(la2), longitude: wrapLon(deg(lo2)) };
}

/** Great-circle interpolation (slerp) between a and b, f in [0, 1]. */
export function interpolate(f, a, b) {
  const la1 = rad(a.latitude);
  const lo1 = rad(a.longitude);
  const la2 = rad(b.latitude);
  const lo2 = rad(b.longitude);
  const h =
    Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
  const delta = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  if (delta === 0) return { latitude: a.latitude, longitude: a.longitude };
  const A = Math.sin((1 - f) * delta) / Math.sin(delta);
  const B = Math.sin(f * delta) / Math.sin(delta);
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);
  return { latitude: deg(Math.atan2(z, Math.sqrt(x * x + y * y))), longitude: deg(Math.atan2(y, x)) };
}

/** Shortest-path interpolation between two headings. */
export function lerpAngle(a, b, f) {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return normalizeDeg(a + d * f);
}

/** Signed distance (m) of p from the great circle a -> b. */
export function crossTrack(p, a, b) {
  const d13 = distance(a, p) / EARTH_RADIUS_M;
  const t13 = rad(bearing(a, p));
  const t12 = rad(bearing(a, b));
  return Math.asin(Math.sin(d13) * Math.sin(t13 - t12)) * EARTH_RADIUS_M;
}

/** Distance (m) from a along the great circle a -> b to the point closest to p. */
export function alongTrack(p, a, b) {
  const d13 = distance(a, p) / EARTH_RADIUS_M;
  const dxt = crossTrack(p, a, b) / EARTH_RADIUS_M;
  const v = Math.acos(Math.min(1, Math.max(-1, Math.cos(d13) / Math.cos(dxt)))) * EARTH_RADIUS_M;
  const t13 = rad(bearing(a, p));
  const t12 = rad(bearing(a, b));
  return Math.cos(t13 - t12) < 0 ? -v : v;
}
