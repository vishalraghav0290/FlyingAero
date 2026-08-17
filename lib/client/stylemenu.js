// Map style menu: basemap picker, brightness (FR24 "map brightness"), airports toggle.
import { THEMES, theme, themeById, buildStyle } from './mapstyles.js';
import { settings, saveSettings } from './settings.js';
import { renderPreviews } from './previews.js';

const $ = (id) => document.getElementById(id);

/** Brightness applies to the basemap canvas only; aircraft draw on deck.gl's own canvas. */
export function applyBrightness(map, value) {
  map.getCanvas().style.filter = value === 100 ? '' : `brightness(${value}%)`;
}

export function initStyleMenu({ map, onChange }) {
  const menu = $('style-menu');
  const toggle = $('style-toggle');
  const options = $('style-options');

  let previewsStarted = false;
  const setOpen = (open) => {
    if (open && !previewsStarted) {
      previewsStarted = true; // render only when the menu is first opened
      renderPreviews((id, url) => {
        const img = options.querySelector(`img[data-preview="${id}"]`);
        if (img) img.src = url;
      });
    }
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) options.querySelector('[aria-checked="true"]')?.focus();
  };
  toggle.addEventListener('click', () => setOpen(menu.hidden));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      toggle.focus();
      e.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
  });

  const render = () => {
    for (const btn of options.children) btn.setAttribute('aria-checked', String(btn.dataset.id === theme.current.id));
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
    const btns = [...options.children];
    const i = btns.indexOf(document.activeElement);
    const next = btns[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + btns.length) % btns.length];
    next.focus();
    next.click();
    e.preventDefault();
  });
  render();

  const slider = $('brightness');
  const out = $('brightness-value');
  slider.value = settings.brightness;
  out.textContent = `${settings.brightness}%`;
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    out.textContent = `${v}%`;
    applyBrightness(map, v);
    saveSettings({ brightness: v });
  });

  for (const [id, key] of [['show-airports', 'showAirports'], ['show-navaids', 'showNavaids']]) {
    const box = $(id);
    box.checked = settings[key];
    box.addEventListener('change', () => {
      saveSettings({ [key]: box.checked });
      onChange();
    });
  }
}
