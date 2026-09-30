import { expect, test } from "@playwright/test";
import {
  contrastRatio,
  foregroundColors,
  foregroundFor,
  imageForeground,
} from "../src/lib/background.js";

const PREFERENCES_KEY = "helium-tab";
const BACKGROUND_IMAGE_KEY = "helium-tab-background";

// Keep navigations local: answer every remote request with an empty page.
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>remote</title>" }),
  );
});

async function savePreferences(page, preferences) {
  await page.goto("/");
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, JSON.stringify(value)),
    [PREFERENCES_KEY, preferences],
  );
}

test("loads without errors or remote requests", async ({ page }) => {
  const errors = [];
  const remote = [];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1")) {
      remote.push(request.url());
    }
  });

  await page.goto("/");

  await expect(page.locator("#clock")).not.toBeEmpty();
  await expect(page.locator("#date")).not.toBeEmpty();
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

for (const [name, colorScheme, preferences, background] of [
  ["light device", "light", {}, "rgb(255, 255, 255)"],
  ["dark device", "dark", {}, "rgb(30, 32, 32)"],
  ["forced dark", "light", { theme: "dark" }, "rgb(30, 32, 32)"],
  ["forced light", "dark", { theme: "light" }, "rgb(255, 255, 255)"],
  ["Helium dark", "dark", { background: "helium" }, "rgb(59, 60, 60)"],
]) {
  test(`paints the ${name} background`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await savePreferences(page, preferences);

    await page.reload();

    const color = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(color).toBe(background);
  });
}

test("settings changes apply at once and persist", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("switch", { name: "Show clock" }).uncheck();

  await expect(page.locator("h1")).toBeHidden();
  await expect(page.getByLabel("Time format")).toBeDisabled();

  await page.keyboard.press("Escape");
  await page.reload();

  await expect(page.locator("h1")).toBeHidden();
  await expect(page.locator("#date")).toBeVisible();
});

test("reduced motion fades Customize in place instead of sliding it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).click();
  const dialog = page.getByRole("dialog");

  await expect(dialog).toHaveCSS("opacity", "1");
  await expect(dialog).toHaveCSS("transform", "none");
});

test("the dark background setting is disabled in a light appearance", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByLabel("Appearance").selectOption("light");

  await expect(page.getByLabel("Dark background")).toBeDisabled();

  await page.getByLabel("Appearance").selectOption("system");

  await expect(page.getByLabel("Dark background")).toBeEnabled();
});

test("Customize closes on a backdrop click but not after a dragged selection", async ({ page }) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog");

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByLabel("UI", { exact: true }).selectOption("custom");
  const field = page.getByLabel("UI font family");
  await field.fill("JetBrains Mono");

  // Measure the field only after the panel finishes sliding in, with the field in its middle.
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  await field.evaluate((element) => element.scrollIntoView({ block: "center" }));

  const box = await field.boundingBox();
  const backdrop = { x: 100, y: box.y + box.height / 2 };

  // Select the name by dragging from inside the field and releasing over the backdrop.
  await page.mouse.move(box.x + box.width - 10, backdrop.y);
  await page.mouse.down();
  await page.mouse.move(backdrop.x, backdrop.y, { steps: 8 });
  await page.mouse.up();

  // A closing panel stays visible while it fades out, so check that it is still open.
  await expect(dialog).toHaveAttribute("open");

  await page.mouse.click(backdrop.x, backdrop.y);

  await expect(dialog).not.toHaveAttribute("open");
});

test("changes from another tab apply while Customize is open and are not reverted", async ({
  context,
}) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto("/");
  await second.goto("/");

  await first.getByRole("button", { name: "Customize" }).click();
  await second.getByRole("button", { name: "Customize" }).click();
  await second.getByLabel("Appearance").selectOption("dark");
  await second.keyboard.press("Escape");

  // The open panel shows the other tab's change instead of keeping a stale copy.
  await expect(first.getByLabel("Appearance")).toHaveValue("dark");

  await first.getByRole("switch", { name: "Display seconds" }).check();

  // The second tab picks up that later change and keeps its own appearance.
  await expect(second.locator("#clock")).toHaveText(/\d:\d\d:\d\d/);
  await expect(second.locator("html")).toHaveAttribute("data-theme", "dark");

  const saved = await second.evaluate(() => JSON.parse(localStorage.getItem("helium-tab")));

  expect(saved).toMatchObject({ theme: "dark", showSeconds: true });
});

test("switches the interface language", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByLabel("Language").selectOption("de");

  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("#search")).toHaveAttribute("placeholder", /[Ss]uche/);
});

test("a saved language is on the page from its first paint", async ({ page }) => {
  // Record the text each frame is about to paint, from the first frame the page has any.
  await page.addInitScript(() => {
    window.paintedText = [];

    function record() {
      const hint = document.querySelector(".keyboard-hint [data-i18n]");
      const search = document.getElementById("search");

      if (hint && search) {
        window.paintedText.push(`${hint.textContent} | ${search.placeholder}`);
      }

      if (window.paintedText.length < 5) {
        requestAnimationFrame(record);
      }
    }

    requestAnimationFrame(record);
  });

  await savePreferences(page, { language: "de" });
  await page.reload();
  await page.waitForFunction(() => window.paintedText.length >= 5);

  const frames = await page.evaluate(() => window.paintedText);

  expect(new Set(frames)).toEqual(new Set(["zum Suchen | Suchen oder URL eingeben"]));
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
});

test("slash focuses search and Escape leaves it", async ({ page }) => {
  await page.goto("/");

  await page.locator("body").press("/");
  await expect(page.locator("#search")).toBeFocused();

  await page.locator("#search").press("Escape");
  await expect(page.locator("#search")).not.toBeFocused();
});

test("slash focuses search without typing itself", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("/");
  await page.keyboard.type("abc");

  await expect(page.locator("#search")).toBeFocused();
  await expect(page.locator("#search")).toHaveValue("abc");
});

test("typing on the page types into search", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.type("abc");

  await expect(page.locator("#search")).toBeFocused();
  await expect(page.locator("#search")).toHaveValue("abc");
  await expect(page.locator("#search-service")).toBeHidden();

  // After Escape, more typing continues the query instead of replacing it.
  await page.keyboard.press("Escape");
  await page.keyboard.type("d");

  await expect(page.locator("#search")).toHaveValue("abcd");
});

test("typing into search updates the recognized bang service", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.type("!yt music");

  await expect(page.locator("#search")).toHaveValue("!yt music");
  await expect(page.locator("#search-service")).toHaveText("YouTube");
});

test("typing while a button has focus types into search", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).focus();
  await page.keyboard.type("abc");

  await expect(page.locator("#search")).toBeFocused();
  await expect(page.locator("#search")).toHaveValue("abc");
});

test("typing while a link has focus types into search", async ({ page }) => {
  await page.goto("/");

  // No link ships on the page yet, so add one the way pinned sites will.
  await page.evaluate(() => {
    const link = document.createElement("a");
    link.href = "https://example.com/";
    link.textContent = "Example";
    document.querySelector("main").append(link);
  });

  await page.getByRole("link", { name: "Example" }).focus();
  await page.keyboard.type("abc");

  await expect(page.locator("#search")).toBeFocused();
  await expect(page.locator("#search")).toHaveValue("abc");
  await expect(page).toHaveURL("/");
});

test("a space keeps pressing a focused button", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.type("abc");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Customize" }).focus();
  await page.keyboard.press("Space");

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#search")).toHaveValue("abc");
});

test("typing with Ctrl held does not reach search", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Control+b");

  await expect(page.locator("#search")).not.toBeFocused();
  await expect(page.locator("#search")).toHaveValue("");
});

test("typing in Customize stays in Customize", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.type("abc");

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#search")).toHaveValue("");
});

test("with typing to search off, only slash focuses search", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("switch", { name: "Type anywhere to search" }).uncheck();
  await page.keyboard.press("Escape");
  await page.reload();

  await page.keyboard.type("abc");

  await expect(page.locator("#search")).not.toBeFocused();
  await expect(page.locator("#search")).toHaveValue("");

  await page.keyboard.press("/");

  await expect(page.locator("#search")).toBeFocused();
  await expect(page.locator("#search")).toHaveValue("");
});

test("names the recognized bang service before the query", async ({ page }) => {
  await page.goto("/");
  const search = page.locator("#search");
  const service = page.locator("#search-service");

  await search.fill("!yt quiet music");

  await expect(service).toBeVisible();
  await expect(service).toHaveText("YouTube");
  await expect(search).toHaveAccessibleDescription("YouTube");

  await search.fill("quiet music");

  await expect(service).toBeHidden();
  await expect(search).toHaveAccessibleDescription("");
});

