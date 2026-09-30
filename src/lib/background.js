// Background helpers that run before the first paint, so they stay small and synchronous.

// The image stays on this device, kept apart from the synced preferences so other devices never
// point at an image they do not have. Local storage holds only a small placeholder for the
// first paint; the full image is in IndexedDB, see background-photo.js.
export const BACKGROUND_IMAGE_KEY = "helium-tab-background";
// The longest side an image is kept at; larger ones are scaled down when they are chosen.
export const MAX_IMAGE_SIDE = 5120;
// A placeholder's thumbnail is about 1 KB; anything much larger is not one Customize wrote.
const MAX_THUMBNAIL_LENGTH = 8 * 1024;
const TONES = ["light", "dark"];
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
// A photo is shown as it is. Only a mid-tone photo, where neither text set reads well, gets a
// faint overlay in the color opposite its text, and never more than this, in percent.
const MAX_IMAGE_OVERLAY = 15;
const OVERLAY_COLORS = { dark: "#ffffff", light: "#000000" };
const IMAGE_PROPERTIES = ["--image-thumbnail", "--image-bg", "--image-overlay"];

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

// Returns the stored placeholder, or undefined when the value is not one Customize wrote, such as
// an image record from before the full image moved to IndexedDB.
export function readBackgroundImage(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const { averageColor, thumbnail, width, height, updatedAt, foreground } = value;
  const hasThumbnail =
    typeof thumbnail === "string" &&
    thumbnail.length <= MAX_THUMBNAIL_LENGTH &&
    IMAGE_DATA_URL.test(thumbnail);
  const hasSize = [width, height].every(
    (side) => Number.isInteger(side) && side > 0 && side <= MAX_IMAGE_SIDE,
  );
  const isValid =
    hasThumbnail &&
    hasSize &&
    isHexColor(averageColor) &&
    Number.isFinite(updatedAt) &&
    TONES.includes(foreground);

  if (!isValid) {
    return undefined;
  }

  return {
    averageColor: averageColor.toLowerCase(),
    thumbnail,
    width,
    height,
    updatedAt,
    foreground,
  };
}

function parseBackgroundImage(stored) {
  try {
    return readBackgroundImage(JSON.parse(stored));
  } catch {
    return undefined;
  }
}

// Reads the placeholder synchronously and discards an item that is not valid.
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

// The overlay, in percent, that brings a text set to 4.5:1 on a photo's average color: the least
// that does, up to MAX_IMAGE_OVERLAY, and 0 whenever the text reads without it.
function imageOverlay(averageColor, tone) {
  const text = FOREGROUNDS[tone];
  const readable = (overlay) =>
    contrastRatio(text, mixColors(OVERLAY_COLORS[tone], averageColor, overlay)) >= MINIMUM_CONTRAST;
  let overlay = 0;

  while (overlay < MAX_IMAGE_OVERLAY && !readable(overlay)) {
    overlay++;
  }

  return overlay;
}

// The text set for a photo's page, chosen by the photo as a chosen color's page is, whatever the
// appearance: "dark" text on bright photos and "light" text on dark ones, with the overlay a
// mid-tone photo needs.
export function imageForeground(averageColor) {
  const tone = foregroundFor(averageColor);

  return { tone, overlay: imageOverlay(averageColor, tone) };
}

// Paints the placeholder over the synced background: the photo's average color and a blurred
// thumbnail, under the text set chosen when the photo was. background-photo.js paints the full
// image over it.
export function applyBackgroundImage(image) {
  const root = document.documentElement;

  if (!image) {
    delete root.dataset.backgroundImage;
    delete root.dataset.imageForeground;

    for (const property of IMAGE_PROPERTIES) {
      root.style.removeProperty(property);
    }

    return;
  }

  const tone = image.foreground;
  const overlay = imageOverlay(image.averageColor, tone);

  root.style.setProperty("--image-thumbnail", `url("${image.thumbnail}")`);
  root.style.setProperty("--image-bg", image.averageColor);
  root.style.setProperty(
    "--image-overlay",
    `color-mix(in srgb, ${OVERLAY_COLORS[tone]} ${overlay}%, transparent)`,
  );
  root.dataset.imageForeground = tone;
  root.dataset.backgroundImage = "";
}
