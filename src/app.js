import { createTranslator, languages, resolveLanguage } from "./i18n/index.js";
import { createClock } from "./lib/clock.js";
import { readPinnedSites, readPreferences } from "./lib/model.js";
import { createSearchForm } from "./lib/search-form.js";
import {
  hasServiceIcons,
  onServiceIconsRevoked,
  requestServiceIcons,
  serviceIconsSupported,
} from "./lib/service-icons.js";
import { showSiteFavicons } from "./lib/site-favicons.js";
import { renderPinnedSites } from "./lib/site-tiles.js";
import { PINNED_SITES_KEY, PREFERENCES_KEY } from "./lib/storage.js";
import {
  createChangeOrder,
  createSyncWriter,
  deviceId,
  mergeSynced,
  onSyncedChange,
  readSynced,
} from "./lib/sync.js";
import { applyAppearance, loadPinnedSites } from "./lib/preferences.js";

const $ = (id) => document.getElementById(id);

// bootstrap.js runs first and has already validated and applied these.
let preferences = window.__heliumTabPreferences;
let pinned = window.__heliumTabSites ?? loadPinnedSites();
delete window.__heliumTabPreferences;
delete window.__heliumTabSites;

const translator = createTranslator();
const clock = createClock({ clock: $("clock"), date: $("date"), container: $("clock-block") });
const searchForm = createSearchForm({
  form: $("search-form"),
  input: $("search"),
  icon: $("search-icon"),
  service: $("search-service"),
  getPreferences: () => preferences,
  onError: () => notify(translator.text("searchError")),
});
const device = deviceId();
const syncWriter = createSyncWriter(() => preferences);
const changeOrder = createChangeOrder(device, preferences);
const sitesWriter = createSyncWriter(() => pinned, PINNED_SITES_KEY);
const sitesOrder = createChangeOrder(device, pinned);
let activeLocale;
let toastTimer;

function notify(message) {
  $("status").textContent = message;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("status").textContent = "";
  }, 3500);
}

function saveLocal(key = PREFERENCES_KEY, value = preferences) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    notify(translator.text("storageError"));
  }
}

// Typed font names wait for a pause; other changes sync at once so a quick close keeps them.
function save(key) {
  saveLocal();
  syncWriter.write();

  if (!key.endsWith("CustomFont")) {
    syncWriter.flush();
  }
}

window.addEventListener("pagehide", syncWriter.flush);
window.addEventListener("pagehide", sitesWriter.flush);

function applyPreferences(updateAppearance = true) {
  if (updateAppearance) {
    applyAppearance(preferences);
  }

  clock.update(preferences, activeLocale);
  void searchForm.updatePreview();
}

let settings;
let settingsLoading = false;

$("open-settings").addEventListener("click", async () => {
  if (settingsLoading) {
    return;
  }

  settingsLoading = true;
  $("open-settings").setAttribute("aria-busy", "true");

  try {
    if (!settings) {
      const { createSettings } = await import("./settings/panel.js");

      settings = createSettings({
        getPreferences: () => preferences,
        getPinnedSites: () => pinned.sites,
        translator,
        languages,
        onChange(key, value) {
          if (key === "showServiceIcons" && value) {
            return requestServiceIcons().then((granted) => updatePreference(key, granted));
          }

          updatePreference(key, value);
        },
        onPinnedSitesChange: updatePinnedSites,
      });
    }

    settings.open();
  } catch {
    notify(translator.text("settingsError"));
  } finally {
    settingsLoading = false;
    $("open-settings").removeAttribute("aria-busy");
  }
});

function updatePreference(key, value) {
  preferences[key] = value;
  changeOrder.stamp(preferences);

  if (key === "language") {
    void updateLanguage();
  } else if (key.endsWith("Font")) {
    applyAppearance(preferences);
  } else {
    applyPreferences();
  }

  if (key === "showServiceIcons" || key === "showPinnedSites") {
    renderSites();
  }

  save(key);
}

// Turn icons off when the permission was removed, such as from the extensions page.
function disableServiceIcons() {
  if (preferences.showServiceIcons) {
    updatePreference("showServiceIcons", false);
  }
}

onServiceIconsRevoked(disableServiceIcons);

if (preferences.showServiceIcons) {
  void hasServiceIcons().then((granted) => {
    if (!granted) {
      disableServiceIcons();
    }
  });
}