for (const [input, destination] of [
  ["example.com", "https://example.com/"],
  ["localhost:9", "http://localhost:9/"],
  ["!yt quiet music", "https://www.youtube.com/results?search_query=quiet+music"],
  ["next.js", "https://duckduckgo.com/?q=next.js"],
]) {
  test(`submitting "${input}" opens ${destination}`, async ({ page }) => {
    await page.goto("/");

    await page.locator("#search").fill(input);
    const request = page.waitForRequest((request) => request.isNavigationRequest());
    await page.locator("#search").press("Enter");

    expect((await request).url()).toBe(destination);
  });
}

// Pages opened in new tabs or windows need the stub at the context level.
async function routeRemote(context) {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>remote</title>" }),
  );
}

for (const [modifier, name] of [
  ["Control", "a new tab"],
  ["Meta", "a new tab"],
  ["Shift", "a new window"],
]) {
  test(`${modifier}+Enter opens the destination in ${name}`, async ({ page, context }) => {
    await routeRemote(context);
    await page.goto("/");

    await page.locator("#search").fill("!yt quiet music");
    const opened = context.waitForEvent("page");
    await page.locator("#search").press(`${modifier}+Enter`);

    const newPage = await opened;
    await newPage.waitForURL(/youtube/);

    expect(newPage.url()).toBe("https://www.youtube.com/results?search_query=quiet+music");
    await expect(page).toHaveURL("/");
  });
}

test("a modified click on the submit button opens a new tab", async ({ page, context }) => {
  await routeRemote(context);
  await page.goto("/");

  await page.locator("#search").fill("example.com");
  const opened = context.waitForEvent("page");
  await page.locator(".search-submit").click({ modifiers: ["ControlOrMeta"] });

  const newPage = await opened;
  await newPage.waitForURL("https://example.com/");

  await expect(page).toHaveURL("/");
});

test("a middle click on the submit button opens a new tab", async ({ page, context }) => {
  await routeRemote(context);
  await page.goto("/");

  await page.locator("#search").fill("example.com");
  const opened = context.waitForEvent("page");
  await page.locator(".search-submit").click({ button: "middle" });

  const newPage = await opened;
  await newPage.waitForURL("https://example.com/");

  await expect(page).toHaveURL("/");
});

const SITES_KEY = "helium-tab-sites";

// Pinned sites are off by default, so seeding turns them on unless told otherwise.
async function savePinnedSites(page, sites, preferences = { showPinnedSites: true }) {
  await savePreferences(page, preferences);
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, JSON.stringify({ sites: value })),
    [SITES_KEY, sites],
  );
}

function pinnedLinks(page) {
  return page.getByRole("navigation", { name: "Pinned sites" }).getByRole("link");
}

test("shows no pinned sites row until a site is pinned", async ({ page }) => {
  await savePinnedSites(page, []);
  await page.reload();

  await expect(page.locator("#pinned-sites")).toBeHidden();
  await expect(page.locator("#pinned-sites a")).toHaveCount(0);
});

test("pinned sites are off by default and keep their list while off", async ({ page }) => {
  // Note what bootstrap.js handed over before app.js takes it.
  await page.addInitScript(() => {
    document.addEventListener("readystatechange", () => {
      window.bootstrapSites ??= typeof window.__heliumTabSites;
    });
  });

  await savePinnedSites(page, [{ url: "https://github.com/", title: "github.com" }], {});
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-show-pinned-sites", "false");
  await expect(page.locator("#pinned-sites")).toBeHidden();
  await expect(page.locator("#pinned-sites a")).toHaveCount(0);
  expect(await page.evaluate(() => window.bootstrapSites)).toBe("undefined");

  await page.getByRole("button", { name: "Customize" }).click();
  const toggle = page.getByRole("switch", { name: "Show pinned sites" });

  await expect(toggle).not.toBeChecked();
  await expect(page.getByLabel("Name for github.com")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Remove github.com" })).toBeDisabled();
  await expect(page.getByLabel("Site address")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add site" })).toBeDisabled();

  await toggle.check();

  await expect(pinnedLinks(page)).toHaveText(["Ggithub.com"]);
  await expect(page.getByLabel("Site address")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Remove github.com" })).toBeEnabled();

  await toggle.uncheck();

  await expect(page.locator("#pinned-sites")).toBeHidden();

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SITES_KEY);

  expect(saved.sites).toEqual([{ url: "https://github.com/", title: "github.com" }]);
});

test("pinned sites are on the page from its first paint without shifting it", async ({ page }) => {
  // Record the tiles and where the search field and row sit in each frame about to paint,
  // from the first frame that has the page.
  await page.addInitScript(() => {
    window.paintedSites = [];

    function record() {
      if (document.getElementById("search")) {
        const links = [...document.querySelectorAll("#pinned-sites a")];
        const searchTop = document.getElementById("search-form").getBoundingClientRect().top;
        const rowTop = document.getElementById("pinned-sites").getBoundingClientRect().top;

        window.paintedSites.push(
          `${links.map((link) => link.textContent).join(" | ")} @ ${searchTop}, ${rowTop}`,
        );
      }

      if (window.paintedSites.length < 5) {
        requestAnimationFrame(record);
      }
    }

    requestAnimationFrame(record);
  });

  await savePinnedSites(page, [
    { url: "https://github.com/", title: "github.com" },
    { url: "https://example.com/", title: "Example" },
  ]);
  await page.reload();
  await page.waitForFunction(() => window.paintedSites.length >= 5);

  const frames = await page.evaluate(() => window.paintedSites);

  expect(new Set(frames).size).toBe(1);
  expect(frames[0]).toMatch(/^Ggithub\.com \| EExample @ /);
  await expect(pinnedLinks(page).first()).toHaveAccessibleName("github.com");
  await expect(pinnedLinks(page).first()).toHaveAttribute("href", "https://github.com/");

  // The visible label names the tile, so no tooltip repeats it.
  await expect(pinnedLinks(page).first()).not.toHaveAttribute("title");
});

test("pinned sites sit below the clock and date, last on the page", async ({ page }) => {
  await savePinnedSites(page, [{ url: "https://github.com/", title: "github.com" }]);
  await page.reload();

  const search = await page.locator("#search-form").boundingBox();
  const date = await page.locator("#date").boundingBox();
  const row = await page.locator("#pinned-sites").boundingBox();

  expect(date.y).toBeGreaterThan(search.y + search.height);
  expect(row.y).toBeGreaterThan(date.y + date.height);
});

test("adds, renames, reorders, and removes pinned sites in Customize", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("switch", { name: "Show pinned sites" }).check();
  const address = page.getByLabel("Site address");
  const add = page.getByRole("button", { name: "Add site" });

  await address.fill("github.com");
  await add.click();

  await expect(pinnedLinks(page)).toHaveText(["Ggithub.com"]);
  await expect(pinnedLinks(page).first()).toHaveAttribute("href", "https://github.com/");
  await expect(address).toHaveValue("");
  await expect(address).toBeFocused();

  // Text the search field would search for, and duplicates, are refused where they were typed.
  await address.fill("next.js");
  await address.press("Enter");

  await expect(page.getByText("Enter a website address, such as example.com.")).toBeVisible();
  await expect(address).toHaveAttribute("aria-invalid", "true");

  await address.fill("https://github.com");
  await address.press("Enter");

  await expect(page.getByText("This site is already pinned.")).toBeVisible();

  await address.fill("example.com");
  await page.getByLabel("Name (optional)").fill("Example");
  await add.click();

  await expect(pinnedLinks(page)).toHaveText(["Ggithub.com", "EExample"]);

  // Only moves that stay within the list are offered.
  await expect(page.getByRole("button", { name: "Move github.com up" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move github.com down" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Move Example up" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Move Example down" })).toBeDisabled();

  const name = page.getByLabel("Name for github.com");
  await name.fill("GitHub");
  await name.press("Enter");

  await expect(pinnedLinks(page).first()).toHaveAccessibleName("GitHub");
  await expect(name).toBeFocused();

  // At the top, the up button is disabled, so focus stays on the row's other move button.
  await page.getByRole("button", { name: "Move Example up" }).click();

  await expect(pinnedLinks(page)).toHaveText(["EExample", "GGitHub"]);
  await expect(page.getByRole("button", { name: "Move Example down" })).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(pinnedLinks(page)).toHaveText(["GGitHub", "EExample"]);
  await expect(page.getByRole("button", { name: "Move Example up" })).toBeFocused();

  await page.getByRole("button", { name: "Remove GitHub" }).click();

  await expect(pinnedLinks(page)).toHaveText(["EExample"]);
  await expect(page.getByRole("button", { name: "Remove Example" })).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(page.locator("#pinned-sites")).toBeHidden();
  await expect(address).toBeFocused();

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SITES_KEY);

  expect(saved.sites).toEqual([]);
});

test("pinned sites persist and follow changes from another tab", async ({ context }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto("/");
  await second.goto("/");

  // The switch reaches the other tab too, as other preferences do.
  await first.getByRole("button", { name: "Customize" }).click();
  await first.getByRole("switch", { name: "Show pinned sites" }).check();
  await first.getByLabel("Site address").fill("example.com");
  await first.getByLabel("Site address").press("Enter");

  await expect(pinnedLinks(second)).toHaveText(["Eexample.com"]);

  await second.reload();

  await expect(pinnedLinks(second)).toHaveText(["Eexample.com"]);
});

test("adding stops at eight pinned sites", async ({ page }) => {
  const sites = ["a", "b", "c", "d", "e", "f", "g"].map((letter) => ({
    url: `https://${letter}.example.com/`,
    title: `${letter}.example.com`,
  }));

  await savePinnedSites(page, sites);
  await page.reload();
  await page.getByRole("button", { name: "Customize" }).click();

  await page.getByLabel("Site address").fill("h.example.com");
  await page.getByLabel("Site address").press("Enter");

  await expect(pinnedLinks(page)).toHaveCount(8);
  await expect(page.getByRole("button", { name: "Add site" })).toBeDisabled();
  await expect(page.getByLabel("Site address")).toBeDisabled();
  await expect(page.getByText("8 sites is the limit. Remove one to add another.")).toBeVisible();
  await expect(page.getByLabel("Name for h.example.com")).toBeFocused();

  await page.getByRole("button", { name: "Remove a.example.com" }).click();

  await expect(page.getByRole("button", { name: "Add site" })).toBeEnabled();
});

test("a plain click on a pinned site opens it in this tab", async ({ page }) => {
  await savePinnedSites(page, [{ url: "https://example.com/", title: "Example" }]);
  await page.reload();

  const request = page.waitForRequest((request) => request.isNavigationRequest());
  await pinnedLinks(page).first().click();

  expect((await request).url()).toBe("https://example.com/");
});

// Headless Chromium opens every new page in its own window, so these check only that the
// link opens elsewhere. Browser-opened tabs cannot load routed remote pages, so the site is local.
for (const [name, options] of [
  ["a modified click", { modifiers: ["ControlOrMeta"] }],
  ["a middle click", { button: "middle" }],
  ["a Shift click", { modifiers: ["Shift"] }],
]) {
  test(`${name} on a pinned site opens it elsewhere and stays here`, async ({
    page,
    context,
    baseURL,
  }) => {
    const url = new URL("/?pinned", baseURL);

    await savePinnedSites(page, [{ url: url.href, title: "Preview" }]);
    await page.reload();

    const opened = context.waitForEvent("page");
    await pinnedLinks(page).first().click(options);

    const newPage = await opened;
    await newPage.waitForURL(url.href);

    await expect(page).toHaveURL("/");
  });
}

// Draws a small two-tone image in the page, as a stand-in for a photo.
function drawTestImage(page, type = "image/png") {
  return page.evaluate((type) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = 64;
    canvas.height = 40;
    context.fillStyle = "#1d3b6e";
    context.fillRect(0, 0, 64, 40);
    context.fillStyle = "#f3d36b";
    context.fillRect(32, 0, 32, 40);

    return canvas.toDataURL(type);
  }, type);
}

async function chooseTestImage(page) {
  const dataUrl = await drawTestImage(page);
  const buffer = Buffer.from(dataUrl.split(",")[1], "base64");

  await page.locator("#background-file").setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer,
  });
}

