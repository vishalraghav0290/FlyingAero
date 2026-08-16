// User settings persisted in localStorage.
const KEY = 'skyradar.settings';

const DEFAULTS = {
  // FR24 "estimated positions": keep moving aircraft we lost contact with, dimmed, for up to
  // this many minutes along their last track and speed. 0 disables. Server keeps up to 5.
  estimationMinutes: 2,
  mapStyle: 'dark', // dark | light | streets | satellite
  brightness: 100, // basemap brightness % (FR24 map brightness), 40..140
  showAirports: true,
  showNavaids: false, // FR24 navdata is off by default too
};

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = load();

export function saveSettings(patch) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage disabled
  }
}
