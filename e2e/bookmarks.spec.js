import { expect, test } from "@playwright/test";

async function mockBookmarks(page, { granted = true, count = 4 } = {}) {
  await page.route("**/_favicon/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="4" fill="#6688bb"/></svg>',
    }),
  );
  await page.addInitScript(
    ({ granted, count }) => {
      const listeners = {};
      window.bookmarkCalls = 0;
      window.permissionRequests = [];
      window.bookmarkAccess = true;
      window.bookmarkNodes = Array.from({ length: count }, (_, index) => ({
        id: String(index + 10),
        title: ["GitHub", "Helium", "Wikipedia", "Design inspiration"][index % 4],
        url: `https://example.com/${index}`,
      }));
      window.emitBookmarkEvent = (name, value) =>
        listeners[name]?.forEach((listener) => listener(value));
      const event = (name) => ({
        addListener(listener) {
          (listeners[name] ??= []).push(listener);
        },
      });

      window.chrome ??= {};
      chrome.runtime = { getURL: (path) => new URL(path, location.origin).href };
      chrome.permissions = {
        request: async (value) => {
          window.permissionRequests.push(value);

          return granted;
        },
        contains: async ({ permissions }) =>
          !permissions.includes("bookmarks") || window.bookmarkAccess,
        onRemoved: event("permissionRemoved"),
        onAdded: event("permissionAdded"),
      };
      chrome.bookmarks = {
        getTree: async () => {
          window.bookmarkCalls++;

          return [{ children: [{ id: "1", children: window.bookmarkNodes }] }];
        },
        ...Object.fromEntries(
          [
            "onCreated",
            "onRemoved",
            "onChanged",
            "onMoved",
            "onChildrenReordered",
            "onImportEnded",
          ].map((name) => [name, event(name)]),
        ),
      };
    },
    { granted, count },
  );
}

async function enableBookmarks(page) {
  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("switch", { name: "Show bookmarks", exact: true }).check();
}

test("opt-in bookmarks show cached icons and persist without storing bookmark contents", async ({
  page,
}) => {
  await mockBookmarks(page);
  await page.goto("/");

  await expect(page.locator("#bookmarks")).toBeHidden();
  expect(await page.evaluate(() => window.bookmarkCalls)).toBe(0);
  expect(await page.evaluate(() => window.permissionRequests)).toEqual([]);

  await enableBookmarks(page);
  await expect(page.locator(".bookmark-link")).toHaveCount(4);
  await expect(page.locator(".bookmark-icon img")).toHaveCount(4);
  expect(await page.evaluate(() => window.permissionRequests)).toEqual([
    { permissions: ["bookmarks", "favicon"] },
  ]);
  await page.getByRole("button", { name: "Close settings" }).click();

  const gap = await page.evaluate(
    () =>
      document.querySelector("#bookmarks").getBoundingClientRect().top -
      document.querySelector("#clock-block").getBoundingClientRect().bottom,
  );
  expect(gap).toBeGreaterThanOrEqual(28);
  await expect(page.locator(".bookmark-link").first()).toHaveAttribute(
    "href",
    "https://example.com/0",
  );
  await page.reload();

  await expect(page.locator(".bookmark-link")).toHaveCount(4);
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).toContain("showBookmarks");
  expect(stored).not.toContain("https://example.com");
});

test("permission denial leaves the switch off and never reads bookmarks", async ({ page }) => {
  await mockBookmarks(page, { granted: false });
  await page.goto("/");
  await page.getByRole("button", { name: "Customize" }).click();
  await page.locator("#show-bookmarks").click();

  await expect(page.locator("#show-bookmarks")).not.toBeChecked();
  await expect(page.locator("#bookmarks")).toBeHidden();
  expect(await page.evaluate(() => window.bookmarkCalls)).toBe(0);
});

