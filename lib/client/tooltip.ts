// Shared map tooltip (FR24 MapTooltip, light variant). Content is set with textContent only.
import type { LngLatLike, Map as MapLibreMap } from 'maplibre-gl';

/**
 * One tooltip line: [label, value], or [null, 'heading text'] for a title row.
 * Plain `string[]` pairs are accepted too: rows added with `...(cond ? [[k, v]] : [])` infer as such.
 */
export type TooltipRow = readonly [label: string | null, value: string] | readonly string[];

// #trail-tooltip is always in the markup (AeroTrackApp)
const el = (): HTMLElement => document.getElementById('trail-tooltip') as HTMLElement;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

/** rows: [[label, value], ...] or [[null, 'heading text']] */
export function showTooltip(map: MapLibreMap, rows: readonly TooltipRow[], lngLat: LngLatLike, offsetY = 5): void {
  clearTimeout(hideTimer ?? undefined);
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
export function hideTooltip(delay = 200): void {
  clearTimeout(hideTimer ?? undefined);
  if (delay) hideTimer = setTimeout(() => (el().hidden = true), delay);
  else el().hidden = true;
}
