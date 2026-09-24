import { loadPreferences, applyAppearance } from "./lib/preferences.js";
import { resolveLanguage } from "./i18n/languages.js";
import { translate } from "./i18n/translate.js";

const preferences = loadPreferences();

// The build embeds only the page's own short messages from each translation catalog.
const selection = resolveLanguage(preferences.language, navigator.languages);
const messages = __PAGE_MESSAGES__[selection.language];
document.title = messages.newTab;
applyAppearance(preferences);

// Hand off the validated preferences without rereading storage or resolving fonts.
window.__heliumTabPreferences = preferences;

// Translate the page while it is parsed, so it never paints English first. Observer callbacks
// run before the browser can paint parsed content. Customize loads its full catalog later.
if (selection.language !== "en") {
  const translatePage = () => translate(document, (key) => messages[key]);
  const observer = new MutationObserver(translatePage);

  document.documentElement.lang = selection.locale;
  observer.observe(document, { childList: true, subtree: true });

  document.addEventListener(
    "readystatechange",
    () => {
      observer.disconnect();
      translatePage();
    },
    { once: true },
  );
}
