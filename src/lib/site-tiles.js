// Draws pinned sites. bootstrap.js uses this before the first paint, so it stays small and
// shows letter tiles only; app.js swaps in cached favicons afterwards.
import { siteHost } from "./model.js";
import { pastels } from "./palette.js";

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
