import { createTranslator, languages, resolveLanguage } from "./i18n/index.js";
import { readPreferences } from "./lib/model.js";
import { resolveSearchDestination } from "./lib/search.js";
import { createSearchIcon } from "./lib/search-icon.js";
import { preferencesKey } from "./lib/storage.js";
import { loadPreferences, applyAppearance } from "./lib/preferences.js";
import { createDateFormatter, createTimeFormatter } from "./lib/date-time.js";

const $ = (id) => document.getElementById(id);
const clock = $("clock");
const date = $("date");
const clockBlock = $("clock-block");

const bootstrapped = Boolean(window.__heliumTabPreferences);
let preferences = window.__heliumTabPreferences ?? loadPreferences();
delete window.__heliumTabPreferences;

const translator = createTranslator();
let activeLocale;
let clockTimer;
let toastTimer;
let timeFormatter;
let timeFormatterKey;
let dateFormatter;
let clockParts = [];
let lastDate;

function notify(message) {
  $("status").textContent = message;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("status").textContent = "";
  }, 3500);
}

function save() {
  try {
    localStorage.setItem(preferencesKey, JSON.stringify(preferences));
  } catch {
    notify(translator.text("storageError"));
  }
}

function updateClock() {
  const now = new Date();

  if (preferences.showClock) {
    const parts = timeFormatter.formatToParts(now);

    // Rebuild only when the locale or format changes the arrangement of time parts.
    if (
      parts.length !== clockParts.length ||
      parts.some((part, index) => part.type !== clockParts[index].type)
    ) {
      clockParts = parts.map(({ type }) => ({ type, node: document.createTextNode("") }));
      clock.replaceChildren(
        ...clockParts.map(({ type, node }) => {
          if (type !== "dayPeriod") {
            return node;
          }

          const period = document.createElement("span");
          period.className = "day-period";
          period.append(node);

          return period;
        }),
      );
    }

    parts.forEach(({ value }, index) => {
      const { node } = clockParts[index];

      if (node.data !== value) {
        node.data = value;
      }
    });

    const timestamp = now.toISOString();

    if (clock.dateTime !== timestamp) {
      clock.dateTime = timestamp;
    }
  }

  if (preferences.showDate && lastDate !== now.toDateString()) {
    const text = dateFormatter.format(now);

    if (date.textContent !== text) {
      date.textContent = text;
    }

    lastDate = now.toDateString();
  }

  if (!clockBlock.dataset.ready) {
    clockBlock.dataset.ready = "true";
  }
}

function applyPreferences(updateAppearance = true) {
  const formatterKey = `${activeLocale}:${preferences.timeFormat}:${preferences.showSeconds}`;

  if (formatterKey !== timeFormatterKey) {
    timeFormatter = createTimeFormatter(preferences, activeLocale);
    timeFormatterKey = formatterKey;
    clock.lang = timeFormatter.resolvedOptions().locale;
  }

  if (updateAppearance) {
    applyAppearance(preferences);
  }

  scheduleClock();
  void updateSearchPreview();
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
const showSearchIcon = createSearchIcon($("search-icon"));
let searchRevision = 0;

async function updateSearchPreview() {
  const revision = ++searchRevision;
  let destination;

  if (!preferences.showServiceIcons) {
    showSearchIcon();
  }

  try {
    destination = await resolveSearchDestination($("search").value);
  } catch {
    // A missing catalog leaves the default search icon visible.
  }

  if (revision !== searchRevision) {
    return;
  }

  showSearchIcon(preferences.showServiceIcons ? destination?.favicon : "");
}

$("search").addEventListener("input", updateSearchPreview);

$("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const destination = await resolveSearchDestination($("search").value);

    if (destination.url) {
      location.assign(destination.url);

      return;
    }

    if (!destination.query) {
      $("search").focus();

      return;
    }

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
  if (event.key !== preferencesKey && event.key !== null) {
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

  if (document.hidden || (!preferences.showClock && !preferences.showDate)) {
    return;
  }

  updateClock();

  const interval = preferences.showClock && preferences.showSeconds ? 1000 : 60000;
  clockTimer = setTimeout(scheduleClock, interval - (Date.now() % interval));
}

document.addEventListener("visibilitychange", scheduleClock);

async function updateLanguage(updateAppearance = false) {
  const selection = resolveLanguage(preferences.language, navigator.languages);

  if (activeLocale !== selection.locale) {
    activeLocale = selection.locale;
    dateFormatter = createDateFormatter(activeLocale);
    date.lang = dateFormatter.resolvedOptions().locale;
    lastDate = undefined;
  }

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
