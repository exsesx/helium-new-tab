import { expect, test } from "bun:test";
import { readPreferences, fontFamily, fonts, resolvedFonts } from "../src/lib/model.js";

test("validates display and font preferences, ignoring legacy shortcuts", () => {
  const value = readPreferences({
    theme: "bad",
    showClock: "no",
    showSeconds: true,
    showDate: false,
    showServiceIcons: false,
    clockFont: "mono",
    dateFont: "serif",
    shortcuts: [],
  });

  expect(value.theme).toBe("system");
  expect(value.showClock).toBe(true);
  expect(value.showSeconds).toBe(true);
  expect(value.showDate).toBe(false);
  expect(value.showServiceIcons).toBe(false);
  expect(readPreferences({ showServiceIcons: "true" }).showServiceIcons).toBe(false);

  expect(value.clockFont).toBe("mono");
  expect(value.dateFont).toBe("inherit");
  expect(value.dateCustomFont).toBe("");
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
    uiFont: "custom",
    uiCustomFont: "Inter",
    monoFont: "custom",
    monoCustomFont: "JetBrains Mono",
  });

  const resolved = resolvedFonts(preferences);

  expect(resolved.clock).toBe(resolved.interface);
  expect(resolved.date).toBe(resolved.interface);
  expect(resolved.search).toBe(resolved.interface);

  preferences.dateFont = "custom";
  preferences.dateCustomFont = "Georgia";
  preferences.uiCustomFont = "Avenir";

  expect(resolvedFonts(preferences).date).toStartWith('"Georgia",');
  expect(resolvedFonts(preferences).search).toStartWith('"Avenir",');

  preferences.dateFont = "inherit";

  expect(resolvedFonts(preferences).date).toBe(resolvedFonts(preferences).interface);

  preferences.clockFont = "mono";
  preferences.monoCustomFont = "";

  expect(resolvedFonts(preferences).clock).toBe(fonts.mono);
});

test("keeps a valid dark background style", () => {
  expect(readPreferences(null).background).toBe("blend");
  expect(readPreferences({ background: "helium" }).background).toBe("helium");
  expect(readPreferences({ background: "separate" }).background).toBe("blend");
});
