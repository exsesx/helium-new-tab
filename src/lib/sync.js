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

// Debounces writes; flush() sends a pending write at once so closing the tab cannot drop it.
export function createSyncWriter() {
  let timer;
  let pending;

  function flush() {
    const area = syncArea();

    clearTimeout(timer);

    if (!area || !pending) {
      return;
    }

    const value = shared(pending);
    pending = undefined;

    area.set({ [PREFERENCES_KEY]: value }).catch(() => {
      // Local storage still has the change; sync retries on the next save.
    });
  }

  function write(preferences) {
    if (!syncArea()) {
      return;
    }

    pending = preferences;

    clearTimeout(timer);
    timer = setTimeout(flush, WRITE_DELAY);
  }

  return { write, flush };
}

export function onSyncedChange(listener) {
  const storage = typeof chrome !== "undefined" ? chrome.storage : undefined;

  storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName === "sync" && Object.hasOwn(changes, PREFERENCES_KEY)) {
      listener(changes[PREFERENCES_KEY].newValue);
    }
  });
}
