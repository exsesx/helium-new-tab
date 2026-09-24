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

test("switches the interface language", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByLabel("Language").selectOption("de");

  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("#search")).toHaveAttribute("placeholder", /[Ss]uche/);
});

test("a saved language never paints English text first", async ({ page }) => {
  // Record the footer text each frame is about to paint, from the first frame it exists.
  await page.addInitScript(() => {
    window.paintedHints = [];

    function record() {
      const hint = document.querySelector(".keyboard-hint [data-i18n]");

      if (hint) {
        const hidden = getComputedStyle(hint).visibility === "hidden";
        window.paintedHints.push(hidden ? "hidden" : hint.textContent);
      }

      if (window.paintedHints.length < 5) {
        requestAnimationFrame(record);
      }
    }

    requestAnimationFrame(record);
  });

  await savePreferences(page, { language: "de" });
  await page.reload();
  await page.waitForFunction(() => window.paintedHints.length >= 5);

  const frames = await page.evaluate(() => window.paintedHints);

  expect(frames).not.toContain("to search");
  expect(frames.at(-1)).toBe("zum Suchen");
});

test("slash focuses search and Escape leaves it", async ({ page }) => {
  await page.goto("/");

  await page.locator("body").press("/");
  await expect(page.locator("#search")).toBeFocused();

  await page.locator("#search").press("Escape");
  await expect(page.locator("#search")).not.toBeFocused();
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
