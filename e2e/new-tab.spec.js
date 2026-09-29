import { expect, test } from "@playwright/test";

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

async function saveBackgroundImage(page) {
  await page.goto("/");

  const dataUrl = await drawTestImage(page, "image/webp");
  const image = { dataUrl, averageColor: "#88876c", updatedAt: Date.now() };

  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, JSON.stringify(value)),
    [BACKGROUND_IMAGE_KEY, image],
  );
}

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

test("choosing an image paints it and keeps it on this device", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Image" }).check();
  await chooseTestImage(page);

  await expect(page.locator("html")).toHaveAttribute("data-background-image", "");
  await expect(page.locator("#background-preview")).toBeVisible();

  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    BACKGROUND_IMAGE_KEY,
  );
  expect(stored).toEqual({
    dataUrl: expect.stringMatching(/^data:image\/webp;base64,/),
    averageColor: expect.stringMatching(/^#[0-9a-f]{6}$/),
    updatedAt: expect.any(Number),
  });

  // The synced preferences never name the image.
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PREFERENCES_KEY,
  );
  expect(saved?.background ?? "blend").toBe("blend");

  await page.reload();

  const image = await page.evaluate(
    () => getComputedStyle(document.documentElement).backgroundImage,
  );
  expect(image).toMatch(/^url\("data:image\/webp;base64,/);
  expect(await pageBackground(page)).toBe("rgba(0, 0, 0, 0)");
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

test("Remove restores the default background", async ({ page }) => {
  await saveBackgroundImage(page);
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-background-image", "");

  await page.getByRole("button", { name: "Customize" }).click();

  await expect(page.getByRole("radio", { name: "Image" })).toBeChecked();

  await page.getByRole("button", { name: "Remove image" }).click();

  await expect(page.locator("html")).not.toHaveAttribute("data-background-image");
  await expect(page.getByRole("radio", { name: "Default" })).toBeChecked();
  await expect.poll(() => pageBackground(page)).toBe("rgb(255, 255, 255)");

  const stored = await page.evaluate((key) => localStorage.getItem(key), BACKGROUND_IMAGE_KEY);
  expect(stored).toBeNull();
});

test("another mode replaces the image until Image is chosen again", async ({ page }) => {
  await saveBackgroundImage(page);
  await page.reload();

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("radio", { name: "Color" }).check();

  await expect(page.locator("html")).not.toHaveAttribute("data-background-image");
  await expect(page.locator("html")).toHaveAttribute("data-background", "color");

  await page.getByRole("radio", { name: "Image" }).check();

  await expect(page.locator("html")).toHaveAttribute("data-background-image", "");
});

test("removing the image in one tab repaints the others", async ({ context }) => {
  const first = await context.newPage();
  await saveBackgroundImage(first);
  await first.reload();
  const second = await context.newPage();
  await second.goto("/");

  await expect(second.locator("html")).toHaveAttribute("data-background-image", "");

  await first.getByRole("button", { name: "Customize" }).click();
  await first.getByRole("button", { name: "Remove image" }).click();

  await expect(second.locator("html")).not.toHaveAttribute("data-background-image");
});

test("the scrim over an image follows the appearance", async ({ page }) => {
  const scrim = () =>
    page.evaluate(() => getComputedStyle(document.body, "::before").backgroundColor);
  const clockColor = () =>
    page.locator("h1").evaluate((element) => getComputedStyle(element).color);

  const glow = () =>
    page.evaluate(() => getComputedStyle(document.body, "::before").backgroundImage);

  await saveBackgroundImage(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();

  expect(await scrim()).toBe("color(srgb 1 1 1 / 0.22)");
  expect(await clockColor()).toBe("rgb(41, 43, 43)");

  await page.emulateMedia({ colorScheme: "dark" });

  expect(await scrim()).toBe("color(srgb 0 0 0 / 0.22)");
  expect(await clockColor()).toBe("rgb(227, 229, 229)");

  // Besides the even scrim there is only one soft glow: no edge vignettes or bands.
  const layers = await glow();

  expect(layers.match(/gradient\(/g)).toHaveLength(1);
  expect(layers).toMatch(/^radial-gradient\(/);
});

test("pinned tiles over a chosen color follow its text, not the appearance", async ({ page }) => {
  const sites = [{ url: "https://example.com/", title: "Example" }];

  // The tile's background, and the colors of its light and dark pairs, all as rgb().
  const tileColors = () =>
    page.locator("#pinned-sites .site-icon").evaluate((icon) => {
      const probe = document.createElement("span");
      const rgb = (color) => {
        probe.style.color = color;

        return getComputedStyle(probe).color;
      };

      document.body.append(probe);

      const colors = {
        tile: getComputedStyle(icon).backgroundColor,
        light: rgb(icon.style.getPropertyValue("--tone")),
        dark: rgb(icon.style.getPropertyValue("--tone-dark")),
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
