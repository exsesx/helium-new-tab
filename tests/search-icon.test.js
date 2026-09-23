import { expect, test } from "bun:test";
import { createSearchIcon } from "../src/lib/search-icon.js";
import manifest from "../src/manifest.json";

test("service changes clear stale icons, late loads cannot win, and failed icons can retry", async () => {
  const OriginalImage = globalThis.Image;
  const images = [];
  const hidden = new Set();
  const container = {
    children: [],
    firstElementChild: {
      classList: { add: (value) => hidden.add(value), remove: (value) => hidden.delete(value) },
    },
    append(image) {
      this.children.push(image);
    },
  };

  globalThis.Image = class {
    className = "";
    classList = {
      remove: (value) => {
        this.className = this.className.replace(value, "");
      },
    };

    constructor() {
      images.push(this);
    }

    removeAttribute(name) {
      delete this[name];
    }

    remove() {
      container.children = container.children.filter((image) => image !== this);
    }
  };

  const showIcon = createSearchIcon(container);

  try {
    showIcon("https://example.com/youtube.png");
    await Bun.sleep(175);
    images[0].onload();

    expect(hidden.has("is-hidden")).toBe(true);

    showIcon("https://example.com/github.png");

    expect(hidden.has("is-hidden")).toBe(false);
    expect(images[0].className).not.toContain("is-visible");

    await Bun.sleep(175);
    const lateLoad = images[1].onload;
    showIcon("https://example.com/x.png");
    lateLoad();

    expect(hidden.has("is-hidden")).toBe(false);
    expect(images[1].src).toBeUndefined();
    expect(container.children).not.toContain(images[1]);

    await Bun.sleep(175);
    images[2].onerror();
    showIcon("https://example.com/x.png");
    await Bun.sleep(175);
    images[3].onload();

    expect(images).toHaveLength(4);
    expect(hidden.has("is-hidden")).toBe(true);

    showIcon("https://example.com/x.png");
    await Bun.sleep(175);

    expect(images).toHaveLength(4);

    showIcon("https://example.com/cancelled.png");
    showIcon();
    await Bun.sleep(200);

    expect(images).toHaveLength(4);
    expect(hidden.has("is-hidden")).toBe(false);
    expect(container.children).toHaveLength(0);
  } finally {
    showIcon();
    globalThis.Image = OriginalImage;
  }
});

test("service icons need only an optional favicon permission", () => {
  expect(manifest.permissions).toEqual(["search", "storage"]);
  expect(manifest.optional_permissions).toEqual(["favicon"]);
});
