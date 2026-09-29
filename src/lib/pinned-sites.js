import { searchDestination } from "./address.js";
import { PINNED_SITES_LIMIT, siteTitle, siteUrl } from "./model.js";

// Pins what the search field would open as a website. Returns the new list, or the reason it
// cannot: "full", "address" for text the search field would search for, or "duplicate".
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

  return { sites: [...sites, { url, title: siteTitle(title, url) }] };
}

// An empty name falls back to the site's hostname.
export function renamePinnedSite(sites, index, title) {
  return sites.map((site, position) =>
    position === index ? { ...site, title: siteTitle(title, site.url) } : site,
  );
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
