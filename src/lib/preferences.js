import { readPreferences, resolvedFonts } from "./model.js";

export function loadPreferences() {
  try {
    return readPreferences(JSON.parse(localStorage.getItem("quiet-tab")));
  } catch {
    return readPreferences(null);
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
  root.dataset.showClock = String(preferences.showClock);
  root.dataset.showDate = String(preferences.showDate);
}
