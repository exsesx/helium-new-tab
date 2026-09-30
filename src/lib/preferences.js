import {
  PINNED_SITES_KEY,
  PREFERENCES_KEY,
  readPinnedSites,
  readPreferences,
  resolvedFonts,
} from "./model.js";

// Validates a locally stored item, falling back to its defaults when it is missing or broken.
function readStored(key, read) {
  try {
    return read(JSON.parse(localStorage.getItem(key)));
  } catch {
    return read(null);
  }
}

export function loadPreferences() {
  return readStored(PREFERENCES_KEY, readPreferences);
}

export function loadPinnedSites() {
  return readStored(PINNED_SITES_KEY, readPinnedSites);
}

export function applyAppearance(preferences) {
  const root = document.documentElement;

  if (preferences.theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = preferences.theme;
  }

  for (const [key, family] of Object.entries(resolvedFonts(preferences))) {
    root.style.setProperty(`--${key}-font`, family);
  }

  root.dataset.background = preferences.background;
  root.dataset.showClock = String(preferences.showClock);
  root.dataset.showDate = String(preferences.showDate);
  root.dataset.showPinnedSites = String(preferences.showPinnedSites);
}