// Stores an image the way Customize does: the full image in IndexedDB and a placeholder in
// local storage. Without the full image, only the placeholder paints. The bands behind the
// content are the average color unless given.
async function saveBackgroundImage(
  page,
  averageColor = "#88876c",
  { full = true, bands = [averageColor, averageColor], version = 2 } = {},
) {
  await page.goto("/");

  const thumbnail = await drawTestImage(page, "image/webp");
  const placeholder = {
    averageColor,
    bands,
    thumbnail,
    width: 64,
    height: 40,
    updatedAt: Date.now(),
    foreground: imageForeground(bands).tone,
    version,
  };

  if (full) {
    await page.evaluate(
      async ([dataUrl, updatedAt]) => {
        const blob = await (await fetch(dataUrl)).blob();

        window.seededImage = { blob, updatedAt };
      },
      [thumbnail, placeholder.updatedAt],
    );
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("helium-tab", 1);

          request.onupgradeneeded = () => request.result.createObjectStore("background");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const transaction = request.result.transaction("background", "readwrite");

            transaction.objectStore("background").put(window.seededImage, "image");
            transaction.oncomplete = () => {
              request.result.close();
              resolve();
            };
            transaction.onabort = () => reject(transaction.error);
          };
        }),
    );
  }

  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, JSON.stringify(value)),
    [BACKGROUND_IMAGE_KEY, placeholder],
  );
}

// The full image kept in IndexedDB, decoded: its type and size, and colors near its top, its
// bottom, and a corner.
function storedImage(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("helium-tab", 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const get = request.result
            .transaction("background")
            .objectStore("background")
            .get("image");

          get.onsuccess = async () => {
            request.result.close();

            if (!get.result) {
              resolve(null);

              return;
            }

            const { blob } = get.result;
            const bitmap = await createImageBitmap(blob);
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext("2d");
            const pixel = (x, y) => Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3));

            context.drawImage(bitmap, 0, 0);
            resolve({
              type: blob.type,
              width: bitmap.width,
              height: bitmap.height,
              top: pixel(bitmap.width / 2, 2),
              bottom: pixel(bitmap.width / 2, bitmap.height - 3),
              corner: pixel(1, 1),
            });
          };
        };
      }),
  );
}

// The full image on the page, once its fade in has finished.
async function paintedPhoto(page) {
  const photo = page.locator(".background-photo");

  await expect(photo).toHaveCount(1);
  // The fade starts two frames after the photo is added.
  await page.waitForFunction(() => {
    const element = document.querySelector(".background-photo");

    return element.getAnimations().length === 0 && getComputedStyle(element).opacity === "1";
  });

  return photo.evaluate((element) => ({
    source: element.src.slice(0, 5),
    opacity: getComputedStyle(element).opacity,
    width: element.naturalWidth,
    height: element.naturalHeight,
  }));
}

// A #rrggbb color as getComputedStyle reports it.
const hexToRgb = (hex) =>
  `rgb(${[1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)).join(", ")})`;

const pageBackground = (page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("choosing a preset color paints it at once and after a reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Color" }).check();
  await page.getByRole("radio", { name: "Sky" }).click();

  await expect(page.getByRole("radio", { name: "Sky" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute("data-background", "color");
  expect(await pageBackground(page)).toBe("rgb(215, 233, 240)");

  // Arrow keys move through the presets like radios.
  await page.keyboard.press("ArrowRight");

  await expect(page.getByRole("radio", { name: "Aqua" })).toBeFocused();
  await expect(page.getByRole("radio", { name: "Aqua" })).toHaveAttribute("aria-checked", "true");

  await page.reload();

  expect(await pageBackground(page)).toBe("rgb(169, 242, 235)");
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PREFERENCES_KEY,
  );
  expect(saved).toMatchObject({ background: "color", backgroundColor: "#a9f2eb" });
});

test("a chosen color is on the page from its first paint", async ({ page }) => {
  await page.addInitScript(() => {
    window.paintedColors = [];

    function record() {
      window.paintedColors.push(getComputedStyle(document.documentElement).backgroundColor);

      if (window.paintedColors.length < 5) {
        requestAnimationFrame(record);
      }
    }

    requestAnimationFrame(record);
  });

  await savePreferences(page, { background: "color", backgroundColor: "#fbe58a" });
  await page.reload();
  await page.waitForFunction(() => window.paintedColors.length >= 5);

  const frames = await page.evaluate(() => window.paintedColors);

  expect(new Set(frames)).toEqual(new Set(["rgb(251, 229, 138)"]));
});

test("text over a chosen color follows the color, not the appearance", async ({ page }) => {
  const clockColor = () =>
    page.locator("h1").evaluate((element) => getComputedStyle(element).color);

  // A pastel in a dark appearance keeps dark text.
  await page.emulateMedia({ colorScheme: "dark" });
  await savePreferences(page, { background: "color", backgroundColor: "#dbe4ff" });
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-foreground", "dark");
  expect(await clockColor()).toBe("rgb(41, 43, 43)");

  // A dark color in a light appearance gets light text.
  await page.emulateMedia({ colorScheme: "light" });
  await savePreferences(page, { background: "color", backgroundColor: "#1e2a4a" });
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-foreground", "light");
  expect(await clockColor()).toBe("rgb(227, 229, 229)");
});

test("the custom color tile applies any color", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Color" }).check();
  await page.getByLabel("Custom color").fill("#123456");

  await expect(page.locator("html")).toHaveAttribute("data-foreground", "light");
  await expect(page.locator(".custom-swatch")).toHaveClass(/is-selected/);
  await expect(page.getByRole("radio", { checked: true, name: "Blue" })).toHaveCount(0);

  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PREFERENCES_KEY,
  );
  expect(saved).toMatchObject({ background: "color", backgroundColor: "#123456" });
});

