import { expect, test } from "bun:test";
import { createDateFormatter, createTimeFormatter } from "../src/lib/date-time.js";
import { readPreferences } from "../src/lib/model.js";

const afternoon = new Date(2026, 8, 21, 16, 5, 9);
const midnight = new Date(2026, 8, 21, 0, 5, 9);
const values = (formatter, date) =>
  Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));

test("new preferences use Automatic and keep valid time formats", () => {
  expect(readPreferences(null).timeFormat).toBe("auto");
  expect(readPreferences({ timeFormat: "24h" }).timeFormat).toBe("24h");
  expect(readPreferences({ timeFormat: "invalid" }).timeFormat).toBe("auto");
});

test("Automatic follows US and UK hour cycles", () => {
  const us = values(createTimeFormatter({ timeFormat: "auto" }, "en-US"), afternoon);
  const uk = values(createTimeFormatter({ timeFormat: "auto" }, "en-GB"), afternoon);

  expect(us.hour).toBe("4");
  expect(us.dayPeriod).toBe("PM");

  expect(uk.hour).toBe("16");
  expect(uk.dayPeriod).toBeUndefined();
});

test("explicit formats override locale, including midnight and seconds", () => {
  const twelve = values(
    createTimeFormatter({ timeFormat: "12h", showSeconds: true }, "en-GB"),
    midnight,
  );
  const twentyFour = values(createTimeFormatter({ timeFormat: "24h" }, "en-US"), midnight);

  expect(twelve.hour).toBe("12");
  expect(twelve.minute).toBe("05");
  expect(twelve.second).toBe("09");
  expect(twelve.dayPeriod.toLowerCase()).toBe("am");

  expect(twentyFour.hour).toBe("00");
  expect(twentyFour.dayPeriod).toBeUndefined();
  expect(twentyFour.second).toBeUndefined();
});

test("date names and order follow the requested browser languages", () => {
  const polish = values(createDateFormatter(["pl-PL", "en-US"]), afternoon);

  expect(polish.weekday).toBe("poniedziałek");
  expect(polish.month).toBe("września");

  for (const [locale, expected] of [
    ["en-US", ["month", "day"]],
    ["en-GB", ["day", "month"]],
  ]) {
    const order = createDateFormatter(locale)
      .formatToParts(afternoon)
      .filter(({ type }) => type === "month" || type === "day")
      .map(({ type }) => type);

    expect(order).toEqual(expected);
  }
});

test("locale time parts retain prefixed day periods", () => {
  const parts = createTimeFormatter({ timeFormat: "12h" }, "zh-CN").formatToParts(afternoon);

  expect(parts.findIndex(({ type }) => type === "dayPeriod")).toBeLessThan(
    parts.findIndex(({ type }) => type === "hour"),
  );
});
