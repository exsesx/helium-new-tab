import { languages } from "../i18n/languages.js";

export const fonts = {
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
};

export const defaults = {
  theme: "system",
  background: "blend",
  language: "auto",
  showClock: true,
  timeFormat: "auto",
  showSeconds: false,
  showDate: true,
  showServiceIcons: false,
  uiFont: "system",
  monoFont: "system",
  uiCustomFont: "",
  monoCustomFont: "",
  clockFont: "inherit",
  dateFont: "inherit",
  searchFont: "inherit",
  clockCustomFont: "",
  dateCustomFont: "",
  searchCustomFont: "",
};

export function readPreferences(value) {
  const result = structuredClone(defaults);

  if (!value || typeof value !== "object") {
    return result;
  }

  if (["blend", "helium"].includes(value.background)) {
    result.background = value.background;
  }

  if (Object.hasOwn(languages, value.language)) {
    result.language = value.language;
  }

  if (["system", "light", "dark"].includes(value.theme)) {
    result.theme = value.theme;
  }

  if (typeof value.showClock === "boolean") {
    result.showClock = value.showClock;
  }

  if (["auto", "12h", "24h"].includes(value.timeFormat)) {
    result.timeFormat = value.timeFormat;
  }

  for (const key of ["showSeconds", "showDate", "showServiceIcons"]) {
    if (typeof value[key] === "boolean") {
      result[key] = value[key];
    }
  }

  for (const key of ["uiFont", "monoFont"]) {
    if (["system", "custom"].includes(value[key])) {
      result[key] = value[key];
    }
  }

  for (const key of ["clockFont", "dateFont", "searchFont"]) {
    if (["inherit", "ui", "mono", "custom"].includes(value[key])) {
      result[key] = value[key];
    }
  }

  // When and on which device these preferences last changed; see createChangeOrder.
  if (Number.isFinite(value.changedAt)) {
    result.changedAt = value.changedAt;
  }

  if (typeof value.changedBy === "string") {
    result.changedBy = value.changedBy.slice(0, 64);
  }

  for (const key of [
    "uiCustomFont",
    "monoCustomFont",
    "clockCustomFont",
    "dateCustomFont",
    "searchCustomFont",
  ]) {
    if (typeof value[key] === "string") {
      result[key] = value[key].slice(0, 120);
    }
  }

  return result;
}

export function fontFamily(customName = "", fallback = fonts.system) {
  const name = [...customName.trim()]
    .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    .join("");

  if (!name) {
    return fallback;
  }

  // A custom entry is one literal family name, never a CSS expression or URL.
  const escaped = name.replace(/[\\"]/g, "\\$&");

  return `"${escaped}", ${fallback}`;
}

export function resolvedFonts(preferences) {
  const ui = preferences.uiFont === "custom" ? fontFamily(preferences.uiCustomFont) : fonts.system;
  const mono =
    preferences.monoFont === "custom"
      ? fontFamily(preferences.monoCustomFont, fonts.mono)
      : fonts.mono;
  const result = { interface: ui, mono };

  // Components default to the UI font. The clock's tabular numbers keep it steady without Mono.
  for (const key of ["clock", "date", "search"]) {
    const choice = preferences[`${key}Font`];

    switch (choice) {
      case "custom":
        result[key] = fontFamily(preferences[`${key}CustomFont`], ui);
        break;

      case "mono":
        result[key] = mono;
        break;

      default:
        result[key] = ui;
    }
  }

  return result;
}
