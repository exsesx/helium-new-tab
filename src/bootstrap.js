import { loadPinnedSites, loadPreferences, applyAppearance } from "./lib/preferences.js";
import { renderPinnedSites } from "./lib/site-tiles.js";
import { resolveLanguage, translate } from "./i18n/languages.js";

const preferences = loadPreferences();
const pinned = loadPinnedSites();

// The build embeds only the page's own short messages from each translation catalog.
const selection = resolveLanguage(preferences.language, navigator.languages);
const messages = __PAGE_MESSAGES__[selection.language];
document.title = messages.newTab;
applyAppearance(preferences);

// Hand off the validated preferences without rereading storage or resolving fonts.
window.__heliumTabPreferences = preferences;
window.__heliumTabSites = pinned;

// Draw pinned sites as soon as the parser adds their row, before its first paint, so the page
// never shifts. Without sites the row stays hidden and takes no space.
if (pinned.sites.length > 0) {
  const observer = new MutationObserver(() => {
    const row = document.getElementById("pinned-sites");

    if (row) {
      observer.disconnect();
      renderPinnedSites(row, pinned.sites);
    }
  });

  observer.observe(document, { childList: true, subtree: true });
}

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
