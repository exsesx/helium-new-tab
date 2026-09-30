import { foregroundColors } from "./background.js";
import { readPinnedSites, readPreferences, resolvedFonts } from "./model.js";
import { PINNED_SITES_KEY, PREFERENCES_KEY } from "./storage.js";

// Text colors computed for a chosen color; style.css uses them in place of the tokens.
const CUSTOM_TEXT_COLORS = ["text", "secondary", "muted", "border"];

export function loadPreferences() {
  try {
    return readPreferences(JSON.parse(localStorage.getItem(PREFERENCES_KEY)));
  } catch {
    return readPreferences(null);
  }
}

export function loadPinnedSites() {
  try {
    return readPinnedSites(JSON.parse(localStorage.getItem(PINNED_SITES_KEY)));
  } catch {
    return readPinnedSites(null);
  }
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

  // Text over a chosen color follows the color, not the appearance.
  if (preferences.background === "color") {
    const colors = foregroundColors(preferences.backgroundColor);

    root.style.setProperty("--custom-bg", preferences.backgroundColor);
    root.dataset.foreground = colors.tone;

    for (const key of CUSTOM_TEXT_COLORS) {
      root.style.setProperty(`--custom-${key}`, colors[key]);
    }
  } else {
    root.style.removeProperty("--custom-bg");
    delete root.dataset.foreground;

    for (const key of CUSTOM_TEXT_COLORS) {
      root.style.removeProperty(`--custom-${key}`);
    }
  }

  root.dataset.showClock = String(preferences.showClock);
  root.dataset.showDate = String(preferences.showDate);
  root.dataset.showPinnedSites = String(preferences.showPinnedSites);
}
