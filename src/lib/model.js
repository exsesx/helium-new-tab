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
  typeToSearch: true,
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

  for (const key of ["showSeconds", "showDate", "showServiceIcons", "typeToSearch"]) {
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

// Pinned sites keep one row tidy and their synced item small.
export const PINNED_SITES_LIMIT = 8;
export const SITE_TITLE_LIMIT = 40;
export const SITE_URL_LIMIT = 2048;

// The normalized http(s) address of a pinned site, or "" for anything else.
export function siteUrl(value) {
  if (typeof value !== "string" || value.length > SITE_URL_LIMIT) {
    return "";
  }

  try {
    const url = new URL(value);
    const isWebsite = url.protocol === "https:" || url.protocol === "http:";

    if (!isWebsite || !url.hostname || url.username || url.password) {
      return "";
    }

    return url.href.length > SITE_URL_LIMIT ? "" : url.href;
  } catch {
    return "";
  }
}

// The hostname without a leading www., which names and colors a site by default.
export function siteHost(url) {
  return new URL(url).hostname.replace(/^www\./, "");
}

// A one-line title of limited length, or the site's hostname when none is left.
export function siteTitle(value, url) {
  const text = typeof value === "string" ? value : "";
  const printable = [...text.trim()].filter((char) => char.charCodeAt(0) >= 32 && char !== "\x7f");
  const title = printable.slice(0, SITE_TITLE_LIMIT).join("").trim();

  return title || siteHost(url);
}

export function readPinnedSites(value) {
  const result = { sites: [] };

  if (!value || typeof value !== "object") {
    return result;
  }

  const entries = Array.isArray(value.sites) ? value.sites : [];
  const seen = new Set();

  for (const entry of entries) {
    const url = siteUrl(entry?.url);

    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    result.sites.push({ url, title: siteTitle(entry.title, url) });

    if (result.sites.length === PINNED_SITES_LIMIT) {
      break;
    }
  }

  // Ordered like preferences; see createChangeOrder.
  if (Number.isFinite(value.changedAt)) {
    result.changedAt = value.changedAt;
  }

  if (typeof value.changedBy === "string") {
    result.changedBy = value.changedBy.slice(0, 64);
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
