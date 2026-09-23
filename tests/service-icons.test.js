import { afterEach, expect, test } from "bun:test";
import { serviceIconUrl } from "../src/lib/service-icons.js";

afterEach(() => {
  delete globalThis.chrome;
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
