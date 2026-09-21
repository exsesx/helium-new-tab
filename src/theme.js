import { loadPreferences, applyAppearance } from "./lib/preferences.js";
import { resolveLanguage } from "./i18n/languages.js";

const preferences = loadPreferences();
// The build extracts only these short titles from the translation catalogs.
const selection = resolveLanguage(preferences.language, navigator.languages);
document.title = __TAB_TITLES__[selection.language];
applyAppearance(preferences);
// Hand off the validated preferences without rereading storage or resolving fonts.
window.__quietTabPreferences = preferences;
