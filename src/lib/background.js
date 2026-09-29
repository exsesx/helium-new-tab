// Background helpers that run before the first paint, so they stay small and synchronous.

// The image stays on this device. It is kept apart from the synced preferences, so other
// devices never point at an image they do not have.
export const BACKGROUND_IMAGE_KEY = "helium-tab-background";
// About 1.5 MB of data URL, well inside the page's local storage quota.
export const MAX_IMAGE_LENGTH = 1.5 * 1024 * 1024;
export const DEFAULT_BACKGROUND_COLOR = "#dbe4ff";

// Pastel tones from Helium's appearance palette, with the names Customize reads out.
export const BACKGROUND_COLORS = [
  ["#dbe4ff", "colorBlue"],
  ["#d7e9f0", "colorSky"],
  ["#a9f2eb", "colorAqua"],
  ["#c9f5b2", "colorGreen"],
  ["#dcecd6", "colorSage"],
  ["#fbe58a", "colorYellow"],
  ["#ffe0c6", "colorPeach"],
  ["#f9dccf", "colorCoral"],
  ["#fbdbe2", "colorPink"],
  ["#f4dbe1", "colorRose"],
  ["#f9d6f4", "colorOrchid"],
  ["#e3d9fd", "colorLavender"],
];

// The page's text colors in the light and dark appearance; see style.css.
const FOREGROUNDS = { dark: "#292b2b", light: "#e3e5e5" };

// Only encodings Customize writes, and only characters that cannot end a CSS url().
const IMAGE_DATA_URL = /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isHexColor(value) {
  return typeof value === "string" && HEX_COLOR.test(value);
}

// WCAG relative luminance of a #rrggbb color.
export function relativeLuminance(color) {
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(color.slice(start, start + 2), 16) / 255;

    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first, second) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  );

  return (lighter + 0.05) / (darker + 0.05);
}

// "dark" text on light colors and "light" text on dark ones, whichever has more contrast.
export function foregroundFor(color) {
  const dark = contrastRatio(color, FOREGROUNDS.dark);
  const light = contrastRatio(color, FOREGROUNDS.light);

  return dark >= light ? "dark" : "light";
}

// Returns the stored image, or undefined when the value is not one Customize wrote.
export function readBackgroundImage(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const { dataUrl, averageColor, updatedAt } = value;
  const hasImage =
    typeof dataUrl === "string" &&
    dataUrl.length <= MAX_IMAGE_LENGTH &&
    IMAGE_DATA_URL.test(dataUrl);

  if (!hasImage || !isHexColor(averageColor) || !Number.isFinite(updatedAt)) {
    return undefined;
  }

  return { dataUrl, averageColor: averageColor.toLowerCase(), updatedAt };
}

function parseBackgroundImage(stored) {
  try {
    return readBackgroundImage(JSON.parse(stored));
  } catch {
    return undefined;
  }
}

// Reads the image synchronously and discards an item that is not valid.
export function loadBackgroundImage() {
  try {
    const stored = localStorage.getItem(BACKGROUND_IMAGE_KEY);
    const image = stored === null ? undefined : parseBackgroundImage(stored);

    if (stored !== null && !image) {
      localStorage.removeItem(BACKGROUND_IMAGE_KEY);
    }

    return image;
  } catch {
    // Storage is unavailable, so the page keeps its synced background.
    return undefined;
  }
}

// Paints the image over the synced background, with its average color underneath.
export function applyBackgroundImage(image) {
  const root = document.documentElement;

  if (!image) {
    delete root.dataset.backgroundImage;
    root.style.removeProperty("--background-image");
    root.style.removeProperty("--image-bg");

    return;
  }

  root.style.setProperty("--background-image", `url("${image.dataUrl}")`);
  root.style.setProperty("--image-bg", image.averageColor);
  root.dataset.backgroundImage = "";
}

// Throws when local storage is full or unavailable.
export function saveBackgroundImage(image) {
  localStorage.setItem(BACKGROUND_IMAGE_KEY, JSON.stringify(image));
  applyBackgroundImage(image);
}

export function removeBackgroundImage() {
  try {
    localStorage.removeItem(BACKGROUND_IMAGE_KEY);
  } catch {
    /* Without storage the image was never kept; clear it from the page anyway. */
  }

  applyBackgroundImage(undefined);
}
