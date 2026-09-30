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
  bands: ["#1e2a3a", "#2a3a4a"],
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
    // A placeholder from before the text set was chosen by the bands behind the content.
    { ...validImage, bands: undefined },
    { ...validImage, bands: ["#1e2a3a"] },
    { ...validImage, bands: ["#1e2a3a", "dark green"] },
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

test("a photo's text set reads on both bands behind the content, with the soft halo", () => {
  // Night, snow, and a pale lavender read on both bands.
  expect(imageForeground(["#0b1020", "#01455c"])).toEqual({
    tone: "light",
    halo: "soft",
    overlay: 0,
  });
  expect(imageForeground(["#f9fafa", "#f5f6f5"])).toEqual({
    tone: "dark",
    halo: "soft",
    overlay: 0,
  });
  expect(imageForeground(["#e3d9fd", "#d9cdf5"])).toEqual({
    tone: "dark",
    halo: "soft",
    overlay: 0,
  });
});

test("the band behind the clock decides, not the whole photo", () => {
  // A bright photo whose middle is a dark green band: dark text would vanish on the band.
  const { tone } = imageForeground(["#2e5a2a", "#316b28"]);

  expect(tone).toBe("light");
});

test("when no set reads on both bands, the better worst band wins and gets the strong halo", () => {
  const text = { dark: "#292b2b", light: "#e3e5e5" };
  // A warm stripe behind the search field and a dark green band behind the clock.
  const bands = ["#c06464", "#316b28"];
  const result = imageForeground(bands);
  const worst = (tone) => Math.min(...bands.map((band) => contrastRatio(text[tone], band)));
  const other = result.tone === "light" ? "dark" : "light";

  expect(worst(result.tone)).toBeLessThan(4.5);
  expect(worst(result.tone)).toBeGreaterThan(worst(other));
  expect(result).toMatchObject({ halo: "strong", overlay: 0 });
});

test("an overlay comes only after the strong halo, where even large text is below 3:1", () => {
  const text = { dark: "#292b2b", light: "#e3e5e5" };

  // One band white and one black: nothing reads, so the capped overlay helps as it can.
  const extreme = imageForeground(["#ffffff", "#000000"]);

  expect(extreme.halo).toBe("strong");
  expect(extreme.overlay).toBeGreaterThan(0);
  expect(extreme.overlay).toBeLessThanOrEqual(15);

  for (let gray = 0; gray <= 255; gray += 5) {
    const color = `#${gray.toString(16).padStart(2, "0").repeat(3)}`;
    const { tone, halo, overlay } = imageForeground([color, color]);
    const contrast = contrastRatio(text[tone], color);

    expect(halo, color).toBe(contrast >= 4.5 ? "soft" : "strong");

    if (contrast >= 3) {
      expect(overlay, color).toBe(0);
    }

    expect(overlay, color).toBeLessThanOrEqual(15);
  }
});
