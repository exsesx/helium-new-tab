export function createDateFormatter(locales) {
  return new Intl.DateTimeFormat(locales, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function createTimeFormatter(preferences, locales) {
  let hourCycle;

  switch (preferences.timeFormat) {
    case "24h":
      hourCycle = "h23";
      break;

    case "12h":
      hourCycle = "h12";
      break;
  }

  return new Intl.DateTimeFormat(locales, {
    hour: "numeric",
    minute: "2-digit",
    second: preferences.showSeconds ? "2-digit" : undefined,
    hourCycle,
  });
}
