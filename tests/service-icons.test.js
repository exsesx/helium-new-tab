import { afterEach, expect, test } from "bun:test";
import { cachedServiceIconUrl, serviceIconUrl } from "../src/lib/service-icons.js";

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
