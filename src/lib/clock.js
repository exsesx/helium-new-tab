import { createDateFormatter, createTimeFormatter } from "./date-time.js";

export function createClock({ clock, date, container }) {
  let preferences;
  let locale;
  let timer;
  let timeFormatter;
  let timeFormatterKey;
  let dateFormatter;
  let clockParts = [];
  let lastDate;

  function renderTime(now) {
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

  function renderDate(now) {
    if (lastDate === now.toDateString()) {
      return;
    }

    const text = dateFormatter.format(now);

    if (date.textContent !== text) {
      date.textContent = text;
    }

    lastDate = now.toDateString();
  }

  function render() {
    const now = new Date();

    if (preferences.showClock) {
      renderTime(now);
    }

    if (preferences.showDate) {
      renderDate(now);
    }

    if (!container.dataset.ready) {
      container.dataset.ready = "true";
    }
  }

  function schedule() {
    clearTimeout(timer);

    if (!preferences || document.hidden || (!preferences.showClock && !preferences.showDate)) {
      return;
    }

    render();

    const interval = preferences.showClock && preferences.showSeconds ? 1000 : 60000;
    timer = setTimeout(schedule, interval - (Date.now() % interval));
  }

  document.addEventListener("visibilitychange", schedule);

  return {
    update(nextPreferences, nextLocale) {
      preferences = nextPreferences;

      if (locale !== nextLocale) {
        locale = nextLocale;
        dateFormatter = createDateFormatter(locale);
        date.lang = dateFormatter.resolvedOptions().locale;
        lastDate = undefined;
      }

      const formatterKey = `${locale}:${preferences.timeFormat}:${preferences.showSeconds}`;

      if (formatterKey !== timeFormatterKey) {
        timeFormatter = createTimeFormatter(preferences, locale);
        timeFormatterKey = formatterKey;
        clock.lang = timeFormatter.resolvedOptions().locale;
      }

      schedule();
    },
  };
}
