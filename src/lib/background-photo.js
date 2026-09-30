// The full-quality background image. It stays on this device as a Blob in IndexedDB, next to a
// rendition fitted to the screen, and one of them is faded in over the first-paint placeholder once
// it has decoded.
//
// The full image and its placeholder live in two stores that cannot change together, and every
// tab of the extension writes to them. The placeholder in local storage is the commit: it names
// the one image in use by the time it was chosen. Each image has its own IndexedDB record under
// that time, so saving one never overwrites another, a failed save deletes only its own record,
// and the tab that commits an image deletes the record it replaced.
import {
  applyBackgroundImage,
  applyImageForeground,
  BACKGROUND_IMAGE_KEY,
  PLACEHOLDER_VERSION,
  renditionSize,
} from "./background.js";

const DATABASE = "helium-tab";
const STORE = "background";
const recordKey = (updatedAt) => `image:${updatedAt}`;
// Earlier builds kept one record under this key, and staged replacements under another.
const LEGACY_RECORD = "image";
const LEGACY_STAGED = "staged";
// A record no placeholder names, left by a tab closed while saving, is deleted after this long.
const ORPHAN_AGE = 10 * 60 * 1000;
// The full image fades in over the placeholder, or appears at once with reduced motion. Nothing
// else on the page changes when it does, so only the photo repaints.
const FADE = 250;

let database;
// This tab's saves and record deletions run one after another.
let writes = Promise.resolve();
// The photo on the page, and a count that lets a newer paint cancel an older one.
let photo;
let paints = 0;
// The decoded thumbnail the text set is sampled from when the window changes shape.
let cropSource;
// "none", "loading", "shown", or "missing" when the placeholder has no full image to show.
let status = "none";

function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);

    request.addEventListener("upgradeneeded", () => request.result.createObjectStore(STORE));
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  }).catch((error) => {
    // Let a later call try again.
    database = undefined;
    throw error;
  });

  return database;
}

// Runs one request in its own transaction and resolves once the transaction has finished.
async function transact(mode, makeRequest) {
  const connection = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = connection.transaction(STORE, mode);
    const request = makeRequest(transaction.objectStore(STORE));

    transaction.addEventListener("complete", () => resolve(request.result));
    transaction.addEventListener("abort", () => reject(transaction.error ?? request.error));
  });
}

// This screen in device pixels, which a rendition covers.
export function screenPixels() {
  return {
    width: Math.round(screen.width * devicePixelRatio),
    height: Math.round(screen.height * devicePixelRatio),
  };
}

// The rendition fitted to a screen, when one was made, and the size it must have to cover this
// screen. Without a needed size, the full image is no larger than the screen.
function renditionFor(record, placeholder) {
  const needed = renditionSize(placeholder, screenPixels());
  const { rendition } = record;
  const covers =
    Boolean(needed) &&
    rendition?.blob instanceof Blob &&
    rendition.width >= needed.width &&
    rendition.height >= needed.height;

  return { needed, covering: covers ? rendition : undefined };
}

