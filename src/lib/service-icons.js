// Service icons come from the browser's own favicon cache, so typing sends no requests.
const PERMISSION = { permissions: ["favicon"] };

export function serviceIconsSupported() {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.permissions?.request === "function" &&
    typeof chrome.runtime?.getURL === "function"
  );
}

// Call directly from a user action so the browser can show its permission prompt.
export async function requestServiceIcons() {
  if (!serviceIconsSupported()) {
    return false;
  }

  try {
    return await chrome.permissions.request(PERMISSION);
  } catch {
    return false;
  }
}

export async function hasServiceIcons() {
  if (!serviceIconsSupported()) {
    return false;
  }

  try {
    return await chrome.permissions.contains(PERMISSION);
  } catch {
    return false;
  }
}

export function onServiceIconsRevoked(listener) {
  if (!serviceIconsSupported()) {
    return;
  }

  chrome.permissions.onRemoved?.addListener(({ permissions = [] }) => {
    if (permissions.includes("favicon")) {
      listener();
    }
  });
}

// Matches the .search-favicon width in style.css.
const ICON_SIZE = 20;

export function serviceIconUrl(origin, pixelRatio = globalThis.devicePixelRatio || 1) {
  // Ask for the screen's device pixels; the browser returns its closest cached size.
  const size = Math.ceil(ICON_SIZE * pixelRatio);
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", origin);
  url.searchParams.set("size", String(size));

  return url.href;
}

// The favicon cache answers every site it has no icon for with the same generic globe.
const UNKNOWN_SITE = "https://unknown.invalid";
const cachedIcons = new Map();

async function readIcon(url) {
  const response = await fetch(url);

  return new Uint8Array(await response.arrayBuffer());
}

function sameBytes(first, second) {
  return first.length === second.length && first.every((byte, index) => byte === second[index]);
}

// Resolves to the icon URL, or "" when the browser has no icon of its own for the site.
export function cachedServiceIconUrl(origin, pixelRatio = globalThis.devicePixelRatio || 1) {
  const url = serviceIconUrl(origin, pixelRatio);

  if (!cachedIcons.has(url)) {
    const genericUrl = serviceIconUrl(UNKNOWN_SITE, pixelRatio);
    const check = Promise.all([readIcon(url), readIcon(genericUrl)])
      .then(([icon, generic]) => (sameBytes(icon, generic) ? "" : url))
      .catch(() => "");

    cachedIcons.set(url, check);
  }

  return cachedIcons.get(url);
}
