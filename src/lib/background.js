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
// Text over a chosen color never drops below WCAG AA for small text. Mid-tones need the
// strongest text of the chosen tone to reach it.
const MINIMUM_CONTRAST = 4.5;
const STRONGEST = { dark: "#000000", light: "#ffffff" };
// Secondary and muted text start this close to the text color, as the default grays do.
const SECONDARY_WEIGHT = 78;
const MUTED_WEIGHT = 62;

// Only encodings Customize writes, and only characters that cannot end a CSS url().
const IMAGE_DATA_URL = /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
// The scrim's range over an image, from a photo that already suits the text to one that is its
// opposite, such as a night photo under dark text.
const SCRIM_MIN = 18;
const SCRIM_MAX = 40;
const IMAGE_PROPERTIES = ["--background-image", "--image-bg", "--scrim-light", "--scrim-dark"];

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

const channels = (color) =>
  [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16));

// Mixes two #rrggbb colors in sRGB, as CSS color-mix() does, with weight percent of the first.
export function mixColors(first, second, weight) {
  const other = channels(second);
  const mixed = channels(first).map((value, index) => {
    const channel = Math.round((value * weight + other[index] * (100 - weight)) / 100);

    return channel.toString(16).padStart(2, "0");
  });

  return `#${mixed.join("")}`;
}

// The first mix from weight toward the text that is readable on the color.
function readableMix(text, color, weight) {
  for (let step = weight; step < 100; step += 2) {
    const mixed = mixColors(text, color, step);

    if (contrastRatio(mixed, color) >= MINIMUM_CONTRAST) {
      return mixed;
    }
  }

  return text;
}

// Text colors for a page in the chosen color: its tone, and text, secondary, muted, and border
// colors that keep secondary and muted text readable on mid-tones and saturated colors too.
export function foregroundColors(color) {
  const tone = foregroundFor(color);
  const token = FOREGROUNDS[tone];
  const text = contrastRatio(token, color) >= MINIMUM_CONTRAST ? token : STRONGEST[tone];

  return {
    tone,
    text,
    secondary: readableMix(text, color, SECONDARY_WEIGHT),
    muted: readableMix(text, color, MUTED_WEIGHT),
    border: mixColors(text, color, 20),
  };
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

// How strongly the scrim tones an image down in each appearance, in percent. A light scrim
// under dark text needs more strength the darker the photo is, and a dark scrim under light
// text the brighter it is. Perceived lightness is close to the square root of luminance.
export function scrimStrengths(averageColor) {
  const lightness = Math.sqrt(relativeLuminance(averageColor));
  const strength = (mismatch) => Math.round(SCRIM_MIN + mismatch * (SCRIM_MAX - SCRIM_MIN));

  return { light: strength(1 - lightness), dark: strength(lightness) };
}

// Paints the image over the synced background, with its average color underneath.
export function applyBackgroundImage(image) {
  const root = document.documentElement;

  if (!image) {
    delete root.dataset.backgroundImage;

    for (const property of IMAGE_PROPERTIES) {
      root.style.removeProperty(property);
    }

    return;
  }

  const strengths = scrimStrengths(image.averageColor);

  root.style.setProperty("--background-image", `url("${image.dataUrl}")`);
  root.style.setProperty("--image-bg", image.averageColor);
  root.style.setProperty("--scrim-light", `${strengths.light}%`);
  root.style.setProperty("--scrim-dark", `${strengths.dark}%`);
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