// Whether the image is larger than this screen and has no rendition that covers it yet.
function lacksRendition(record, placeholder) {
  const { needed, covering } = renditionFor(record, placeholder);

  return Boolean(needed) && !covering;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

function serialize(task) {
  const run = writes.then(task, task);

  writes = run.catch(() => {});

  return run;
}

// Returns the image chosen at updatedAt as { blob, rendition, updatedAt }, or undefined when there
// is no such full image.
export async function readStoredImage(updatedAt) {
  const [own, legacy] = await Promise.all([
    transact("readonly", (store) => store.get(recordKey(updatedAt))),
    transact("readonly", (store) => store.get(LEGACY_RECORD)),
  ]);

  if (own) {
    return own;
  }

  return legacy?.updatedAt === updatedAt ? { ...legacy, isLegacy: true } : undefined;
}

// Deletes the record of the image chosen at updatedAt, under either key.
function deleteRecord(updatedAt) {
  return transact("readwrite", (store) => {
    const legacy = store.get(LEGACY_RECORD);

    legacy.addEventListener("success", () => {
      if (legacy.result?.updatedAt === updatedAt) {
        store.delete(LEGACY_RECORD);
      }
    });

    return store.delete(recordKey(updatedAt));
  });
}

// Deletes records that no placeholder names and that no save can still be writing.
function deleteOrphans(inUse) {
  return transact("readwrite", (store) => {
    const request = store.getAllKeys();

    request.addEventListener("success", () => {
      for (const key of request.result) {
        const time = Number(String(key).slice("image:".length));
        const isOrphan =
          String(key).startsWith("image:") && time !== inUse && Date.now() - time > ORPHAN_AGE;

        if (isOrphan || key === LEGACY_STAGED) {
          store.delete(key);
        }
      }
    });

    return request;
  });
}

// The time of the image the stored placeholder names, even one too old to paint.
function storedImageTime() {
  try {
    const time = JSON.parse(localStorage.getItem(BACKGROUND_IMAGE_KEY))?.updatedAt;

    return Number.isFinite(time) ? time : undefined;
  } catch {
    return undefined;
  }
}

export function backgroundPhotoStatus() {
  return status;
}

// Shows the full image that belongs to the placeholder, or none without one. Resolves with the
// status once it is painted, or once it is known to be missing, so the page keeps the placeholder.
export async function paintBackgroundPhoto(placeholder) {
  const paint = ++paints;

  if (!placeholder) {
    photo?.remove();
    photo = undefined;
    status = "none";

    return status;
  }

  if (photo?.dataset.updatedAt === String(placeholder.updatedAt)) {
    return status;
  }

  status = "loading";

  let record;

  try {
    record = await readStoredImage(placeholder.updatedAt);
  } catch {
    record = undefined;
  }

  const matches = record?.blob instanceof Blob && record.updatedAt === placeholder.updatedAt;

  if (paint !== paints) {
    return status;
  }

  if (!matches) {
    photo?.remove();
    photo = undefined;
    status = "missing";

    return status;
  }

  // The rendition covers the screen without the full image's decoding and downscaling. Without
  // one yet, the full image shows and updateBackgroundImage makes it.
  const url = URL.createObjectURL(renditionFor(record, placeholder).covering?.blob ?? record.blob);
  const next = new Image();

  next.className = "background-photo";
  next.alt = "";
  next.setAttribute("aria-hidden", "true");
  next.dataset.updatedAt = String(placeholder.updatedAt);
  next.src = url;

  try {
    await next.decode();
  } catch {
    if (paint === paints) {
      status = "missing";
    }

    return status;
  } finally {
    // The decoded image stays with the element.
    URL.revokeObjectURL(url);
  }

  if (paint !== paints) {
    return status;
  }

  // The photo it replaces goes once the fade has finished.
  const previous = photo;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fade = { duration: reducedMotion ? 0 : FADE, easing: "ease-in-out" };

  // Added transparent, it gets two frames to be drawn before the fade starts, so the fade is less
  // likely to show it sharpening while it runs.
  next.style.opacity = "0";
  document.body.append(next);
  photo = next;
  status = "shown";

  await nextFrame();
  await nextFrame();

  const animation = next.animate({ opacity: [0, 1] }, fade);

  // The running fade wins over this, and once it has finished the photo stays opaque.
  next.style.opacity = "";
  await animation.finished;
  previous?.remove();

  return status;
}

// Keeps an imported image: its record first, then its placeholder, which commits it, then the
// page shows it. isCurrent says whether the choice is still wanted; it is checked in the same
// task as the commit, so a newer choice in this tab can never come between them. onCommit runs
// right after the commit. Resolves with the paint status, or "superseded" without a commit.
// Throws when either store is full or unavailable, and then keeps the previous image as it was.
export async function saveBackgroundImage(
  { blob, rendition, placeholder },
  { isCurrent = () => true, onCommit = () => {} } = {},
) {
  const { updatedAt } = placeholder;
  const committed = await serialize(async () => {
    if (!isCurrent()) {
      return false;
    }

    await transact("readwrite", (store) =>
      store.put({ blob, rendition, updatedAt }, recordKey(updatedAt)),
    );

    if (!isCurrent()) {
      await deleteRecord(updatedAt).catch(() => {});

      return false;
    }

    const replaced = storedImageTime();

    try {
      localStorage.setItem(BACKGROUND_IMAGE_KEY, JSON.stringify(placeholder));
    } catch (error) {
      await deleteRecord(updatedAt).catch(() => {});

      throw error;
    }

    applyBackgroundImage(placeholder);
    onCommit(placeholder);

    if (replaced !== undefined && replaced !== updatedAt) {
      await deleteRecord(replaced).catch(() => {});
    }

    return true;
  });

  return committed ? paintBackgroundPhoto(placeholder) : "superseded";
}

// Clears the placeholder and the page at once, then deletes the full image.
export function removeBackgroundImage() {
  const removed = storedImageTime();

  try {
    localStorage.removeItem(BACKGROUND_IMAGE_KEY);
  } catch {
    /* Without storage the placeholder was never kept; clear the page anyway. */
  }

  applyBackgroundImage(undefined);
  void paintBackgroundPhoto(undefined);

  if (removed === undefined) {
    return Promise.resolve();
  }

  return serialize(() => deleteRecord(removed)).catch(() => {});
}

// Writes an updated placeholder, unless another choice replaced the image meanwhile.
function storePlaceholder(placeholder) {
  try {
    const stored = JSON.parse(localStorage.getItem(BACKGROUND_IMAGE_KEY));

    if (stored?.updatedAt !== placeholder.updatedAt) {
      return false;
    }

    localStorage.setItem(BACKGROUND_IMAGE_KEY, JSON.stringify(placeholder));

    return true;
  } catch {
    return false;
  }
}

function discardPlaceholder(updatedAt) {
  try {
    const stored = JSON.parse(localStorage.getItem(BACKGROUND_IMAGE_KEY));

    if (stored?.updatedAt === updatedAt) {
      localStorage.removeItem(BACKGROUND_IMAGE_KEY);
    }
  } catch {
    /* Nothing to discard. */
  }
}

// Adds a rendition to an image's record, unless the image was removed meanwhile.
function storeRendition(updatedAt, rendition) {
  return transact("readwrite", (store) => {
    const request = store.get(recordKey(updatedAt));

    request.addEventListener("success", () => {
      if (request.result) {
        store.put({ ...request.result, rendition }, recordKey(updatedAt));
      }
    });

    return request;
  });
}

// Moves an image from an earlier build's record to its own.
function moveLegacyRecord({ blob, rendition, updatedAt }) {
  return transact("readwrite", (store) => {
    store.delete(LEGACY_RECORD);

    return store.put({ blob, rendition, updatedAt }, recordKey(updatedAt));
  });
}

// Brings the kept image up to date once the page shows it, so nobody has to choose it again: a
// placeholder from an older version, or of a shape that can no longer be painted (given as
// { updatedAt }), is made again from the full image, and so is a rendition for a larger screen
// than the last one. Resolves with the new placeholder when it changed.
export async function updateBackgroundImage(placeholder) {
  let record;

  try {
    record = await readStoredImage(placeholder.updatedAt);
  } catch {
    return undefined;
  }

  const hasFullImage = record?.blob instanceof Blob && record.updatedAt === placeholder.updatedAt;

  if (!hasFullImage) {
    // A placeholder too old to paint and without its full image has nothing to show.
    if (!placeholder.thumbnail) {
      discardPlaceholder(placeholder.updatedAt);
    }

    return undefined;
  }

  await serialize(async () => {
    if (record.isLegacy) {
      await moveLegacyRecord(record);
    }

    await deleteOrphans(placeholder.updatedAt);
  }).catch(() => {});

  const isOutdated = placeholder.version !== PLACEHOLDER_VERSION;
  // A placeholder too old to paint does not know the image's size, so its rendition is made too.
  const needsRendition = !placeholder.width || lacksRendition(record, placeholder);

  if (!isOutdated && !needsRendition) {
    return undefined;
  }

  // The image code loads with Customize, so it stays out of the page's own script.
  const { refreshBackgroundImage } = await import("./background-image.js");
  const result = await refreshBackgroundImage({
    blob: record.blob,
    placeholder,
    updatePlaceholder: isOutdated,
    screen: needsRendition ? screenPixels() : undefined,
  });

  return serialize(async () => {
    if (result.rendition) {
      await storeRendition(placeholder.updatedAt, result.rendition).catch(() => {});
    }

    if (result.placeholder && storePlaceholder(result.placeholder)) {
      applyBackgroundImage(result.placeholder);

      return result.placeholder;
    }

    return undefined;
  });
}

// Chooses the text set again for the part of the photo this window shows behind the content,
// sampled from the placeholder's thumbnail. The first paint used the closest window shape the
// placeholder kept; see bandsForAspect.
export async function followWindowShape(placeholder) {
  if (!placeholder) {
    return;
  }

  if (cropSource?.updatedAt !== placeholder.updatedAt) {
    const thumbnail = new Image();

    thumbnail.src = placeholder.thumbnail;
    await thumbnail.decode();
    cropSource = { updatedAt: placeholder.updatedAt, bitmap: await createImageBitmap(thumbnail) };
  }

  const { bitmap } = cropSource;
  const { sampleBands } = await import("./background-image.js");

  // Another image may have replaced this one meanwhile.
  if (document.documentElement.dataset.backgroundImage === undefined) {
    return;
  }

  applyImageForeground(sampleBands(bitmap, { width: innerWidth, height: innerHeight }));
}
