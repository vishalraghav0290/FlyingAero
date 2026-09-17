// Map style menu: basemap picker, brightness (FR24 "map brightness"), airports toggle.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { THEMES, theme, themeById, buildStyle } from './mapstyles.ts';
import { settings, saveSettings } from './settings.ts';
import { renderPreviews } from './previews.ts';

/** Element by id; the menu markup is rendered by AeroTrackApp, so these always exist. */
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Settings toggled by the menu's checkboxes. */
type ToggleSetting = 'showAirports' | 'showNavaids';

export interface StyleMenuOptions {
  map: MapLibreMap;
  /** Called after the basemap or a layer toggle changed. */
  onChange: () => void;
}

/** Brightness applies to the basemap canvas only; aircraft draw on deck.gl's own canvas. */
export function applyBrightness(map: MapLibreMap, value: number): void {
  map.getCanvas().style.filter = value === 100 ? '' : `brightness(${value}%)`;
}

export function initStyleMenu({ map, onChange }: StyleMenuOptions): void {
  const menu = $('style-menu');
  const toggle = $('style-toggle');
  const options = $('style-options');

  let previewsStarted = false;
  const setOpen = (open: boolean): void => {
    if (open && !previewsStarted) {
      previewsStarted = true; // render only when the menu is first opened
      renderPreviews((id: string, url: string) => {
        const img = options.querySelector<HTMLImageElement>(`img[data-preview="${id}"]`);
        if (img) img.src = url;
      });
    }
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) options.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  };
  // `hidden` is typed boolean | 'until-found'; this menu only ever uses true / false
  toggle.addEventListener('click', () => setOpen(menu.hidden === true));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      toggle.focus();
      e.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as Node | null;
    if (!menu.hidden && !menu.contains(target) && !toggle.contains(target)) setOpen(false);
  });

  const render = (): void => {
    for (const btn of options.children as HTMLCollectionOf<HTMLElement>) {
      btn.setAttribute('aria-checked', String(btn.dataset.id === theme.current.id));
    }
  };

  for (const t of THEMES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'style-option';
    btn.setAttribute('role', 'radio');
    btn.dataset.id = t.id;
    const img = document.createElement('img');
    img.alt = '';
    img.dataset.preview = t.id;
    const label = document.createElement('span');
    label.textContent = t.label;
    btn.append(img, label);
    btn.addEventListener('click', async () => {
      if (theme.current.id === t.id) return;
      theme.current = themeById(t.id);
      saveSettings({ mapStyle: t.id });
      render();
      map.setStyle(await buildStyle(theme.current), { diff: false });
      onChange();
    });
    options.append(btn);
  }
  // arrow keys move between options (radio group pattern)
  options.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const btns = [...(options.children as HTMLCollectionOf<HTMLElement>)];
    const i = btns.indexOf(document.activeElement as HTMLElement);
    const next = btns[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + btns.length) % btns.length];
    next.focus();
    next.click();
    e.preventDefault();
  });
  render();

  const slider = $<HTMLInputElement>('brightness');
  const out = $<HTMLOutputElement>('brightness-value');
  slider.value = String(settings.brightness);
  out.textContent = `${settings.brightness}%`;
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    out.textContent = `${v}%`;
    applyBrightness(map, v);
    saveSettings({ brightness: v });
  });

  const toggles: [id: string, key: ToggleSetting][] = [['show-airports', 'showAirports'], ['show-navaids', 'showNavaids']];
  for (const [id, key] of toggles) {
    const box = $<HTMLInputElement>(id);
    box.checked = settings[key];
    box.addEventListener('change', () => {
      saveSettings({ [key]: box.checked });
      onChange();
    });
  }
}
