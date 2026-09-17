// User settings persisted in localStorage.
import type { Settings } from './types.ts';

// v2: satellite + navaids became the defaults, so older saved settings are not reused
const KEY = 'aerotrack.settings.v2';

const DEFAULTS: Settings = {
  // FR24 "estimated positions": keep moving aircraft we lost contact with, dimmed, for up to
  // this many minutes along their last track and speed. 0 disables. Server keeps up to 5.
  estimationMinutes: 2,
  mapStyle: 'satellite', // dark | light | streets | satellite
  brightness: 100, // basemap brightness % (FR24 map brightness), 40..140
  showAirports: true,
  showNavaids: true,
};

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Live settings object; mutate only through `saveSettings`. */
export const settings: Settings = load();

export function saveSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage disabled
  }
}
