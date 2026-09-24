import { PREFERENCES_KEY } from "./storage.js";

// Permissions differ per device, so each device keeps its own service-icon choice.
const DEVICE_KEYS = ["showServiceIcons"];
// Stay well below chrome.storage.sync's write quota while someone types a font name.
const WRITE_DELAY = 1000;

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

  function flush() {
    const area = syncArea();

    clearTimeout(timer);

    if (!changedKeys.size) {
      return;
    }

    changedKeys.clear();

    if (!area) {
      return;
    }

    area.set({ [PREFERENCES_KEY]: shared(getPreferences()) }).catch(() => {
      // Local storage still has the change; sync retries on the next save.
    });
  }

  function write(...keys) {
    for (const key of keys) {
      changedKeys.add(key);
    }

    clearTimeout(timer);
    timer = setTimeout(flush, WRITE_DELAY);
  }

  // Changes made here that have not been sent yet, such as a font name being typed. A copy
  // from another tab or device predates them, so they must survive when it is applied.
  function unsent() {
    const preferences = getPreferences();

    return Object.fromEntries([...changedKeys].map((key) => [key, preferences[key]]));
  }

  return { write, flush, unsent };
}

export function onSyncedChange(listener) {
  const storage = typeof chrome !== "undefined" ? chrome.storage : undefined;

  storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName === "sync" && Object.hasOwn(changes, PREFERENCES_KEY)) {
      listener(changes[PREFERENCES_KEY].newValue);
    }
  });
}
