export function createDateFormatter(locales) {
  return new Intl.DateTimeFormat(locales, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function createTimeFormatter(preferences, locales) {
  return new Intl.DateTimeFormat(locales, {
    hour: "numeric",
    minute: "2-digit",
    second: preferences.showSeconds ? "2-digit" : undefined,
    hourCycle:
      preferences.timeFormat === "24h"
        ? "h23"
        : preferences.timeFormat === "12h"
          ? "h12"
          : undefined,
  });
}
