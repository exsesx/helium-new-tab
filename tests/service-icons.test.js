import { afterEach, expect, test } from "bun:test";
import { blendsInto, cachedServiceIconUrl, serviceIconUrl } from "../src/lib/service-icons.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  delete globalThis.chrome;
  globalThis.fetch = originalFetch;
});

test("requests icons at the screen's device pixel size", () => {
  globalThis.chrome = { runtime: { getURL: (path) => `chrome-extension://id${path}` } };

  for (const [pixelRatio, size] of [
    [1, "20"],
    [1.25, "25"],
    [2, "40"],
    [3, "60"],
  ]) {
    const url = new URL(serviceIconUrl("https://www.youtube.com", pixelRatio));

    expect(url.href).toStartWith("chrome-extension://id/_favicon/?");
    expect(url.searchParams.get("pageUrl")).toBe("https://www.youtube.com");
    expect(url.searchParams.get("size")).toBe(size);
  }
});

test("keeps the search icon when the browser only has its generic globe", async () => {
  const globe = [71, 76, 79, 66, 69];
  const icons = new Map([
    ["https://unknown.invalid", globe],
    ["https://kagi.com", globe],
    ["https://www.youtube.com", [89, 84]],
  ]);
  globalThis.chrome = { runtime: { getURL: (path) => `chrome-extension://id${path}` } };
  globalThis.fetch = async (url) => {
    const icon = icons.get(new URL(url).searchParams.get("pageUrl"));

    return new Response(new Uint8Array(icon));
  };

  const youtube = await cachedServiceIconUrl("https://www.youtube.com", 1);
  const kagi = await cachedServiceIconUrl("https://kagi.com", 1);

  expect(new URL(youtube).searchParams.get("pageUrl")).toBe("https://www.youtube.com");
  expect(kagi).toBe("");
});

test("keeps the search icon when the favicon cache cannot be read", async () => {
  globalThis.chrome = { runtime: { getURL: (path) => `chrome-extension://id${path}` } };
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  expect(await cachedServiceIconUrl("https://github.com", 1)).toBe("");
});

function pixels(...colors) {
  return new Uint8ClampedArray(colors.flatMap(([color, count]) => Array(count).fill(color).flat()));
}

test("finds icons that vanish on a light or a dark search field", () => {
  const light = [255, 255, 255];
  const dark = [59, 60, 60];
  const whiteLogo = pixels([[255, 255, 255, 255], 90], [[0, 0, 0, 0], 10]);
  const blackLogo = pixels([[31, 35, 40, 255], 90], [[255, 255, 255, 0], 10]);
  const redPlayButton = pixels([[255, 0, 0, 255], 80], [[255, 255, 255, 255], 20]);
  const lightTileWithMark = pixels([[255, 255, 255, 255], 85], [[0, 0, 0, 255], 15]);
  const transparent = pixels([[255, 255, 255, 0], 100]);

  expect(blendsInto(whiteLogo, light)).toBe(true);
  expect(blendsInto(whiteLogo, dark)).toBe(false);
  expect(blendsInto(blackLogo, dark)).toBe(true);
  expect(blendsInto(blackLogo, light)).toBe(false);

  for (const icon of [redPlayButton, lightTileWithMark, transparent]) {
    expect(blendsInto(icon, light)).toBe(false);
    expect(blendsInto(icon, dark)).toBe(false);
  }
});