test("choosing an image keeps it in full and paints its placeholder first", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Image" }).check();
  await chooseTestImage(page);

  await expect(page.locator("html")).toHaveAttribute("data-background-image", "");
  await expect(page.locator("#background-preview")).toBeVisible();

  // Local storage keeps only the small placeholder; the full image is in IndexedDB.
  const placeholder = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    BACKGROUND_IMAGE_KEY,
  );

  expect(placeholder).toEqual({
    averageColor: expect.stringMatching(/^#[0-9a-f]{6}$/),
    bands: [expect.stringMatching(/^#[0-9a-f]{6}$/), expect.stringMatching(/^#[0-9a-f]{6}$/)],
    thumbnail: expect.stringMatching(/^data:image\/webp;base64,/),
    width: 64,
    height: 40,
    updatedAt: expect.any(Number),
    foreground: expect.stringMatching(/^(light|dark)$/),
    version: 2,
  });
  expect(placeholder.thumbnail.length).toBeLessThan(2048);
  expect(await storedImage(page)).toMatchObject({ type: "image/webp", width: 64, height: 40 });

  // The synced preferences never name the image.
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PREFERENCES_KEY,
  );
  expect(saved?.background ?? "blend").toBe("blend");

  // After a reload, the first frame paints the placeholder as the page's own background, with no
  // filter to paint, and the full image follows.
  await page.addInitScript(() => {
    requestAnimationFrame(() => {
      const body = getComputedStyle(document.body);

      window.firstFrame = {
        placeholder: body.backgroundImage,
        color: body.backgroundColor,
        filter: body.filter,
        before: getComputedStyle(document.documentElement, "::before").content,
        photo: document.querySelector(".background-photo") !== null,
      };
    });
  });
  await page.reload();
  await page.waitForFunction(() => window.firstFrame);

  const firstFrame = await page.evaluate(() => window.firstFrame);

  expect(firstFrame.placeholder).toMatch(/^url\("data:image\/webp;base64,/);
  expect(firstFrame.color).toBe(hexToRgb(placeholder.averageColor));
  expect(firstFrame.filter).toBe("none");
  expect(firstFrame.before).toBe("none");
  expect(firstFrame.photo).toBe(false);
  expect(await paintedPhoto(page)).toEqual({
    source: "blob:",
    opacity: "1",
    width: 64,
    height: 40,
  });
});

// Draws a photo-sized image: soft gradients and shapes, or noise that compresses badly.
async function choosePhoto(page, { noise = false } = {}) {
  const dataUrl = await page.evaluate((noise) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 2400, 1500);

    canvas.width = 2400;
    canvas.height = 1500;
    gradient.addColorStop(0, "#f08a5d");
    gradient.addColorStop(0.5, "#6a2c70");
    gradient.addColorStop(1, "#1f4e79");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 2400, 1500);

    for (let index = 0; index < 40; index++) {
      context.fillStyle = `hsl(${index * 37} 60% 60% / 0.5)`;
      context.beginPath();
      context.arc((index * 571) % 2400, (index * 331) % 1500, 60 + (index % 7) * 30, 0, 7);
      context.fill();
    }

    if (noise) {
      const pixels = context.getImageData(0, 0, 2400, 1500);

      for (let index = 0; index < pixels.data.length; index++) {
        pixels.data[index] = index % 4 === 3 ? 255 : Math.random() * 256;
      }

      context.putImageData(pixels, 0, 0);
    }

    // How long a 1280 px, quality 0.85 thumbnail of it would be as a data URL.
    const thumbnail = new OffscreenCanvas(1280, 800);

    thumbnail.getContext("2d").drawImage(canvas, 0, 0, 1280, 800);
    window.firstThumbnailBytes = thumbnail
      .convertToBlob({ type: "image/webp", quality: 0.85 })
      .then((blob) => blob.size);

    return canvas.toDataURL("image/jpeg", 0.95);
  }, noise);

  await page.locator("#background-file").setInputFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(dataUrl.split(",")[1], "base64"),
  });
  await expect(page.locator(".background-photo")).toHaveCount(1);

  return page.evaluate(async (key) => {
    const { thumbnail } = JSON.parse(localStorage.getItem(key));
    const image = new Image();

    image.src = thumbnail;
    await image.decode();

    return {
      length: thumbnail.length,
      width: image.naturalWidth,
      height: image.naturalHeight,
      firstLength: Math.ceil((await window.firstThumbnailBytes) / 3) * 4,
    };
  }, BACKGROUND_IMAGE_KEY);
}

test("a photo's placeholder is a 1280 px thumbnail that fits local storage", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Image" }).check();

  // A photo gets a 1280 px WebP thumbnail, tens of kilobytes as a data URL.
  const photo = await choosePhoto(page);

  expect(photo).toMatchObject({ width: 1280, height: 800 });
  expect(photo.length).toBeLessThanOrEqual(256 * 1024);

  // Noise that would not fit at quality 0.85 is encoded again, smaller, instead of being refused.
  await page.getByRole("button", { name: "Remove image" }).click();
  await page.getByRole("radio", { name: "Image" }).check();

  const noise = await choosePhoto(page, { noise: true });

  expect(noise.firstLength).toBeGreaterThan(256 * 1024);
  expect(noise.length).toBeLessThanOrEqual(256 * 1024);
  expect(noise.width / noise.height).toBeCloseTo(2400 / 1500, 1);
});

test("the page background falls back to the appearance's, never to none", async ({ page }) => {
  const backgrounds = () =>
    page.evaluate(() => ({
      page: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
    }));
  // Marks the page as painting a color or image whose values are not set yet.
  const markWithoutValues = (mark) =>
    page.evaluate((mark) => {
      const root = document.documentElement;

      delete root.dataset.background;
      delete root.dataset.backgroundImage;
      root.style.removeProperty("--custom-bg");
      root.style.removeProperty("--image-bg");
      root.style.removeProperty("--image-thumbnail");
      Object.assign(root.dataset, mark);
    }, mark);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  for (const mark of [{ backgroundImage: "" }, { background: "color" }]) {
    await markWithoutValues(mark);
    expect(await backgrounds(), JSON.stringify(mark)).toEqual({
      page: "rgb(255, 255, 255)",
      body: "rgb(255, 255, 255)",
    });
  }

  await page.emulateMedia({ colorScheme: "dark" });
  await markWithoutValues({ backgroundImage: "" });

  expect(await backgrounds()).toEqual({ page: "rgb(30, 32, 32)", body: "rgb(30, 32, 32)" });
});

test("the full image fades in once decoded and rastered, and nothing else changes", async ({
  page,
}) => {
  await saveBackgroundImage(page, "#1d3b6e");

  // From the moment the photo is added until its fade has finished, record every change to the
  // page's root and body, and the layers under the content.
  await page.addInitScript(() => {
    const layers = () => ({
      body: getComputedStyle(document.body).background,
      overlay: getComputedStyle(document.body, "::before").backgroundColor,
    });

    new MutationObserver((records, observer) => {
      const photo = document.querySelector(".background-photo");

      if (!photo) {
        return;
      }

      observer.disconnect();

      const changes = [];
      const watcher = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          changes.push(`${mutation.target.nodeName} ${mutation.type} ${mutation.attributeName}`);
        }
      });
      const before = layers();

      watcher.observe(document.documentElement, { attributes: true });
      watcher.observe(document.body, { attributes: true, childList: true });

      window.swap = {
        decoded: photo.complete && photo.naturalWidth > 0,
        opacity: getComputedStyle(photo).opacity,
        frames: 0,
      };

      // Count the frames until the fade starts; the photo waits transparent meanwhile.
      const watch = () => {
        const [animation] = photo.getAnimations();

        if (!animation) {
          window.swap.frames++;
          requestAnimationFrame(watch);

          return;
        }

        Object.assign(window.swap, {
          timing: animation.effect.getTiming(),
          keyframes: animation.effect.getKeyframes().map((keyframe) => keyframe.opacity),
        });
        animation.finished.then(() => {
          changes.push(...watcher.takeRecords().map((mutation) => mutation.type));
          watcher.disconnect();
          Object.assign(window.swap, {
            changes,
            opacityAfter: getComputedStyle(photo).opacity,
            same: JSON.stringify(layers()) === JSON.stringify(before),
          });
        });
      };

      watch();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  await page.waitForFunction(() => window.swap?.changes);

  const swap = await page.evaluate(() => window.swap);

  expect(swap.decoded).toBe(true);
  expect(swap.opacity).toBe("0");
  expect(swap.frames).toBeGreaterThanOrEqual(2);
  expect(swap.opacityAfter).toBe("1");
  expect(swap.timing).toMatchObject({ duration: 250, easing: "ease-in-out" });
  expect(swap.keyframes).toEqual(["0", "1"]);
  expect(swap.changes).toEqual([]);
  expect(swap.same).toBe(true);
});

// Stores a large image the way Customize does, with a placeholder of the given shape, and returns
// the placeholder.
async function saveLargeImage(page, placeholderShape) {
  await page.goto("/");

  const updatedAt = Date.now();

  await page.evaluate(async (updatedAt) => {
    const canvas = new OffscreenCanvas(3200, 2000);
    const context = canvas.getContext("2d");

    context.fillStyle = "#1d3b6e";
    context.fillRect(0, 0, 3200, 2000);
    context.fillStyle = "#f3d36b";
    context.fillRect(1600, 0, 1600, 2000);

    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });

    await new Promise((resolve, reject) => {
      const request = indexedDB.open("helium-tab", 1);

      request.onupgradeneeded = () => request.result.createObjectStore("background");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction("background", "readwrite");

        transaction.objectStore("background").put({ blob, updatedAt }, "image");
        transaction.oncomplete = () => {
          request.result.close();
          resolve();
        };
      };
    });
  }, updatedAt);

  const thumbnail = await drawTestImage(page, "image/webp");
  const placeholder = { ...placeholderShape, thumbnail, width: 3200, height: 2000, updatedAt };

  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, JSON.stringify(value)),
    [BACKGROUND_IMAGE_KEY, placeholder],
  );

  return placeholder;
}

