import { expect, test } from "bun:test";
import {
  BACKGROUND_COLORS,
  BACKGROUND_IMAGE_KEY,
  contrastRatio,
  foregroundColors,
  mixColors,
  loadBackgroundImage,
  foregroundFor,
  readBackgroundImage,
  relativeLuminance,
  imageForeground,
} from "../src/lib/background.js";
import { readPreferences } from "../src/lib/model.js";

const validImage = {
  averageColor: "#336699",
  thumbnail: "data:image/webp;base64,UklGRhYAAABXRUJQ",
  width: 5120,
  height: 2880,
  updatedAt: 1_700_000_000_000,
  foreground: "light",
};

test("accepts a color background and validates its color", () => {
  expect(readPreferences({ background: "color" }).background).toBe("color");
  expect(readPreferences({ background: "image" }).background).toBe("blend");

  expect(readPreferences({ backgroundColor: "#A9F2EB" }).backgroundColor).toBe("#a9f2eb");

  const fallback = readPreferences(null).backgroundColor;

  for (const invalid of ["red", "#abc", "#abcdefg", "abcdef", "#ggg000", 0xabcdef, null]) {
    expect(readPreferences({ backgroundColor: invalid }).backgroundColor).toBe(fallback);
  }
});

test("computes WCAG relative luminance", () => {
  expect(relativeLuminance("#000000")).toBe(0);
  expect(relativeLuminance("#ffffff")).toBeCloseTo(1);
  expect(relativeLuminance("#808080")).toBeCloseTo(0.2159, 4);
});

test("picks the text color with more contrast, switching near a luminance of 0.2", () => {
  expect(foregroundFor("#ffffff")).toBe("dark");
  expect(foregroundFor("#000000")).toBe("light");

  // Grays on either side of the point where both text colors have the same contrast.
  expect(relativeLuminance("#787878")).toBeLessThan(0.2);
  expect(foregroundFor("#787878")).toBe("light");

  expect(relativeLuminance("#7e7e7e")).toBeGreaterThan(0.2);
  expect(foregroundFor("#7e7e7e")).toBe("dark");

  for (const [color] of BACKGROUND_COLORS) {
    expect(foregroundFor(color)).toBe("dark");
  }
});

test("reads only placeholders that Customize could have written", () => {
  expect(readBackgroundImage(validImage)).toEqual(validImage);
  expect(readBackgroundImage({ ...validImage, averageColor: "#ABCDEF" }).averageColor).toBe(
    "#abcdef",
  );

  for (const invalid of [
    null,
    "data:image/webp;base64,AAAA",
    // The record from before the full image moved to IndexedDB.
    { dataUrl: validImage.thumbnail, averageColor: "#336699", updatedAt: 1 },
    { ...validImage, thumbnail: undefined },
    { ...validImage, thumbnail: "https://example.com/image.webp" },
    { ...validImage, thumbnail: "data:image/svg+xml;base64,PHN2Zz4=" },
    { ...validImage, thumbnail: 'data:image/webp;base64,AAAA");background:url("x' },
    { ...validImage, thumbnail: `data:image/webp;base64,${"A".repeat(10_000)}` },
    { ...validImage, width: 0 },
    { ...validImage, height: 1.5 },
    { ...validImage, width: 20_000 },
    { ...validImage, averageColor: "blue" },
    { ...validImage, updatedAt: "yesterday" },
    { ...validImage, foreground: "auto" },
  ]) {
    expect(readBackgroundImage(invalid)).toBeUndefined();
  }
});

function fakeLocalStorage(entries) {
  const items = new Map(Object.entries(entries));

  globalThis.localStorage = {
    getItem: (key) => items.get(key) ?? null,
    removeItem: (key) => items.delete(key),
  };

  return items;
}

