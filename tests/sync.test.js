import { afterEach, expect, test } from "bun:test";
import { createSyncWriter, mergeSynced, onSyncedChange, readSynced } from "../src/lib/sync.js";

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
  const write = createSyncWriter();

  write({ theme: "light", showServiceIcons: true });
  write({ theme: "dark", showServiceIcons: true });
  expect(data["helium-tab"]).toBeUndefined();

  await Bun.sleep(1100);

  expect(data["helium-tab"]).toEqual({ theme: "dark" });
  expect(await readSynced()).toEqual({ theme: "dark" });
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
  expect(() => createSyncWriter()({ theme: "dark" })).not.toThrow();
  expect(() => onSyncedChange(() => {})).not.toThrow();
});