const storedPlaceholder = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), BACKGROUND_IMAGE_KEY);

// The stored rendition's size, or null without one.
const storedRendition = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open("helium-tab", 1);

        request.onsuccess = () => {
          const get = request.result
            .transaction("background")
            .objectStore("background")
            .get("image");

          get.onsuccess = () => {
            const rendition = get.result?.rendition;

            request.result.close();
            resolve(rendition ? { width: rendition.width, height: rendition.height } : null);
          };
        };
      }),
  );

test("an older placeholder is made again from the full image, without choosing it again", async ({
  page,
}) => {
  const bands = ["#000000", "#000000"];

  // The version with a small thumbnail, and bands that do not match the image.
  const old = await saveLargeImage(page, {
    averageColor: "#000000",
    bands,
    foreground: imageForeground(bands).tone,
  });

  await page.reload();
  await expect.poll(async () => (await storedPlaceholder(page)).version).toBe(2);

  const placeholder = await storedPlaceholder(page);
  const thumbnail = await page.evaluate(async (source) => {
    const image = new Image();

    image.src = source;
    await image.decode();

    return [image.naturalWidth, image.naturalHeight];
  }, placeholder.thumbnail);

  // The same image, with a 1280 px thumbnail and the colors actually behind the content.
  expect(placeholder.updatedAt).toBe(old.updatedAt);
  expect(thumbnail).toEqual([1280, 800]);
  expect(placeholder.bands).not.toEqual(bands);
  expect(placeholder.averageColor).not.toBe("#000000");
  await expect(page.locator("html")).toHaveAttribute(
    "data-image-foreground",
    placeholder.foreground,
  );
});

test("a placeholder too old to paint is made again, and the image shows", async ({ page }) => {
  // From before the text set followed the bands behind the content: no bands, no version.
  await saveLargeImage(page, { averageColor: "#88876c", foreground: "light" });

  await page.reload();
  await expect.poll(async () => (await storedPlaceholder(page))?.version).toBe(2);
  await expect(page.locator("html")).toHaveAttribute("data-background-image", "");
  expect(await paintedPhoto(page)).toMatchObject({ source: "blob:" });

  // Without its full image, such a placeholder is discarded instead.
  await page.evaluate(
    ([key]) => localStorage.setItem(key, JSON.stringify({ averageColor: "#88876c", updatedAt: 1 })),
    [BACKGROUND_IMAGE_KEY],
  );
  await page.reload();

  await expect.poll(() => storedPlaceholder(page)).toBeNull();
});

test("a rendition fitted to the screen is painted, and made again for a larger screen", async ({
  page,
}) => {
  await saveLargeImage(page, {
    averageColor: "#88876c",
    bands: ["#1d3b6e", "#1d3b6e"],
    foreground: "light",
    version: 2,
  });
  const screen = await page.evaluate(() => [screen.width, screen.height, devicePixelRatio]);

  // The first load paints the full image and adds a rendition that covers this screen.
  await page.reload();
  expect(await paintedPhoto(page)).toMatchObject({ width: 3200, height: 2000 });
  await expect.poll(() => storedRendition(page)).not.toBeNull();

  const rendition = await storedRendition(page);

  expect(rendition.width).toBeGreaterThanOrEqual(screen[0] * screen[2]);
  expect(rendition.height).toBeGreaterThanOrEqual(screen[1] * screen[2]);
  expect(rendition.width).toBeLessThan(3200);

  // Later loads paint the rendition.
  await page.reload();
  expect(await paintedPhoto(page)).toMatchObject(rendition);

  // On a screen with twice the pixels, the full image shows until a larger rendition is made.
  const session = await page.context().newCDPSession(page);

  await session.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 2,
    mobile: false,
    screenWidth: screen[0],
    screenHeight: screen[1],
  });
  await page.reload();
  expect(await paintedPhoto(page)).toMatchObject({ width: 3200, height: 2000 });
  await expect
    .poll(async () => (await storedRendition(page)).width)
    .toBeGreaterThanOrEqual(screen[0] * 2);
});

test("an unsupported file is refused with a message", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Image" }).check();
  await page.locator("#background-file").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });

  await expect(page.locator("#background-image-message")).toHaveText(
    "Choose a PNG, JPEG, WebP, GIF, or AVIF image.",
  );
  await expect(page.locator("html")).not.toHaveAttribute("data-background-image");
});

// Whether IndexedDB holds a full image, even before anything created the database.
const hasFullImage = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open("helium-tab", 1);

        request.onupgradeneeded = () => request.result.createObjectStore("background");
        request.onsuccess = () => {
          const get = request.result
            .transaction("background")
            .objectStore("background")
            .get("image");

          get.onsuccess = () => {
            request.result.close();
            resolve(Boolean(get.result));
          };
        };
      }),
  );

// Holds the next imports' decoding until the test releases them, one at a time.
async function holdImports(page) {
  await page.addInitScript(() => {
    const decode = window.createImageBitmap.bind(window);

    window.heldImports = 0;
    window.releases = [];
    window.createImageBitmap = (source, ...rest) => {
      if (!(source instanceof File) || window.heldImports === 0) {
        return decode(source, ...rest);
      }

      window.heldImports--;

      return new Promise((resolve) => window.releases.push(() => resolve(decode(source, ...rest))));
    };
  });
}

