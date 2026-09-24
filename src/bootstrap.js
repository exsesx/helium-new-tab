import { loadPreferences, applyAppearance } from "./lib/preferences.js";
import { loadCatalog, resolveLanguage } from "./i18n/languages.js";

const preferences = loadPreferences();

// The build extracts only these short titles from the translation catalogs.
const selection = resolveLanguage(preferences.language, navigator.languages);
document.title = __TAB_TITLES__[selection.language];
applyAppearance(preferences);

// Hand off the validated preferences without rereading storage or resolving fonts.
window.__heliumTabPreferences = preferences;

// Other languages start loading now, and the page's English text stays hidden until app.js
// applies them, so a new tab never paints the wrong language first.
if (selection.language !== "en") {
  const messages = loadCatalog(selection.language);

  // app.js reports failures; this only keeps an early one from being logged as unhandled.
  messages.catch(() => {});

  document.documentElement.dataset.translating = "";
  window.__heliumTabCatalog = { language: selection.language, messages };
}