// Apply preferences changed by another tab or device. Returns whether anything changed.
function applyExternal(value) {
  if (!changeOrder.isCurrent(value)) {
    return false;
  }

  const next = readPreferences(value);

  if (JSON.stringify(next) === JSON.stringify(preferences)) {
    return false;
  }

  const rowChanged =
    next.showServiceIcons !== preferences.showServiceIcons ||
    next.showPinnedSites !== preferences.showPinnedSites;

  preferences = next;
  void updateLanguage(true);
  settings?.refresh();

  if (rowChanged) {
    renderSites();
  }

  return true;
}

window.addEventListener("storage", (event) => {
  if (event.key !== PREFERENCES_KEY && event.key !== null) {
    return;
  }

  try {
    applyExternal(JSON.parse(event.newValue));
  } catch {
    /* Ignore malformed external data. */
  }
});

onSyncedChange((value) => {
  const merged = mergeSynced(value, preferences);

  if (merged && applyExternal(merged)) {
    saveLocal();
  }
});

// Synced preferences win once they exist; otherwise this device seeds them.
void readSynced().then((value) => {
  const merged = mergeSynced(value, preferences);

  if (!merged) {
    syncWriter.write();
    syncWriter.flush();
  } else if (applyExternal(merged)) {
    saveLocal();
  }
});

// Pinned sites. bootstrap.js has already drawn them with letter tiles when they are on. While
// they are off, the list is kept and synced but the row stays empty.
function showsSiteFavicons() {
  return preferences.showServiceIcons && serviceIconsSupported();
}

function renderSites() {
  const row = $("pinned-sites");
  const links = [...row.querySelectorAll("a")];
  const focused = links.indexOf(document.activeElement);

  renderPinnedSites(row, preferences.showPinnedSites ? pinned.sites : []);

  // Keep keyboard focus in the row when another tab or device changes it.
  if (focused !== -1) {
    const next = row.querySelectorAll("a");
    next[Math.min(focused, next.length - 1)]?.focus();
  }

  if (showsSiteFavicons()) {
    void showSiteFavicons(row);
  }
}

if (showsSiteFavicons()) {
  void showSiteFavicons($("pinned-sites"));
}

function updatePinnedSites(sites) {
  pinned = { ...pinned, sites };
  sitesOrder.stamp(pinned);
  renderSites();

  saveLocal(PINNED_SITES_KEY, pinned);
  sitesWriter.write();
  sitesWriter.flush();
}

// Apply pinned sites changed by another tab or device. Returns whether anything changed.
function applyExternalSites(value) {
  if (!sitesOrder.isCurrent(value)) {
    return false;
  }

  const next = readPinnedSites(value);

  if (JSON.stringify(next) === JSON.stringify(pinned)) {
    return false;
  }

  pinned = next;
  renderSites();
  settings?.refresh();

  return true;
}

function isSyncedSites(value) {
  return Boolean(value) && typeof value === "object";
}

window.addEventListener("storage", (event) => {
  if (event.key !== PINNED_SITES_KEY && event.key !== null) {
    return;
  }

  try {
    applyExternalSites(JSON.parse(event.newValue));
  } catch {
    /* Ignore malformed external data. */
  }
});

onSyncedChange((value) => {
  if (isSyncedSites(value) && applyExternalSites(value)) {
    saveLocal(PINNED_SITES_KEY, pinned);
  }
}, PINNED_SITES_KEY);

// Synced sites win once they exist. Only a list with sites seeds them, so a new device cannot
// replace another device's list with an empty one before sync delivers it.
void readSynced(PINNED_SITES_KEY).then((value) => {
  if (isSyncedSites(value)) {
    if (applyExternalSites(value)) {
      saveLocal(PINNED_SITES_KEY, pinned);
    }
  } else if (pinned.sites.length > 0) {
    sitesWriter.write();
    sitesWriter.flush();
  }
});

void updateLanguage();

async function updateLanguage(updateAppearance = false) {
  const selection = resolveLanguage(preferences.language, navigator.languages);
  activeLocale = selection.locale;

  applyPreferences(updateAppearance);

  const result = await translator.select(selection.language);

  if (result.stale) {
    return;
  }

  document.documentElement.lang = result.failed ? "en" : selection.locale;
  translator.apply(document);

  if (result.failed) {
    notify(translator.text("languageError"));
  }
}

window.addEventListener("languagechange", () => {
  if (preferences.language === "auto") {
    void updateLanguage();
  }
});
