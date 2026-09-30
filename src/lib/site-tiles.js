// Draws pinned sites. bootstrap.js uses this before the first paint, so it stays small and
// shows letter tiles only; app.js swaps in cached favicons afterwards.
import { siteHost } from "./model.js";

// Pastels from Helium's appearance palette. Each light tone has a darker text color of the same
// hue, and a deep variant of that hue for dark appearances, where the pastel becomes the text.
// Every pair keeps at least 5.5:1 contrast.
export const pastels = [
  { name: "blue", light: "#dbe4ff", lightText: "#33448f", dark: "#2d3657", darkText: "#dbe4ff" },
  { name: "steel", light: "#d7e9f0", lightText: "#2c5566", dark: "#2a3d45", darkText: "#d7e9f0" },
  { name: "teal", light: "#a9f2eb", lightText: "#1d625b", dark: "#1f4541", darkText: "#a9f2eb" },
  { name: "green", light: "#c9f5b2", lightText: "#356420", dark: "#2d4524", darkText: "#c9f5b2" },
  { name: "sage", light: "#dcecd6", lightText: "#3f5a35", dark: "#34402f", darkText: "#dcecd6" },
  { name: "yellow", light: "#fbe58a", lightText: "#6b5500", dark: "#4a4020", darkText: "#fbe58a" },
  { name: "peach", light: "#ffe0c6", lightText: "#8a4513", dark: "#523a28", darkText: "#ffe0c6" },
  { name: "sand", light: "#f9dccf", lightText: "#7f4630", dark: "#4d3830", darkText: "#f9dccf" },
  { name: "rose", light: "#fbdbe2", lightText: "#8a3448", dark: "#4f3238", darkText: "#fbdbe2" },
  { name: "mauve", light: "#f4dbe1", lightText: "#6f4450", dark: "#463539", darkText: "#f4dbe1" },
  { name: "pink", light: "#f9d6f4", lightText: "#7d3571", dark: "#4b3148", darkText: "#f9d6f4" },
  {
    name: "lavender",
    light: "#e3d9fd",
    lightText: "#4c3a8c",
    dark: "#3a3354",
    darkText: "#e3d9fd",
  },
];

// FNV-1a, so a site gets the same color on every device and in every session.
function hash(text) {
  let value = 0x811c9dc5;

  for (const char of text) {
    value ^= char.codePointAt(0);
    value = Math.imul(value, 0x01000193);
  }

  return value >>> 0;
}

export function siteTone(url) {
  return pastels[hash(siteHost(url)) % pastels.length];
}

export function siteLetter(title) {
  const [first = ""] = title.trim();
  const [letter = ""] = first.toUpperCase();

  return letter;
}

export function createSiteIcon(site) {
  const icon = document.createElement("span");
  const tone = siteTone(site.url);

  icon.className = "site-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.dataset.origin = new URL(site.url).origin;
  icon.textContent = siteLetter(site.title);

  // style.css picks the light or dark pair for the current appearance.
  icon.style.setProperty("--tone", tone.light);
  icon.style.setProperty("--tone-text", tone.lightText);
  icon.style.setProperty("--tone-dark", tone.dark);
  icon.style.setProperty("--tone-dark-text", tone.darkText);

  return icon;
}

// Real links, so plain, modified, and middle clicks open them the way the browser does.
export function renderPinnedSites(container, sites) {
  const list = document.createElement("ul");

  for (const site of sites) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    const title = document.createElement("span");

    link.className = "pinned-site";
    link.href = site.url;
    link.rel = "noreferrer";
    title.className = "pinned-title";
    title.textContent = site.title;

    link.append(createSiteIcon(site), title);
    item.append(link);
    list.append(item);
  }

  container.replaceChildren(...(sites.length > 0 ? [list] : []));
  container.hidden = sites.length === 0;
}
