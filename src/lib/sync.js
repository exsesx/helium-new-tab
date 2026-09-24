import { PREFERENCES_KEY } from "./storage.js";

// Permissions differ per device, so each device keeps its own service-icon choice.
const DEVICE_KEYS = ["showServiceIcons"];
// Stay well below chrome.storage.sync's write quota while someone types a font name.
const WRITE_DELAY = 1000;
// How long a sent change stays protected after its write settles. Change events for earlier
// writes, and other tabs passing them on through local storage, arrive within this window.
const SETTLE_DELAY = 500;

function syncArea() {
  return typeof chrome !== "undefined" ? chrome.storage?.sync : undefined;
}

function shared(preferences) {
  const result = { ...preferences };

  for (const key of DEVICE_KEYS) {
    delete result[key];
  }

  return result;
}

// Combine synced preferences with this device's own keys. Returns undefined for no data.
export function mergeSynced(value, local) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const result = { ...value };

  for (const key of DEVICE_KEYS) {
    result[key] = local[key];
  }

  return result;
}

export async function readSynced() {
  const area = syncArea();

  if (!area) {
    return undefined;
  }

  try {
    return (await area.get(PREFERENCES_KEY))[PREFERENCES_KEY];
  } catch {
    return undefined;
  }
}

// Debounces writes of the current preferences; flush() sends a pending write at once so
// closing the tab cannot drop it.
export function createSyncWriter(getPreferences) {
  let timer;
  const changedKeys = new Set();
  // Sent keys and how many of their writes are still settling.
  const sendingKeys = new Map();

  function release(keys) {
    for (const key of keys) {
      const count = sendingKeys.get(key) - 1;

      if (count) {
        sendingKeys.set(key, count);
      } else {
        sendingKeys.delete(key);
      }
    }
  }

  function flush() {
    const area = syncArea();

    clearTimeout(timer);

    if (!changedKeys.size) {
      return;
    }

    const keys = [...changedKeys];
    changedKeys.clear();

    if (!area) {
      return;
    }

    for (const key of keys) {
      sendingKeys.set(key, (sendingKeys.get(key) ?? 0) + 1);
    }

    area
      .set({ [PREFERENCES_KEY]: shared(getPreferences()) })
      .catch(() => {
        // Local storage still has the change; sync retries on the next save.
      })
      .finally(() => setTimeout(release, SETTLE_DELAY, keys));
  }

  function write(...keys) {
    for (const key of keys) {
      changedKeys.add(key);
    }

    clearTimeout(timer);
    timer = setTimeout(flush, WRITE_DELAY);
  }

  // Changes made here that are unsent, such as a font name being typed, or still settling. A
  // copy from another tab or device, or the change event of an earlier write, predates them,
  // so they must survive when it is applied.
  function pending() {
    const preferences = getPreferences();
    const keys = new Set([...changedKeys, ...sendingKeys.keys()]);

    return Object.fromEntries([...keys].map((key) => [key, preferences[key]]));
  }

  return { write, flush, pending };
}

export function onSyncedChange(listener) {
  const storage = typeof chrome !== "undefined" ? chrome.storage : undefined;

  storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName === "sync" && Object.hasOwn(changes, PREFERENCES_KEY)) {
      listener(changes[PREFERENCES_KEY].newValue);
    }
  });
}
