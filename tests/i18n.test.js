import { expect, test } from "bun:test";
import { languages, resolveLanguage, createTranslator } from "../src/i18n/index.js";
import { readPreferences } from "../src/lib/model.js";
import english from "../src/i18n/locales/en.json";

// Product policy: Russian is intentionally unsupported, including regional variants.
test("language preference and regional fallbacks exclude Russian", () => {
  expect(resolveLanguage("auto", ["ru-RU", "pl-PL"])).toEqual({ language: "pl", locale: "pl-PL" });
  expect(resolveLanguage("ru", ["ru-RU"])).toEqual({ language: "en", locale: "en" });
  expect(readPreferences({ language: "ru" }).language).toBe("auto");
  expect(readPreferences({ language: "pl" }).language).toBe("pl");
  expect(readPreferences({ language: "toString" }).language).toBe("auto");
  expect(resolveLanguage("auto", ["invalid_", "es-MX"])).toEqual({
    language: "es",
    locale: "es-MX",
  });
  expect(resolveLanguage("auto", ["en-GB"]).locale).toBe("en-GB");
  expect(resolveLanguage("uk", ["en-US"]).language).toBe("uk");
  expect(resolveLanguage("auto", ["zh-TW"]).language).toBe("zh-Hant");
  expect(resolveLanguage("auto", ["zh-CN"]).language).toBe("zh-Hans");
  expect(resolveLanguage("auto", ["zh-Hant-CN"]).language).toBe("zh-Hant");
  expect(resolveLanguage("auto", ["no-NO"]).language).toBe("nb");
  expect(resolveLanguage("auto", ["sr-RS"]).locale).toBe("sr-Latn-RS");
});

test("all 37 bundled catalogs are complete and preserve substitutions", async () => {
  expect(Object.keys(languages)).toHaveLength(37);
  const files = await Array.fromAsync(
    new Bun.Glob("*.json").scan(new URL("../src/i18n/locales", import.meta.url).pathname),
  );
  expect(files.map((name) => name.replace(".json", "")).sort()).toEqual(
    Object.keys(languages).sort(),
  );
  expect(files.some((name) => /^ru(?:[.-]|$)/i.test(name))).toBe(false);
  for (const language of Object.keys(languages)) {
    const messages = await Bun.file(
      new URL(`../src/i18n/locales/${language}.json`, import.meta.url),
    ).json();
    expect(Object.keys(messages).sort()).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(messages)) {
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
      expect(value.match(/\{\w+\}/g) ?? []).toEqual(english[key].match(/\{\w+\}/g) ?? []);
    }
  }
});

test("only requested catalogs load and successful selections are cached", async () => {
  const requests = [];
  const translator = createTranslator(async (language) => {
    requests.push(language);
    return { ...english, customize: language };
  });
  await translator.select("en");
  expect(requests).toEqual([]);
  await translator.select("pl");
  expect(translator.text("customize")).toBe("pl");
  await translator.select("en");
  await translator.select("pl");
  expect(requests).toEqual(["pl"]);
});

test("a late translation cannot replace a newer language choice", async () => {
  let finish;
  const translator = createTranslator(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = translator.select("pl");
  await translator.select("en");
  finish({ ...english, customize: "Polish" });
  expect(await pending).toEqual({ stale: true });
  expect(translator.text("customize")).toBe("Customize");
});

test("translation failures fall back to English and remain retryable", async () => {
  let attempts = 0;
  const translator = createTranslator(async () => {
    if (++attempts === 1) {
      throw new Error("offline");
    }
    return { ...english, customize: "Dostosuj" };
  });
  expect(await translator.select("pl")).toEqual({ language: "en", failed: true });
  expect(translator.text("customize")).toBe("Customize");
  expect(await translator.select("pl")).toEqual({ language: "pl", failed: false });
  expect(translator.text("customize")).toBe("Dostosuj");
});
