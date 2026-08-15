const R = 6371e3;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Point reached from (lat, lon) after `dist` metres on bearing `brg` (degrees). */
export function destination(lat, lon, brg, dist) {
  const d = dist / R;
  const t = rad(brg);
  const la1 = rad(lat);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(t));
  const lo2 =
    rad(lon) + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return [deg(la2), ((((deg(lo2) + 180) % 360) + 360) % 360) - 180];
}
