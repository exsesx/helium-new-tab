import { searchDestination } from "./address.js";
import {
  PINNED_SITES_BYTES,
  PINNED_SITES_KEY,
  PINNED_SITES_LIMIT,
  siteTitle,
  siteUrl,
} from "./model.js";

const encoder = new TextEncoder();
// The widest change stamp readPinnedSites keeps, so a list that fits now still fits once stamped.
const WIDEST_STAMP = { changedAt: Number.MAX_SAFE_INTEGER, changedBy: "x".repeat(64) };

// The bytes the synced item takes: its key and the JSON value createSyncWriter writes.
export function pinnedSitesBytes(sites) {
  const value = JSON.stringify({ sites, ...WIDEST_STAMP });

  return encoder.encode(PINNED_SITES_KEY).length + encoder.encode(value).length;
}

// Pins what the search field would open as a website. Returns the new list, or the reason it
// cannot: "full", "address" for text the search field would search for, "duplicate", or "size"
// when the list would no longer fit in one synced item.
export function addPinnedSite(sites, address, title = "") {
  if (sites.length >= PINNED_SITES_LIMIT) {
    return { error: "full" };
  }

  const url = siteUrl(searchDestination(address).url);

  if (!url) {
    return { error: "address" };
  }

  if (sites.some((site) => site.url === url)) {
    return { error: "duplicate" };
  }

  const next = [...sites, { url, title: siteTitle(title, url) }];

  if (pinnedSitesBytes(next) > PINNED_SITES_BYTES) {
    return { error: "size" };
  }

  return { sites: next };
}

// An empty name falls back to the site's hostname. Returns the new list, or "size" when a longer
// name would no longer fit in one synced item.
export function renamePinnedSite(sites, index, title) {
  const next = sites.map((site, position) =>
    position === index ? { ...site, title: siteTitle(title, site.url) } : site,
  );
  const bytes = pinnedSitesBytes(next);
  // A list that is already too large, such as one kept from before this limit, can still shrink.
  const outgrowsSync = bytes > PINNED_SITES_BYTES && bytes > pinnedSitesBytes(sites);

  if (outgrowsSync) {
    return { error: "size" };
  }

  return { sites: next };
}

// Swaps a site with its neighbor; moves past either end change nothing.
export function movePinnedSite(sites, index, offset) {
  const target = index + offset;

  if (target < 0 || target >= sites.length) {
    return sites;
  }

  const result = [...sites];
  [result[index], result[target]] = [result[target], result[index]];

  return result;
}

export function removePinnedSite(sites, index) {
  return sites.filter((_, position) => position !== index);
}
