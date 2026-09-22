import { describe, expect, test } from "bun:test";
import {
  readPreferences,
  searchDestination,
  websiteUrl,
  fontFamily,
  fonts,
  resolvedFonts,
} from "../src/lib/model.js";

describe("shortcut URLs", () => {
  test("normalizes ordinary sites and preserves explicit local HTTP", () => {
    expect(websiteUrl(" example.com/docs ")).toBe("https://example.com/docs");
    expect(websiteUrl("http://localhost:3000")).toBe("http://localhost:3000/");
    expect(websiteUrl("localhost:3000")).toBe("https://localhost:3000/");
  });

  test("rejects executable URLs and embedded credentials", () => {
    for (const input of [
      "javascript:alert(1)",
      "data:text/html,test",
      "file:///tmp/test",
      "https://user:pass@example.com",
      "hello world",
      "",
    ]) {
      expect(() => websiteUrl(input)).toThrow();
    }
  });
});

test("searches phrases and navigates URLs", () => {
  expect(searchDestination("a quiet afternoon")).toEqual({ query: "a quiet afternoon" });
  expect(searchDestination("example.com/docs")).toEqual({ url: "https://example.com/docs" });
  expect(searchDestination("localhost:3000")).toEqual({ url: "https://localhost:3000/" });
  expect(searchDestination("what is example.com")).toEqual({ query: "what is example.com" });
  expect(searchDestination("javascript:alert(1)")).toEqual({ query: "javascript:alert(1)" });
  expect(searchDestination("   ")).toEqual({ query: "" });
});

test("validates display and font preferences, ignoring legacy shortcuts", () => {
  const value = readPreferences({
    theme: "bad",
    showClock: "no",
    showSeconds: true,
    showDate: false,
    showServiceIcons: false,
    clockFont: "mono",
    dateFont: "serif",
    interfaceFont: "invalid",
    shortcuts: [],
  });

  expect(value.theme).toBe("system");
  expect(value.showClock).toBe(true);
  expect(value.showSeconds).toBe(true);
  expect(value.showDate).toBe(false);
  expect(value.showServiceIcons).toBe(false);
  expect(readPreferences({ showServiceIcons: "false" }).showServiceIcons).toBe(true);

  expect(value.clockFont).toBe("mono");
  expect(value.dateFont).toBe("custom");
  expect(value.dateCustomFont).toBe("Georgia");
  expect(value.uiFont).toBe("system");

  expect(value).not.toHaveProperty("shortcuts");
  expect(readPreferences({ clockFont: "__proto__" }).clockFont).toBe("inherit");
  expect(readPreferences(null).showSeconds).toBe(false);
});

test("custom font names survive preferences and stay literal CSS families", () => {
  const saved = readPreferences({
    clockFont: "custom",
    clockCustomFont: "JetBrains Mono",
    dateCustomFont: 123,
  });

  expect(saved.clockFont).toBe("custom");
  expect(saved.clockCustomFont).toBe("JetBrains Mono");
  expect(saved.dateCustomFont).toBe("");

  expect(fontFamily(" JetBrains Mono ")).toBe(`"JetBrains Mono", ${fonts.system}`);
  expect(fontFamily("   ")).toBe(fonts.system);
  expect(fontFamily('A"B')).toBe(`"A\\"B", ${fonts.system}`);
  expect(fontFamily("Georgia, serif")).toBe(`"Georgia, serif", ${fonts.system}`);
  expect(fontFamily("日本語フォント")).toBe(`"日本語フォント", ${fonts.system}`);
});

test("global fonts cascade unless a component overrides them", () => {
  const preferences = readPreferences({
    fontVersion: 2,
    uiFont: "custom",
    uiCustomFont: "Inter",
    monoFont: "custom",
    monoCustomFont: "JetBrains Mono",
  });

  const resolved = resolvedFonts(preferences);

  expect(resolved.clock).toBe(resolved.mono);
  expect(resolved.date).toBe(resolved.interface);
  expect(resolved.search).toBe(resolved.interface);

  preferences.dateFont = "custom";
  preferences.dateCustomFont = "Georgia";
  preferences.uiCustomFont = "Avenir";

  expect(resolvedFonts(preferences).date).toStartWith('"Georgia",');
  expect(resolvedFonts(preferences).search).toStartWith('"Avenir",');

  preferences.dateFont = "inherit";

  expect(resolvedFonts(preferences).date).toBe(resolvedFonts(preferences).interface);

  preferences.monoCustomFont = "";

  expect(resolvedFonts(preferences).clock).toBe(fonts.mono);
});

test("migrates existing custom interface font to global UI", () => {
  const migrated = readPreferences({
    interfaceFont: "custom",
    interfaceCustomFont: "Inter",
    clockFont: "system",
  });

  expect(migrated.uiFont).toBe("custom");
  expect(migrated.uiCustomFont).toBe("Inter");
  expect(migrated.clockFont).toBe("inherit");
  expect(readPreferences(migrated)).toEqual(migrated);
});

test("background simplification preserves existing appearances", () => {
  expect(readPreferences(null).background).toBe("blend");

  for (const background of ["blend", "helium"]) {
    const migrated = readPreferences({
      background,
      lightBackground: "helium",
      darkBackground: background === "blend" ? "helium" : "blend",
    });

    expect(migrated.background).toBe(background);
    expect(readPreferences(migrated)).toEqual(migrated);
    expect(migrated).not.toHaveProperty("lightBackground");
    expect(migrated).not.toHaveProperty("darkBackground");

    for (const oldMode of ["separate", undefined]) {
      expect(readPreferences({ background: oldMode, darkBackground: background }).background).toBe(
        background,
      );
    }
  }

  expect(readPreferences({ background: "separate", darkBackground: "invalid" }).background).toBe(
    "blend",
  );

  expect(readPreferences({ lightBackground: "helium" }).background).toBe("blend");
});