test("tile style uses borderless squares with larger icons above titles and persists", async ({
  page,
}) => {
  await mockBookmarks(page);
  await page.goto("/");
  await enableBookmarks(page);
  await expect(page.locator("#bookmarks")).toHaveAttribute("data-style", "bar");
  await page.getByLabel("Bookmark style", { exact: true }).selectOption("tiles");
  await expect(page.locator("#bookmarks")).toHaveAttribute("data-style", "tiles");
  await expect(page.locator(".bookmark-icon img")).toHaveCount(4);
  await page.getByRole("button", { name: "Close settings" }).click();

  const tile = await page
    .locator(".bookmark-link")
    .first()
    .evaluate((link) => {
      const box = link.getBoundingClientRect();
      const image = link.querySelector("img");
      const icon = image.getBoundingClientRect();
      const title = link.querySelector(".bookmark-title").getBoundingClientRect();

      return {
        width: box.width,
        height: box.height,
        iconSize: icon.width,
        titleBelowIcon: title.top >= icon.bottom,
        border: getComputedStyle(link).borderWidth,
        background: getComputedStyle(link).backgroundColor,
        requestedSize: new URL(image.src).searchParams.get("size"),
      };
    });

  expect(tile).toMatchObject({
    width: 96,
    height: 96,
    iconSize: 32,
    titleBelowIcon: true,
    border: "0px",
    background: "rgba(0, 0, 0, 0)",
  });
  expect(Number(tile.requestedSize)).toBeGreaterThanOrEqual(32);

  await page.reload();
  await expect(page.locator("#bookmarks")).toHaveAttribute("data-style", "tiles");
  await page.getByRole("button", { name: "Customize" }).click();
  await expect(page.getByLabel("Bookmark style", { exact: true })).toHaveValue("tiles");
  await page.getByLabel("Bookmark style", { exact: true }).selectOption("bar");

  await expect(page.locator("#bookmarks")).toHaveAttribute("data-style", "bar");
  await expect(page.locator(".bookmark-icon img").first()).toHaveCSS("width", "16px");
});

test("tile rows wrap in narrow windows and the style control follows bookmark visibility", async ({
  page,
}) => {
  await mockBookmarks(page, { count: 10 });
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/");
  await page.getByRole("button", { name: "Customize" }).click();
  await expect(page.getByLabel("Bookmark style", { exact: true })).toBeDisabled();
  await page.locator("#show-bookmarks").check();
  await page.getByLabel("Bookmark style", { exact: true }).selectOption("tiles");
  await expect(page.locator(".bookmark-link")).toHaveCount(10);
  await page.getByRole("button", { name: "Close settings" }).click();

  const layout = await page.locator("#bookmarks").evaluate((bar) => {
    const links = bar.querySelectorAll("a");

    return {
      wraps: links[3].getBoundingClientRect().top > links[0].getBoundingClientRect().top,
      fits:
        bar.scrollWidth === bar.clientWidth && document.documentElement.scrollWidth <= innerWidth,
    };
  });

  expect(layout).toEqual({ wraps: true, fits: true });
});

test("bookmark edits update live, empty bars explain what to do, and revocation hides links", async ({
  page,
}) => {
  await mockBookmarks(page);
  await page.goto("/");
  await enableBookmarks(page);
  await expect(page.locator(".bookmark-link")).toHaveCount(4);

  await page.evaluate(() => {
    window.bookmarkNodes[0].title = "Renamed bookmark";
    window.emitBookmarkEvent("onChanged");
  });
  await expect(page.locator(".bookmark-link").first()).toHaveText("Renamed bookmark");

  await page.evaluate(() => {
    window.bookmarkNodes = [];
    window.emitBookmarkEvent("onRemoved");
  });
  await expect(page.locator("#bookmarks")).toContainText("Add links to your browser");

  await page.evaluate(() => {
    window.bookmarkAccess = false;
    window.emitBookmarkEvent("permissionRemoved", { permissions: ["bookmarks"] });
  });
  await expect(page.locator("#show-bookmarks")).not.toBeChecked();
  await expect(page.locator("#bookmarks")).toBeHidden();
});

test("long bookmark rows scroll inside narrow windows and hiding them stops reads", async ({
  page,
}) => {
  await mockBookmarks(page, { count: 20 });
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/");
  await enableBookmarks(page);
  await expect(page.locator(".bookmark-link")).toHaveCount(20);
  await page.getByRole("button", { name: "Close settings" }).click();

  const layout = await page.evaluate(() => {
    const bar = document.querySelector("#bookmarks");

    return {
      scrolls: bar.scrollWidth > bar.clientWidth,
      fits: document.documentElement.scrollWidth <= innerWidth,
    };
  });
  expect(layout).toEqual({ scrolls: true, fits: true });

  await page.getByRole("button", { name: "Customize" }).click();
  await page.locator("#show-bookmarks").uncheck();
  await expect(page.locator("#bookmarks")).toBeHidden();
  const reads = await page.evaluate(() => window.bookmarkCalls);
  await page.evaluate(() => window.emitBookmarkEvent("onChanged"));
  await page.waitForTimeout(150);

  expect(await page.evaluate(() => window.bookmarkCalls)).toBe(reads);
});
