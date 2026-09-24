import { createTranslator, languages, loadCatalog, resolveLanguage } from "./i18n/index.js";
import { createClock } from "./lib/clock.js";
import { readPreferences } from "./lib/model.js";
import { createSearchForm } from "./lib/search-form.js";
import {
  hasServiceIcons,
  onServiceIconsRevoked,
  requestServiceIcons,
} from "./lib/service-icons.js";
import { PREFERENCES_KEY } from "./lib/storage.js";
import { createSyncWriter, mergeSynced, onSyncedChange, readSynced } from "./lib/sync.js";
import { applyAppearance } from "./lib/preferences.js";

const $ = (id) => document.getElementById(id);

// bootstrap.js runs first and has already validated and applied these.
let preferences = window.__heliumTabPreferences;
delete window.__heliumTabPreferences;

// bootstrap.js already requested the startup language; later selections load normally.
let earlyCatalog = window.__heliumTabCatalog;
delete window.__heliumTabCatalog;

const translator = createTranslator((language) => {
  const early = earlyCatalog;
  earlyCatalog = undefined;

  return early?.language === language ? early.messages : loadCatalog(language);
});
const clock = createClock({ clock: $("clock"), date: $("date"), container: $("clock-block") });
const searchForm = createSearchForm({
  form: $("search-form"),
  input: $("search"),
  icon: $("search-icon"),
  service: $("search-service"),
  getPreferences: () => preferences,
  onError: () => notify(translator.text("searchError")),
});
const syncWriter = createSyncWriter(() => preferences);
let activeLocale;
let toastTimer;

function notify(message) {
  $("status").textContent = message;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("status").textContent = "";
  }, 3500);
}

function saveLocal() {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    notify(translator.text("storageError"));
  }
}

// Typed font names wait for a pause; other changes sync at once so a quick close keeps them.
function save(key) {
  saveLocal();
  syncWriter.write(key);

  if (!key.endsWith("CustomFont")) {
    syncWriter.flush();
  }
}

window.addEventListener("pagehide", syncWriter.flush);

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
        translator,
        languages,
        onChange(key, value) {
          if (key === "showServiceIcons" && value) {
            return requestServiceIcons().then((granted) => updatePreference(key, granted));
          }

          updatePreference(key, value);
        },
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

  if (key === "language") {
    void updateLanguage();
  } else if (key.endsWith("Font")) {
    applyAppearance(preferences);
  } else {
    applyPreferences();
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

// Apply preferences changed by another tab or device, keeping changes made here that have not
// been sent yet, such as a font name being typed. Returns whether anything changed.
function applyExternal(value) {
  const next = readPreferences({ ...value, ...syncWriter.unsent() });

  if (JSON.stringify(next) === JSON.stringify(preferences)) {
    return false;
  }

  preferences = next;
  void updateLanguage(true);
  settings?.refresh();

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
    syncWriter.write(...Object.keys(preferences));
    syncWriter.flush();
  } else if (applyExternal(merged)) {
    saveLocal();
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
  delete document.documentElement.dataset.translating;

  if (result.failed) {
    notify(translator.text("languageError"));
  }
}

window.addEventListener("languagechange", () => {
  if (preferences.language === "auto") {
    void updateLanguage();
  }
});
