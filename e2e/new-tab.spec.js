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

test("slash focuses search and Escape leaves it", async ({ page }) => {
  await page.goto("/");

  await page.locator("body").press("/");
  await expect(page.locator("#search")).toBeFocused();

  await page.locator("#search").press("Escape");
  await expect(page.locator("#search")).not.toBeFocused();
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
