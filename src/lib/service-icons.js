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

// Sites such as GitHub swap favicons with the color scheme, so the cache can hold a white icon
// while the page is light. These match --search-focus-bg in style.css.
const LIGHT_FIELD = [255, 255, 255];
const DARK_FIELD = [59, 60, 60];

function luminance(red, green, blue) {
  const [r, g, b] = [red, green, blue].map((value) => {
    const channel = value / 255;

    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// True when almost no opaque pixel stands out from the background, like a white logo on white.
export function blendsInto(pixels, background) {
  const backgroundLuminance = luminance(...background);
  let opaque = 0;
  let visible = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) {
      continue;
    }

    const pixelLuminance = luminance(pixels[index], pixels[index + 1], pixels[index + 2]);
    const lighter = Math.max(pixelLuminance, backgroundLuminance);
    const darker = Math.min(pixelLuminance, backgroundLuminance);

    opaque++;

    if ((lighter + 0.05) / (darker + 0.05) >= 2) {
      visible++;
    }
  }

  return opaque > 0 && visible < opaque * 0.1;
}

// Marks icons that vanish on a light or dark field; style.css flips them in that theme only.
export function markIconTone(image) {
  try {
    const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

    image.classList.toggle("is-light", blendsInto(data, LIGHT_FIELD));
    image.classList.toggle("is-dark", blendsInto(data, DARK_FIELD));
  } catch {
    // An unreadable icon is shown as it is.
  }
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