// Chooses a one-color image file, holding its decoding when asked.
async function chooseHeldImage(page, color, { hold = true } = {}) {
  const dataUrl = await page.evaluate((color) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = 64;
    canvas.height = 40;
    context.fillStyle = color;
    context.fillRect(0, 0, 64, 40);

    return canvas.toDataURL("image/png");
  }, color);

  await page.evaluate((hold) => (window.heldImports = hold ? 1 : 0), hold);
  await page.locator("#background-file").setInputFiles({
    name: `${color.slice(1)}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(dataUrl.split(",")[1], "base64"),
  });

  if (hold) {
    await page.waitForFunction(() => window.releases.length > 0);
  }
}

// Lets the oldest held import finish, and gives it time to save if it still would.
async function releaseImport(page) {
  await page.evaluate(() => window.releases.shift()());
  await page.waitForTimeout(500);
}

test("a pending import does not override Default or Color chosen after it", async ({ page }) => {
  await holdImports(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Customize" }).click();

  for (const choose of [
    () => page.getByRole("radio", { name: "Default" }).check(),
    () => page.getByRole("radio", { name: "Color" }).check(),
  ]) {
    await page.getByRole("radio", { name: "Image" }).check();
    await chooseHeldImage(page, "#204060");
    await choose();
    await releaseImport(page);

    await expect(page.getByRole("radio", { name: "Image" })).not.toBeChecked();
    await expect(page.locator("html")).not.toHaveAttribute("data-background-image");
    await expect(page.locator("label.image-button")).not.toHaveAttribute("aria-busy");
    expect(await storedPlaceholder(page)).toBeNull();
    expect(await hasFullImage(page)).toBe(false);
  }

  // The last choice was Color.
  await expect(page.getByRole("radio", { name: "Color" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-background", "color");
});

test("a pending import does not override Remove chosen after it", async ({ page }) => {
  await holdImports(page);
  await saveBackgroundImage(page, "#1d3b6e");
  await page.reload();
  await page.getByRole("button", { name: "Customize" }).click();

  await chooseHeldImage(page, "#204060");
  await page.getByRole("button", { name: "Remove image" }).click();
  await releaseImport(page);

  await expect(page.getByRole("radio", { name: "Default" })).toBeChecked();
  await expect(page.locator("html")).not.toHaveAttribute("data-background-image");
  expect(await storedPlaceholder(page)).toBeNull();
  expect(await hasFullImage(page)).toBe(false);
});

test("a second import wins over a first one that finishes later", async ({ page }) => {
  await holdImports(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Image" }).check();

  await chooseHeldImage(page, "#204060");
  await chooseHeldImage(page, "#c0a040", { hold: false });
  await expect.poll(async () => (await storedPlaceholder(page))?.averageColor).toBe("#c0a040");
  await releaseImport(page);

  expect((await storedPlaceholder(page)).averageColor).toBe("#c0a040");
  await expect(page.getByRole("radio", { name: "Image" })).toBeChecked();
  await expect(page.locator("label.image-button")).not.toHaveAttribute("aria-busy");
});

test("a pending import does not override a removal in another tab", async ({ context }) => {
  const page = await context.newPage();
  const other = await context.newPage();

  await holdImports(page);
  await saveBackgroundImage(page, "#1d3b6e");
  await page.reload();
  await other.goto("/");
  await page.getByRole("button", { name: "Customize" }).click();

  await chooseHeldImage(page, "#204060");
  await other.getByRole("button", { name: "Customize" }).click();
  await other.getByRole("button", { name: "Remove image" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-background-image");
  await releaseImport(page);

  await expect(page.locator("html")).not.toHaveAttribute("data-background-image");
  await expect(page.getByRole("radio", { name: "Default" })).toBeChecked();
  expect(await storedPlaceholder(page)).toBeNull();
  expect(await hasFullImage(page)).toBe(false);
});

test("Remove restores the default background and clears both stores", async ({ page }) => {
  await saveBackgroundImage(page);
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-background-image", "");
  await paintedPhoto(page);

  await page.getByRole("button", { name: "Customize" }).click();

  await expect(page.getByRole("radio", { name: "Image" })).toBeChecked();

  await page.getByRole("button", { name: "Remove image" }).click();

  await expect(page.locator("html")).not.toHaveAttribute("data-background-image");
  await expect(page.locator(".background-photo")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Default" })).toBeChecked();
  await expect.poll(() => pageBackground(page)).toBe("rgb(255, 255, 255)");

  const stored = await page.evaluate((key) => localStorage.getItem(key), BACKGROUND_IMAGE_KEY);
  expect(stored).toBeNull();
  await expect.poll(() => storedImage(page)).toBeNull();
});

test("another mode replaces the image until Image is chosen again", async ({ page }) => {
  await saveBackgroundImage(page);
  await page.reload();

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Color" }).check();

  await expect(page.locator("html")).not.toHaveAttribute("data-background-image");
  await expect(page.locator("html")).toHaveAttribute("data-background", "color");
  await expect.poll(() => storedImage(page)).toBeNull();

  // Choosing Image again brings back both the placeholder and the full image.
  await page.getByRole("radio", { name: "Image" }).check();

  await expect(page.locator("html")).toHaveAttribute("data-background-image", "");
  expect(await paintedPhoto(page)).toMatchObject({ opacity: "1", width: 64, height: 40 });
  expect(await storedImage(page)).toMatchObject({ width: 64, height: 40 });
});

test("removing the image in one tab repaints the others", async ({ context }) => {
  const first = await context.newPage();
  await saveBackgroundImage(first);
  await first.reload();
  const second = await context.newPage();
  await second.goto("/");

  await expect(second.locator("html")).toHaveAttribute("data-background-image", "");
  await paintedPhoto(second);

  await first.getByRole("button", { name: "Customize" }).click();
  await first.getByRole("button", { name: "Remove image" }).click();

  await expect(second.locator("html")).not.toHaveAttribute("data-background-image");
  await expect(second.locator(".background-photo")).toHaveCount(0);
});

test("choosing an image in one tab shows it in full in the others", async ({ context }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto("/");
  await second.goto("/");

  await first.getByRole("button", { name: "Customize" }).click();
  await first.getByRole("radio", { name: "Image" }).check();
  await chooseTestImage(first);

  await expect(second.locator("html")).toHaveAttribute("data-background-image", "");
  expect(await paintedPhoto(second)).toMatchObject({ opacity: "1", width: 64, height: 40 });
});

test("without its full image, a placeholder stays and Customize asks for it again", async ({
  page,
}) => {
  await saveBackgroundImage(page, "#88876c", { full: false });
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-background-image", "");
  await page.getByRole("button", { name: "Customize" }).click();

  await expect(page.locator("#background-image-message")).toHaveText(
    "The full image is not available on this device anymore. Choose it again.",
  );
  await expect(page.locator(".background-photo")).toHaveCount(0);
  await expect(page.getByText("Choose image…")).toBeVisible();
});

// The page over a photo: its text set, clock and search colors, and the overlay and its layers.
function photoPage(page) {
  return page.evaluate(() => {
    const overlay = getComputedStyle(document.body, "::before");

    return {
      tone: document.documentElement.dataset.imageForeground,
      clock: getComputedStyle(document.querySelector("h1")).color,
      search: getComputedStyle(document.getElementById("search-form")).backgroundColor,
      overlay: overlay.backgroundColor,
      layers: overlay.backgroundImage,
    };
  });
}

const isTransparent = (color) => color.endsWith(" 0)");

test("a photo picks one text set for the whole page, whatever the appearance", async ({ page }) => {
  // A night photo gets light text and dark glass in both appearances, with no overlay at all.
  await saveBackgroundImage(page, "#0b1020");

  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme });
    await page.reload();

    const night = await photoPage(page);

    expect(night).toMatchObject({ tone: "light", clock: "rgb(227, 229, 229)", layers: "none" });
    expect(night.search).toMatch(/^color\(srgb 0\.207843 0\.215686 0\.215686 \/ 0\.7\)$/);
    expect(isTransparent(night.overlay), night.overlay).toBe(true);
  }

  // A snow photo gets dark text and light glass, even in a dark appearance.
  await saveBackgroundImage(page, "#f5f6f5");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();

  const snow = await photoPage(page);

  expect(snow).toMatchObject({ tone: "dark", clock: "rgb(41, 43, 43)", layers: "none" });
  expect(snow.search).toMatch(/^color\(srgb 0\.921569 0\.921569 0\.921569 \/ 0\.7\)$/);
  expect(isTransparent(snow.overlay), snow.overlay).toBe(true);
});

test("a photo no set reads on everywhere gets strong halos, and an overlay only last", async ({
  page,
}) => {
  const clockHalo = () =>
    page.locator("h1").evaluate((element) => getComputedStyle(element).textShadow);

  // A warm stripe behind the search field and a dark green band behind the clock.
  await saveBackgroundImage(page, "#81865d", { bands: ["#c06464", "#316b28"] });
  await page.reload();

  expect(await photoPage(page)).toMatchObject({ tone: "light", layers: "none" });
  expect(isTransparent((await photoPage(page)).overlay)).toBe(true);
  expect(await clockHalo()).toBe(
    "rgba(0, 0, 0, 0.55) 0px 1px 3px, rgba(0, 0, 0, 0.45) 0px 0px 24px",
  );

  // Where even large text stays below 3:1, a capped overlay helps as the last fallback.
  const extreme = imageForeground(["#ffffff", "#000000"]);

  await saveBackgroundImage(page, "#808080", { bands: ["#ffffff", "#000000"] });
  await page.reload();

  expect(extreme.overlay).toBeGreaterThan(0);
  expect(extreme.overlay).toBeLessThanOrEqual(15);
  expect((await photoPage(page)).overlay).toMatch(new RegExp(` / ${extreme.overlay / 100}\\)$`));
});

test("the text set follows the part of the photo behind the content, not its average", async ({
  page,
}) => {
  // A bright photo, dark only where the logo, search, clock, and date sit.
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = 1600;
    canvas.height = 900;
    context.fillStyle = "#f2f4f0";
    context.fillRect(0, 0, 1600, 900);
    context.fillStyle = "#1f3b24";
    context.fillRect(400, 225, 800, 405);

    return canvas.toDataURL("image/png").split(",")[1];
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Image" }).check();
  await page.locator("#background-file").setInputFiles({
    name: "band.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator("html")).toHaveAttribute("data-background-image", "");

  const placeholder = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    BACKGROUND_IMAGE_KEY,
  );

  // The average alone would pick dark text; the bands behind the content pick light text.
  expect(foregroundFor(placeholder.averageColor)).toBe("dark");
  expect(placeholder.foreground).toBe("light");
  await expect(page.locator("html")).toHaveAttribute("data-image-foreground", "light");
  await expect(page.locator("html")).toHaveAttribute("data-image-halo", "soft");
});

// The surfaces that frost over a chosen color or image: search, hint, Customize, and any tiles.
function frostedSurfaces(page) {
  return page.evaluate(() => {
    const selectors = [
      "#search-form",
      ".keyboard-hint",
      "#open-settings",
      "#pinned-sites .site-icon",
    ];

    return selectors
      .filter((selector) => document.querySelector(selector))
      .map((selector) => {
        const style = getComputedStyle(document.querySelector(selector));

        return { selector, background: style.backgroundColor, filter: style.backdropFilter };
      });
  });
}

const isTranslucent = (color) => /\/ 0\.\d+\)$|rgba\(.*, 0\.\d+\)$/.test(color);

test("controls over a chosen color are frosted glass, and stay opaque by default", async ({
  page,
}) => {
  const sites = [{ url: "https://example.com/", title: "Example" }];

  await savePinnedSites(page, sites, {
    showPinnedSites: true,
    background: "color",
    backgroundColor: "#c9f5b2",
  });
  await page.reload();

  for (const surface of await frostedSurfaces(page)) {
    expect(surface.filter, surface.selector).toBe("blur(20px) saturate(1.2)");
    expect(isTranslucent(surface.background), surface.selector).toBe(true);
  }

  // Focus makes the search field's glass more opaque, not a different color.
  const resting = (await frostedSurfaces(page))[0].background;
  await page.locator("#search").focus();
  const focused = (await frostedSurfaces(page))[0].background;

  expect(focused).not.toBe(resting);
  expect(focused.replace(/ \/ [\d.]+\)$/, "")).toBe(resting.replace(/ \/ [\d.]+\)$/, ""));

  // The default background keeps the opaque surfaces.
  await savePinnedSites(page, sites);
  await page.reload();

  const search = (await frostedSurfaces(page))[0];

  expect(search.filter).toBe("none");
  expect(search.background).toBe("rgb(235, 235, 235)");
});

test("reduced transparency keeps the controls over an image opaque", async ({ page }) => {
  const client = await page.context().newCDPSession(page);

  await client.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  await page.emulateMedia({ colorScheme: "light" });
  await saveBackgroundImage(page);
  await page.reload();

  expect(
    await page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches),
  ).toBe(true);

  // The glass is the search field's own surface, #ebebeb, with nothing showing through.
  for (const surface of await frostedSurfaces(page)) {
    expect(surface.filter, surface.selector).toBe("none");
    expect(isTranslucent(surface.background), surface.selector).toBe(false);
  }

  const [search] = await frostedSurfaces(page);

  expect(search.background).toBe("color(srgb 0.921569 0.921569 0.921569)");
});

test("closing Customize with a pointer leaves no focus ring; the keyboard keeps it", async ({
  page,
}) => {
  const opener = page.getByRole("button", { name: "Customize" });
  const dialog = page.getByRole("dialog");
  const showsRing = () => opener.evaluate((element) => element.matches(":focus-visible"));

  await page.goto("/");

  // Opened from the keyboard, so the panel's focus shows a ring, then closed with a pointer.
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveAttribute("open");
  await page.getByRole("button", { name: "Close settings" }).click();

  await expect(opener).toBeFocused();
  expect(await showsRing()).toBe(false);

  // Escape returns focus with its ring.
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveAttribute("open");
  await page.keyboard.press("Escape");

  await expect(opener).toBeFocused();
  expect(await showsRing()).toBe(true);

  // So does pressing the close button from the keyboard.
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveAttribute("open");
  await page.getByRole("button", { name: "Close settings" }).press("Enter");

  await expect(opener).toBeFocused();
  expect(await showsRing()).toBe(true);
});

test("pinned tiles over a chosen color follow its text, not the appearance", async ({ page }) => {
  const sites = [{ url: "https://example.com/", title: "Example" }];

  // The tile's background, and its light and dark pairs as frosted glass, as computed colors.
  const tileColors = () =>
    page.locator("#pinned-sites .site-icon").evaluate((icon) => {
      const probe = document.createElement("span");
      const opacity = getComputedStyle(icon).getPropertyValue("--frost-opacity");
      const frosted = (tone) => {
        probe.style.color = `color-mix(in srgb, ${tone} ${opacity}, transparent)`;

        return getComputedStyle(probe).color;
      };

      document.body.append(probe);

      const colors = {
        tile: getComputedStyle(icon).backgroundColor,
        light: frosted(icon.style.getPropertyValue("--tone")),
        dark: frosted(icon.style.getPropertyValue("--tone-dark")),
      };

      probe.remove();

      return colors;
    });

  // A pastel page in a dark appearance keeps the light tiles its dark text goes with.
  await page.emulateMedia({ colorScheme: "dark" });
  await savePinnedSites(page, sites, {
    showPinnedSites: true,
    background: "color",
    backgroundColor: "#fbe58a",
  });
  await page.reload();

  const onPastel = await tileColors();

  expect(onPastel.tile).toBe(onPastel.light);

  // A dark page in a light appearance gets the deep tiles its light text goes with.
  await page.emulateMedia({ colorScheme: "light" });
  await savePinnedSites(page, sites, {
    showPinnedSites: true,
    background: "color",
    backgroundColor: "#1e2a4a",
  });
  await page.reload();

  const onDark = await tileColors();

  expect(onDark.tile).toBe(onDark.dark);
  await expect(page.locator("#pinned-sites .site-icon")).not.toHaveCSS("box-shadow", "none");
});

// Stands in for chrome.storage in the preview: records sync writes and can deliver a change as
// if another device had made it.
async function fakeSyncStorage(page) {
  await page.addInitScript(() => {
    const stored = {};
    const listeners = [];

    window.syncWrites = [];
    window.chrome ??= {};
    window.chrome.storage = {
      sync: {
        async get(key) {
          return { [key]: stored[key] };
        },

        async set(items) {
          window.syncWrites.push(structuredClone(items));
          Object.assign(stored, items);
        },
      },

      onChanged: {
        addListener(listener) {
          listeners.push(listener);
        },
      },
    };

    window.deliverSyncChange = (key, newValue) => {
      stored[key] = newValue;

      for (const listener of listeners) {
        listener({ [key]: { newValue } }, "sync");
      }
    };
  });
}

test("dragging the custom color previews live and syncs once the picker closes", async ({
  page,
}) => {
  await fakeSyncStorage(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Color" }).check();
  const baseline = await page.evaluate(() => window.syncWrites.length);

  // A drag reports each step as an input event, with no change event until the picker closes.
  for (const color of ["#202020", "#404040", "#606060", "#f0f0f0"]) {
    await page.getByLabel("Custom color").evaluate((input, value) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, color);

    await expect(page.locator("html")).toHaveCSS("--custom-bg", color);
  }

  await expect(page.locator("html")).toHaveAttribute("data-foreground", "dark");

  // Every step reaches this device's cache for the next tab's first paint, but none syncs yet.
  const cached = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PREFERENCES_KEY,
  );
  expect(cached).toMatchObject({ background: "color", backgroundColor: "#f0f0f0" });
  expect(await page.evaluate(() => window.syncWrites.length)).toBe(baseline);

  await page.getByLabel("Custom color").evaluate((input) => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const writes = await page.evaluate(() => window.syncWrites);

  expect(writes).toHaveLength(baseline + 1);
  expect(writes.at(-1)[PREFERENCES_KEY]).toMatchObject({ backgroundColor: "#f0f0f0" });
});

// Reads an element's computed color as #rrggbb.
function hexColor(locator) {
  return locator.evaluate((element) => {
    const channels = getComputedStyle(element).color.match(/\d+/g).slice(0, 3);

    return `#${channels.map((value) => Number(value).toString(16).padStart(2, "0")).join("")}`;
  });
}

