import { languages } from "../i18n/languages.js";

export const fonts = {
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
};

export const defaults = {
  fontVersion: 2,
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

  // Both light styles are white; preserve the effective dark style from older settings.
  const background = ["blend", "helium"].includes(value.background)
    ? value.background
    : value.darkBackground;

  if (["blend", "helium"].includes(background)) {
    result.background = background;
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
  } else if (typeof value.hour24 === "boolean") {
    result.timeFormat = value.hour24 ? "24h" : "12h";
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

  // Preserve deliberately chosen fonts from the original per-component settings.
  if (value.fontVersion !== 2) {
    const legacyNames = {
      rounded: "Arial Rounded MT Bold",
      serif: "Georgia",
      humanist: "Avenir Next",
    };

    for (const [oldKey, newKey] of [
      ["interface", "ui"],
      ["clock", "clock"],
      ["date", "date"],
    ]) {
      const oldFont = value[`${oldKey}Font`];

      if (oldFont === "custom" && typeof value[`${oldKey}CustomFont`] === "string") {
        result[`${newKey}Font`] = "custom";
        result[`${newKey}CustomFont`] = value[`${oldKey}CustomFont`].slice(0, 120);
      } else if (Object.hasOwn(legacyNames, oldFont)) {
        result[`${newKey}Font`] = "custom";
        result[`${newKey}CustomFont`] = legacyNames[oldFont];
      } else if (oldFont === "mono") {
        result[`${newKey}Font`] = newKey === "ui" ? "custom" : "mono";

        if (newKey === "ui") {
          result.uiCustomFont = "Menlo";
        }
      }
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
