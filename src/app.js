import { createTranslator, languages, resolveLanguage } from "./i18n/index.js";
import { readPreferences, searchDestination } from "./lib/model.js";
import { loadPreferences, applyAppearance } from "./lib/preferences.js";
import { createDateFormatter, createTimeFormatter } from "./lib/date-time.js";

const $ = (id) => document.getElementById(id);

const bootstrapped = Boolean(window.__quietTabPreferences);
let preferences = window.__quietTabPreferences ?? loadPreferences();
delete window.__quietTabPreferences;

const translator = createTranslator();
let activeLocale;
let clockTimer;
let toastTimer;
let timeFormatter;
let dateFormatter;

function notify(message) {
  $("status").textContent = message;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("status").textContent = "";
  }, 3500);
}

function save() {
  try {
    localStorage.setItem("quiet-tab", JSON.stringify(preferences));
  } catch {
    notify(translator.text("storageError"));
  }
}

function updateClock() {
  const now = new Date();
  const parts = timeFormatter.formatToParts(now);

  // Preserve locale ordering, spacing, and direction, including prefixed day periods.
  $("clock").replaceChildren(
    ...parts.map((part) => {
      if (part.type !== "dayPeriod") {
        return document.createTextNode(part.value);
      }

      const period = document.createElement("span");
      period.className = "day-period";
      period.textContent = part.value;

      return period;
    }),
  );

  $("clock").dateTime = now.toISOString();
  $("date").textContent = dateFormatter.format(now);
  $("clock-block").dataset.ready = "true";
}

function applyPreferences(updateAppearance = true) {
  timeFormatter = createTimeFormatter(preferences, activeLocale);
  $("clock").lang = timeFormatter.resolvedOptions().locale;

  if (updateAppearance) {
    applyAppearance(preferences);
  }

  scheduleClock();
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

const nativeSearch = typeof chrome !== "undefined" && typeof chrome.search?.query === "function";

$("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const destination = searchDestination($("search").value);

  if (destination.url) {
    location.assign(destination.url);

    return;
  }

  if (!destination.query) {
    $("search").focus();

    return;
  }

  try {
    if (nativeSearch) {
      await chrome.search.query({ text: destination.query, disposition: "CURRENT_TAB" });
    } else {
      location.assign(`https://duckduckgo.com/?q=${encodeURIComponent(destination.query)}`);
    }
  } catch {
    notify(translator.text("searchError"));
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && event.target === $("search") && !event.isComposing) {
    event.preventDefault();
    event.target.blur();

    return;
  }

  if (
    event.key === "/" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !document.querySelector("dialog[open]") &&
    !event.target.matches("input, textarea, select, [contenteditable]")
  ) {
    event.preventDefault();
    $("search").focus();
  }
});

window.addEventListener("storage", (event) => {
  if (event.key !== "quiet-tab" && event.key !== null) {
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

function scheduleClock() {
  clearTimeout(clockTimer);

  if (document.hidden) {
    return;
  }

  updateClock();

  if (!preferences.showClock && !preferences.showDate) {
    return;
  }

  const interval = preferences.showClock && preferences.showSeconds ? 1000 : 60000;
  clockTimer = setTimeout(scheduleClock, interval - (Date.now() % interval));
}

document.addEventListener("visibilitychange", scheduleClock);

async function updateLanguage(updateAppearance = false) {
  const selection = resolveLanguage(preferences.language, navigator.languages);
  activeLocale = selection.locale;
  dateFormatter = createDateFormatter(activeLocale);
  $("date").lang = dateFormatter.resolvedOptions().locale;
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