test("secondary and muted text over a mid-tone color stay readable", async ({ page }) => {
  const color = "#808080";
  const expected = foregroundColors(color);

  await savePreferences(page, { background: "color", backgroundColor: color });
  await page.reload();

  const date = await hexColor(page.locator("#date"));
  const hint = await hexColor(page.locator(".keyboard-hint"));

  expect(date).toBe(expected.secondary);
  expect(hint).toBe(expected.muted);
  expect(contrastRatio(date, color)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(hint, color)).toBeGreaterThanOrEqual(4.5);
});

// A landscape JPEG, red on the left and blue on the right, whose EXIF orientation (6) says to
// show it turned a quarter clockwise, as phones save portrait photos.
async function rotatedPhoto(page) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = 80;
    canvas.height = 40;
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, 40, 40);
    context.fillStyle = "#0000ff";
    context.fillRect(40, 0, 40, 40);

    return canvas.toDataURL("image/jpeg", 0.95);
  });
  const jpeg = Buffer.from(dataUrl.split(",")[1], "base64");

  // An APP1 segment with "Exif", a little-endian TIFF header, and one entry: Orientation = 6.
  const exif = Buffer.concat([
    Buffer.from("ffe10022", "hex"),
    Buffer.from("Exif\0\0", "binary"),
    Buffer.from("49492a0008000000", "hex"),
    Buffer.from("0100", "hex"),
    Buffer.from("120103000100000006000000", "hex"),
    Buffer.from("00000000", "hex"),
  ]);

  return Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]);
}

