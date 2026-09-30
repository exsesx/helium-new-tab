import { PREFERENCES_KEY } from "./model.js";

// Permissions differ per device, so each device keeps its own service-icon choice.
const DEVICE_KEYS = ["showServiceIcons"];
// Stay well below chrome.storage.sync's write quota while someone types a font name.
const WRITE_DELAY = 1000;
// Names this device in its changes. Local storage is per device, so it is never synced.
const DEVICE_ID_KEY = `${PREFERENCES_KEY}-device`;

function syncArea() {
  return typeof chrome !== "undefined" ? chrome.storage?.sync : undefined;
}

function shared(value) {
  const result = { ...value };

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

// Preferences by default; pinned sites pass their own key.
export async function readSynced(key = PREFERENCES_KEY) {
  const area = syncArea();

  if (!area) {
    return undefined;
  }

  try {
    return (await area.get(key))[key];
  } catch {
    return undefined;
  }
}

// Debounces writes of the current value; flush() sends a pending write at once so closing the
// tab cannot drop it.
export function createSyncWriter(getValue, key = PREFERENCES_KEY) {
  let timer;
  let changed = false;

  function flush() {
    const area = syncArea();

    clearTimeout(timer);

    if (!changed) {
      return;
    }

    changed = false;

    if (!area) {
      return;
    }

    area.set({ [key]: shared(getValue()) }).catch(() => {
      // Local storage still has the change; sync retries on the next save.
    });
  }

  function write() {
    changed = true;

    clearTimeout(timer);
    timer = setTimeout(flush, WRITE_DELAY);
  }

  return { write, flush };
}

export function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);

    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }

    return id;
  } catch {
    // Without storage, each tab orders only its own changes.
    return crypto.randomUUID();
  }
}

// Keeps this device's changes in order. Each change gets a later stamp than the last, and a
// copy of an earlier one that arrives late, such as the sync event of a previous write or
// another tab passing it on, is not current. Copies from other devices, or from versions
// without stamps, always are.
export function createChangeOrder(device, initial) {
  let latest = initial?.changedBy === device ? initial.changedAt : 0;

  return {
    stamp(value) {
      latest = Math.max(Date.now(), latest + 1);
      value.changedAt = latest;
      value.changedBy = device;
    },

    isCurrent(value) {
      if (value?.changedBy !== device || !Number.isFinite(value.changedAt)) {
        return true;
      }

      if (value.changedAt < latest) {
        return false;
      }

      latest = value.changedAt;

      return true;
    },
  };
}

export function onSyncedChange(listener, key = PREFERENCES_KEY) {
  const storage = typeof chrome !== "undefined" ? chrome.storage : undefined;

  storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName === "sync" && Object.hasOwn(changes, key)) {
      listener(changes[key].newValue);
    }
  });
}
