import { createTranslator, languages, resolveLanguage } from "./i18n/index.js";
import { createClock } from "./lib/clock.js";
import { readPreferences } from "./lib/model.js";
import { createSearchForm } from "./lib/search-form.js";
import { PREFERENCES_KEY } from "./lib/storage.js";
import { loadPreferences, applyAppearance } from "./lib/preferences.js";

const $ = (id) => document.getElementById(id);

const bootstrapped = Boolean(window.__heliumTabPreferences);
let preferences = window.__heliumTabPreferences ?? loadPreferences();
delete window.__heliumTabPreferences;

const translator = createTranslator();
const clock = createClock({ clock: $("clock"), date: $("date"), container: $("clock-block") });
const searchForm = createSearchForm({
  form: $("search-form"),
  input: $("search"),
  icon: $("search-icon"),
  getPreferences: () => preferences,
  onError: () => notify(translator.text("searchError")),
});
let activeLocale;
let toastTimer;

function notify(message) {
  $("status").textContent = message;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("status").textContent = "";
  }, 3500);
}

function save() {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    notify(translator.text("storageError"));
  }
}

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
          preferences[key] = value;

          if (key === "language") {
            void updateLanguage();
          } else if (key.endsWith("Font")) {
            applyAppearance(preferences);
          } else {
            applyPreferences();
          }

          save();
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

window.addEventListener("storage", (event) => {
  if (event.key !== PREFERENCES_KEY && event.key !== null) {
    return;
  }

  // Keep an in-progress edit intact; the next new tab loads the latest preferences.
  if (document.querySelector("dialog[open]")) {
    return;
  }

  try {
    preferences = readPreferences(JSON.parse(event.newValue));
    void updateLanguage(true);
  } catch {
    /* Ignore malformed external data. */
  }
});

void updateLanguage(!bootstrapped);

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
