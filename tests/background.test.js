import { expect, test } from "bun:test";
import {
  BACKGROUND_COLORS,
  BACKGROUND_IMAGE_KEY,
  contrastRatio,
  foregroundColors,
  mixColors,
  loadBackgroundImage,
  foregroundFor,
  MAX_IMAGE_LENGTH,
  readBackgroundImage,
  relativeLuminance,
} from "../src/lib/background.js";
import { readPreferences } from "../src/lib/model.js";

const validImage = {
  dataUrl: "data:image/webp;base64,UklGRhYAAABXRUJQ",
  averageColor: "#336699",
  updatedAt: 1_700_000_000_000,
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

test("reads only stored images that Customize could have written", () => {
  expect(readBackgroundImage(validImage)).toEqual(validImage);
  expect(readBackgroundImage({ ...validImage, averageColor: "#ABCDEF" }).averageColor).toBe(
    "#abcdef",
  );

  for (const invalid of [
    null,
    "data:image/webp;base64,AAAA",
    { ...validImage, dataUrl: undefined },
    { ...validImage, dataUrl: "https://example.com/image.webp" },
    { ...validImage, dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" },
    { ...validImage, dataUrl: 'data:image/webp;base64,AAAA");background:url("x' },
    { ...validImage, dataUrl: `data:image/webp;base64,${"A".repeat(MAX_IMAGE_LENGTH)}` },
    { ...validImage, averageColor: "blue" },
    { ...validImage, updatedAt: "yesterday" },
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

test("loads a stored image and discards a corrupt one", () => {
  const stored = fakeLocalStorage({ [BACKGROUND_IMAGE_KEY]: JSON.stringify(validImage) });

  expect(loadBackgroundImage()).toEqual(validImage);
  expect(stored.has(BACKGROUND_IMAGE_KEY)).toBe(true);

  for (const corrupt of ["{", JSON.stringify({ dataUrl: "x" })]) {
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
