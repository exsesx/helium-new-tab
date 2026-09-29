import { expect, test } from "@playwright/test";

const PREFERENCES_KEY = "helium-tab";

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

async function savePinnedSites(page, sites) {
  await page.goto("/");
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, JSON.stringify({ sites: value })),
    [SITES_KEY, sites],
  );
}

function pinnedLinks(page) {
  return page.getByRole("navigation", { name: "Pinned sites" }).getByRole("link");
}

test("shows no pinned sites row until a site is pinned", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#pinned-sites")).toBeHidden();
  await expect(page.locator("#pinned-sites a")).toHaveCount(0);
});

test("pinned sites are on the page from its first paint", async ({ page }) => {
  // Record the tiles each frame is about to paint, from the first frame that has the page.
  await page.addInitScript(() => {
    window.paintedSites = [];

    function record() {
      if (document.getElementById("search")) {
        const links = [...document.querySelectorAll("#pinned-sites a")];
        window.paintedSites.push(links.map((link) => link.textContent).join(" | "));
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

  expect(new Set(frames)).toEqual(new Set(["Ggithub.com | EExample"]));
  await expect(pinnedLinks(page).first()).toHaveAccessibleName("github.com");
  await expect(pinnedLinks(page).first()).toHaveAttribute("href", "https://github.com/");
});

test("adds, renames, reorders, and removes pinned sites in Customize", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Customize" }).click();
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

  await first.getByRole("button", { name: "Customize" }).click();
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