test("loads a stored placeholder and discards a corrupt or outdated one", () => {
  const stored = fakeLocalStorage({ [BACKGROUND_IMAGE_KEY]: JSON.stringify(validImage) });

  expect(loadBackgroundImage()).toEqual(validImage);
  expect(stored.has(BACKGROUND_IMAGE_KEY)).toBe(true);

  const outdated = { dataUrl: validImage.thumbnail, averageColor: "#336699", updatedAt: 1 };

  for (const corrupt of ["{", JSON.stringify({ dataUrl: "x" }), JSON.stringify(outdated)]) {
    const items = fakeLocalStorage({ [BACKGROUND_IMAGE_KEY]: corrupt });

    expect(loadBackgroundImage()).toBeUndefined();
    expect(items.has(BACKGROUND_IMAGE_KEY)).toBe(false);
  }

  fakeLocalStorage({});

  expect(loadBackgroundImage()).toBeUndefined();

  delete globalThis.localStorage;
});

test("mixes colors in sRGB as CSS color-mix() does", () => {
  expect(mixColors("#000000", "#ffffff", 50)).toBe("#808080");
  expect(mixColors("#ff0000", "#0000ff", 100)).toBe("#ff0000");
  expect(mixColors("#ff0000", "#0000ff", 0)).toBe("#0000ff");
});

test("text over any chosen color stays readable, secondary and muted text included", () => {
  const presets = BACKGROUND_COLORS.map(([color]) => color);
  const darkest = presets.toSorted((a, b) => relativeLuminance(a) - relativeLuminance(b))[0];
  const lightest = presets.toSorted((a, b) => relativeLuminance(b) - relativeLuminance(a))[0];

  for (const color of [
    "#808080",
    "#ff0000",
    "#3366ff",
    "#767676",
    darkest,
    lightest,
    "#fafafa",
    "#0a0a0a",
  ]) {
    const colors = foregroundColors(color);

    for (const key of ["text", "secondary", "muted"]) {
      expect(contrastRatio(colors[key], color), `${key} on ${color}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("mid-tones get the strongest text of their tone", () => {
  expect(foregroundColors("#808080")).toMatchObject({ tone: "dark", text: "#000000" });
  expect(foregroundColors("#0a0a0a")).toMatchObject({ tone: "light", text: "#e3e5e5" });
});

test("pastels keep the default hierarchy of text, secondary, and muted", () => {
  for (const [color] of BACKGROUND_COLORS) {
    const colors = foregroundColors(color);
    const contrast = (key) => contrastRatio(colors[key], color);

    expect(colors.text).toBe("#292b2b");
    expect(contrast("text")).toBeGreaterThan(contrast("secondary"));
    expect(contrast("secondary")).toBeGreaterThan(contrast("muted"));
  }
});

test("a photo picks one text set by its brightness, and no overlay unless it is a mid-tone", () => {
  // Night, snow, and the lavender wallpaper all read without help.
  expect(imageForeground("#0b1020")).toEqual({ tone: "light", overlay: 0 });
  expect(imageForeground("#f5f6f5")).toEqual({ tone: "dark", overlay: 0 });
  expect(imageForeground("#9d8be6")).toEqual({ tone: "dark", overlay: 0 });

  // A mid-tone gets the least overlay that helps, never more than 15%.
  const middle = imageForeground("#7c7c7c");

  expect(middle.overlay).toBeGreaterThan(0);
  expect(middle.overlay).toBeLessThanOrEqual(15);
});

test("the photo overlay is 0 whenever the chosen text already reads at 4.5:1", () => {
  const text = { dark: "#292b2b", light: "#e3e5e5" };

  for (let gray = 0; gray <= 255; gray += 5) {
    const color = `#${gray.toString(16).padStart(2, "0").repeat(3)}`;
    const { tone, overlay } = imageForeground(color);

    if (contrastRatio(text[tone], color) >= 4.5) {
      expect(overlay, color).toBe(0);
    }

    expect(overlay, color).toBeLessThanOrEqual(15);
  }
});
