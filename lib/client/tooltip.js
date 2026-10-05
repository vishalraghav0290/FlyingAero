// Shared map tooltip (FR24 MapTooltip, light variant). Content is set with textContent only.
const el = () => document.getElementById('trail-tooltip');
let hideTimer = null;

/** rows: [[label, value], ...] or [[null, 'heading text']] */
export function showTooltip(map, rows, lngLat, offsetY = 5) {
  clearTimeout(hideTimer);
  const t = el();
  t.replaceChildren(
    ...rows.map(([k, v]) => {
      const row = document.createElement('div');
      if (k) {
        const b = document.createElement('strong');
        b.textContent = `${k}: `;
        row.append(b);
      } else {
        row.className = 'map-tooltip__title';
      }
      row.append(document.createTextNode(v));
      return row;
    }),
  );
  const pt = map.project(lngLat);
  t.style.transform = `translate(${pt.x}px, ${pt.y - offsetY}px) translate(-50%, -100%)`;
  t.hidden = false;
}

/** FR24 hides hover tooltips after 200 ms so moving between points doesn't flicker. */
export function hideTooltip(delay = 200) {
  clearTimeout(hideTimer);
  if (delay) hideTimer = setTimeout(() => (el().hidden = true), delay);
  else el().hidden = true;
}