test("a phone photo is kept as it is and shows upright from its EXIF orientation", async ({
  page,
}) => {
  await page.goto("/");
  const photo = await rotatedPhoto(page);

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Image" }).check();
  await page
    .locator("#background-file")
    .setInputFiles({ name: "portrait.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.locator("html")).toHaveAttribute("data-background-image", "");

  const image = await storedImage(page);
  const placeholder = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    BACKGROUND_IMAGE_KEY,
  );

  // A small JPEG is kept byte for byte, and its placeholder and page image are portrait.
  expect(image.type).toBe("image/jpeg");
  expect(placeholder).toMatchObject({ width: 40, height: 80 });
  expect(await paintedPhoto(page)).toMatchObject({ width: 40, height: 80 });

  // Turned a quarter clockwise, the left (red) half is on top and the image is portrait.
  expect(image.height).toBeGreaterThan(image.width);
  expect(image.top[0]).toBeGreaterThan(200);
  expect(image.top[2]).toBeLessThan(60);
  expect(image.bottom[2]).toBeGreaterThan(200);
  expect(image.bottom[0]).toBeLessThan(60);
});

test("without a WebP encoder, a transparent PNG is stored as JPEG over its average color", async ({
  page,
}) => {
  // Behave like a browser whose canvas cannot encode WebP and falls back to PNG.
  await page.addInitScript(() => {
    const convertToBlob = OffscreenCanvas.prototype.convertToBlob;

    OffscreenCanvas.prototype.convertToBlob = function (options = {}) {
      const type = options.type === "image/webp" ? "image/png" : options.type;

      return convertToBlob.call(this, { ...options, type });
    };
  });
  await page.goto("/");

  // Transparent all around a green square, so the average of the visible pixels is green.
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = 64;
    canvas.height = 64;
    context.fillStyle = "#1e8c3c";
    context.fillRect(16, 16, 32, 32);

    return canvas.toDataURL("image/png").split(",")[1];
  });

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Image" }).check();
  await page.locator("#background-file").setInputFiles({
    name: "cutout.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator("html")).toHaveAttribute("data-background-image", "");

  const image = await storedImage(page);
  const { averageColor } = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    BACKGROUND_IMAGE_KEY,
  );
  const [red, green, blue] = [1, 3, 5].map((start) =>
    Number.parseInt(averageColor.slice(start, start + 2), 16),
  );

  expect(image.type).toBe("image/jpeg");
  expect(averageColor).toBe("#1e8c3c");

  // The transparent corner is the average color the page paints underneath, not black.
  for (const [channel, expected] of image.corner.map((value, index) => [
    value,
    [red, green, blue][index],
  ])) {
    expect(Math.abs(channel - expected)).toBeLessThan(12);
  }
});

test("an image that does not fit in local storage is refused with a message", async ({ page }) => {
  await page.goto("/");

  // Fill this origin's local storage until a few characters are left.
  await page.evaluate(() => {
    let low = 0;
    let high = 16 * 1024 * 1024;

    while (low < high) {
      const middle = Math.ceil((low + high) / 2);

      try {
        localStorage.setItem("filler", "x".repeat(middle));
        low = middle;
      } catch {
        high = middle - 1;
      }
    }

    localStorage.setItem("filler", "x".repeat(low));
  });

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Image" }).check();
  await chooseTestImage(page);

  await expect(page.locator("#background-image-message")).toHaveText(
    "There is not enough space on this device to keep this image.",
  );
  await expect(page.locator("html")).not.toHaveAttribute("data-background-image");
  await expect(page.getByRole("button", { name: "Remove image" })).toBeHidden();

  // The full image that was stored first is removed again, so nothing is left behind.
  const stored = await page.evaluate((key) => localStorage.getItem(key), BACKGROUND_IMAGE_KEY);
  expect(stored).toBeNull();
  await expect.poll(() => storedImage(page)).toBeNull();
});

test("an image that does not fit in IndexedDB is refused with a message", async ({ page }) => {
  // Fail writes the way a full IndexedDB does.
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Image" }).check();
  await chooseTestImage(page);

  await expect(page.locator("#background-image-message")).toHaveText(
    "There is not enough space on this device to keep this image.",
  );
  await expect(page.locator("html")).not.toHaveAttribute("data-background-image");

  const stored = await page.evaluate((key) => localStorage.getItem(key), BACKGROUND_IMAGE_KEY);
  expect(stored).toBeNull();
});

// The root's background attributes and the chosen color's text properties.
function rootBackground(page) {
  return page.evaluate(() => {
    const root = document.documentElement;

    return {
      background: root.dataset.background,
      foreground: root.dataset.foreground ?? null,
      image: Object.hasOwn(root.dataset, "backgroundImage"),
      customText: root.style.getPropertyValue("--custom-text"),
    };
  });
}

test("leaving color mode clears the foreground and its text colors", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Color" }).check();
  await page.getByRole("radio", { name: "Sky" }).click();

  expect(await rootBackground(page)).toMatchObject({ background: "color", foreground: "dark" });

  await page.getByRole("radio", { name: "Default" }).check();

  expect(await rootBackground(page)).toEqual({
    background: "blend",
    foreground: null,
    image: false,
    customText: "",
  });
});

test("removing an image reveals the synced choice with its own foreground", async ({ page }) => {
  // Over a chosen color, the color's foreground returns with it.
  await saveBackgroundImage(page);
  await savePreferences(page, { background: "color", backgroundColor: "#1e2a4a" });
  await page.reload();
  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("button", { name: "Remove image" }).click();

  expect(await rootBackground(page)).toMatchObject({
    background: "color",
    foreground: "light",
    image: false,
  });

  // Over the default background, nothing is left behind.
  await saveBackgroundImage(page);
  await savePreferences(page, {});
  await page.reload();
  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("button", { name: "Remove image" }).click();

  expect(await rootBackground(page)).toEqual({
    background: "blend",
    foreground: null,
    image: false,
    customText: "",
  });
});

test("a color chosen on another device repaints live, foreground included", async ({ page }) => {
  const clockColor = () =>
    page.locator("h1").evaluate((element) => getComputedStyle(element).color);
  const fromOtherDevice = (preferences) =>
    page.evaluate(
      ([key, value]) => window.deliverSyncChange(key, value),
      [PREFERENCES_KEY, { ...preferences, changedAt: Date.now(), changedBy: "other-device" }],
    );

  await fakeSyncStorage(page);
  await savePreferences(page, { background: "color", backgroundColor: "#dbe4ff" });
  await page.reload();

  expect(await rootBackground(page)).toMatchObject({ background: "color", foreground: "dark" });

  await fromOtherDevice({ background: "color", backgroundColor: "#1e2a4a" });

  await expect(page.locator("html")).toHaveAttribute("data-foreground", "light");
  await expect(page.locator("html")).toHaveCSS("--custom-bg", "#1e2a4a");
  expect(await clockColor()).toBe("rgb(227, 229, 229)");
  // The page color crossfades into the new one.
  await expect.poll(() => pageBackground(page)).toBe("rgb(30, 42, 74)");

  await fromOtherDevice({ background: "helium" });

  await expect(page.locator("html")).not.toHaveAttribute("data-foreground");
  await expect(page.locator("html")).toHaveAttribute("data-background", "helium");
});

test("switching the appearance over a photo leaves the page as it is", async ({ page }) => {
  await saveBackgroundImage(page, "#0b1020");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.reload();

  const before = await photoPage(page);

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });

  // Only Customize follows the appearance; the page keeps its text, glass, and overlay, and
  // nothing animates behind it.
  const after = await photoPage(page);
  const animating = await page.evaluate(() =>
    document
      .getAnimations()
      .some(({ effect }) => [document.body, document.documentElement].includes(effect.target)),
  );

  expect(after).toEqual(before);
  expect(animating).toBe(false);
});

test("text and the logo over a photo get a soft halo, and nowhere else", async ({ page }) => {
  const halos = () =>
    page.evaluate(() => {
      const style = (selector) => getComputedStyle(document.querySelector(selector));

      return {
        clock: style("h1").textShadow,
        date: style("#date").textShadow,
        label: style(".pinned-title").textShadow,
        logo: style(".helium-logo").filter,
      };
    });
  const sites = [{ url: "https://example.com/", title: "Example" }];

  // Light text on a night photo gets a dark halo.
  await saveBackgroundImage(page, "#0b1020");
  await savePinnedSites(page, sites);
  await page.reload();

  const dark = "rgba(0, 0, 0, 0.35) 0px 1px 2px, rgba(0, 0, 0, 0.25) 0px 0px 16px";

  expect(await halos()).toEqual({
    clock: dark,
    date: dark,
    label: dark,
    logo: "drop-shadow(rgba(0, 0, 0, 0.35) 0px 0px 2px) drop-shadow(rgba(0, 0, 0, 0.25) 0px 0px 16px)",
  });

  // Dark text on a snow photo gets a light one.
  await saveBackgroundImage(page, "#f5f6f5");
  await savePinnedSites(page, sites);
  await page.reload();

  expect((await halos()).clock).toBe(
    "rgba(255, 255, 255, 0.45) 0px 1px 2px, rgba(255, 255, 255, 0.35) 0px 0px 16px",
  );

  // Colors and the default background keep crisp text.
  await savePinnedSites(page, sites, {
    showPinnedSites: true,
    background: "color",
    backgroundColor: "#1e2a4a",
  });
  await page.evaluate((key) => localStorage.removeItem(key), BACKGROUND_IMAGE_KEY);
  await page.reload();

  expect(await halos()).toEqual({ clock: "none", date: "none", label: "none", logo: "none" });
});
