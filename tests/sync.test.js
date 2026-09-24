import { afterEach, expect, test } from "bun:test";
import {
  createChangeOrder,
  createSyncWriter,
  mergeSynced,
  onSyncedChange,
  readSynced,
} from "../src/lib/sync.js";

afterEach(() => {
  delete globalThis.chrome;
});

function fakeStorage(initial = {}) {
  const data = { ...initial };
  const listeners = [];

  globalThis.chrome = {
    storage: {
      sync: {
        get: async (key) => ({ [key]: data[key] }),
        set: async (value) => Object.assign(data, value),
      },
      onChanged: { addListener: (listener) => listeners.push(listener) },
    },
  };

  return { data, listeners };
}

test("device-only keys stay local when merging synced preferences", () => {
  const merged = mergeSynced(
    { theme: "dark", showServiceIcons: true },
    { theme: "light", showServiceIcons: false },
  );

  expect(merged).toEqual({ theme: "dark", showServiceIcons: false });
  expect(mergeSynced(undefined, {})).toBeUndefined();
  expect(mergeSynced("bad", {})).toBeUndefined();
});

test("writes are debounced and omit device-only keys", async () => {
  const { data } = fakeStorage();
  const preferences = { theme: "light", showServiceIcons: true };
  const { write } = createSyncWriter(() => preferences);

  write("theme");
  preferences.theme = "dark";
  write("theme");
  expect(data["helium-tab"]).toBeUndefined();

  await Bun.sleep(1100);

  expect(data["helium-tab"]).toEqual({ theme: "dark" });
  expect(await readSynced()).toEqual({ theme: "dark" });
});

test("flush writes a pending change at once and cancels the delayed write", async () => {
  const { data } = fakeStorage();
  const { write, flush } = createSyncWriter(() => ({ theme: "dark", showServiceIcons: true }));

  write("theme");
  flush();
  await Bun.sleep(0);

  expect(data["helium-tab"]).toEqual({ theme: "dark" });

  data["helium-tab"] = { theme: "light" };
  await Bun.sleep(1100);

  expect(data["helium-tab"]).toEqual({ theme: "light" });
});

test("flush without a pending change writes nothing", async () => {
  const { data } = fakeStorage();

  createSyncWriter(() => ({ theme: "dark" })).flush();
  await Bun.sleep(0);

  expect(data).toEqual({});
});

test("changes stay unsent with their current values until a flush", () => {
  fakeStorage();
  const preferences = { theme: "dark", uiCustomFont: "Int", showDate: true };
  const { write, flush, unsent } = createSyncWriter(() => preferences);

  expect(unsent()).toEqual({});

  write("uiCustomFont");
  preferences.uiCustomFont = "Inter";

  expect(unsent()).toEqual({ uiCustomFont: "Inter" });

  flush();

  expect(unsent()).toEqual({});
});

test("late copies of this device's earlier changes are not current", () => {
  const order = createChangeOrder("this");
  const first = { theme: "dark" };
  const second = { theme: "light" };

  order.stamp(first);
  const earlier = { ...first };
  order.stamp(second);

  expect(second.changedAt).toBeGreaterThan(first.changedAt);
  expect(second.changedBy).toBe("this");

  // Sync events and other tabs can deliver the first change after the second.
  expect(order.isCurrent(earlier)).toBe(false);
  expect(order.isCurrent({ ...second })).toBe(true);
});

test("copies from other devices and unstamped versions are always current", () => {
  const order = createChangeOrder("this");
  order.stamp({});

  expect(order.isCurrent({ theme: "dark", changedAt: 1, changedBy: "other" })).toBe(true);
  expect(order.isCurrent({ theme: "dark" })).toBe(true);
  expect(order.isCurrent(null)).toBe(true);
});

test("a newer copy of this device's changes from another tab moves the order forward", () => {
  const saved = { changedAt: Date.now() + 60_000, changedBy: "this" };
  const order = createChangeOrder("this", { changedAt: 5, changedBy: "this" });

  expect(order.isCurrent(saved)).toBe(true);
  expect(order.isCurrent({ changedAt: saved.changedAt - 1, changedBy: "this" })).toBe(false);

  const next = {};
  order.stamp(next);

  expect(next.changedAt).toBeGreaterThan(saved.changedAt);
});

test("reports only sync changes to the preferences key", () => {
  const { listeners } = fakeStorage();
  const values = [];

  onSyncedChange((value) => values.push(value));

  listeners[0]({ "helium-tab": { newValue: { theme: "dark" } } }, "sync");
  listeners[0]({ "helium-tab": { newValue: { theme: "light" } } }, "local");
  listeners[0]({ other: { newValue: 1 } }, "sync");

  expect(values).toEqual([{ theme: "dark" }]);
});

test("does nothing without extension storage", async () => {
  expect(await readSynced()).toBeUndefined();
  const { write, flush, unsent } = createSyncWriter(() => ({ theme: "dark" }));

  expect(() => write("theme")).not.toThrow();
  expect(() => flush()).not.toThrow();
  expect(unsent()).toEqual({});
  expect(() => onSyncedChange(() => {})).not.toThrow();
});
