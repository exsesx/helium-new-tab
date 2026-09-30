// The full-quality background image. It stays on this device as a Blob in IndexedDB, next to a
// rendition fitted to the screen, and one of them is faded in over the first-paint placeholder once
// it has decoded.
import {
  applyBackgroundImage,
  BACKGROUND_IMAGE_KEY,
  loadBackgroundImage,
  PLACEHOLDER_VERSION,
  renditionSize,
} from "./background.js";

const DATABASE = "helium-tab";
const STORE = "background";
const RECORD = "image";
// The full image fades in over the placeholder, or appears at once with reduced motion. Nothing
// else on the page changes when it does, so only the photo repaints.
const FADE = 250;

let database;
// The photo on the page, and a count that lets a newer paint cancel an older one.
let photo;
let paints = 0;
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

// Returns { blob, rendition, updatedAt }, or undefined when there is no full image.
export function readStoredImage() {
  return transact("readonly", (store) => store.get(RECORD));
}

function deleteStoredImage() {
  return transact("readwrite", (store) => store.delete(RECORD));
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
    record = await readStoredImage();
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

  // Added transparent, it is rastered during the next two frames, so the fade shows it sharp from
  // its start rather than sharpening while it runs.
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

// Keeps an imported image: the full image first, then the placeholder that tells this tab and
// the others to show it. Throws when either store is full or unavailable, and then keeps neither.
export async function saveBackgroundImage({ blob, rendition, placeholder }) {
  await transact("readwrite", (store) =>
    store.put({ blob, rendition, updatedAt: placeholder.updatedAt }, RECORD),
  );

  try {
    localStorage.setItem(BACKGROUND_IMAGE_KEY, JSON.stringify(placeholder));
  } catch (error) {
    await deleteStoredImage().catch(() => {});

    throw error;
  }

  applyBackgroundImage(placeholder);

  return paintBackgroundPhoto(placeholder);
}

// Clears both stores and the page at once; the full image is deleted in the background.
export function removeBackgroundImage() {
  try {
    localStorage.removeItem(BACKGROUND_IMAGE_KEY);
  } catch {
    /* Without storage the placeholder was never kept; clear the page anyway. */
  }

  applyBackgroundImage(undefined);
  void paintBackgroundPhoto(undefined);

  return deleteStoredImage().catch(() => {});
}

// Removes the image chosen at updatedAt, unless another one replaced it meanwhile.
export function withdrawBackgroundImage(updatedAt) {
  const stored = loadBackgroundImage();

  if (stored?.updatedAt !== updatedAt) {
    return Promise.resolve();
  }

  return removeBackgroundImage();
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

// Adds a rendition to the stored image, unless another choice replaced the image meanwhile.
function storeRendition(updatedAt, rendition) {
  return transact("readwrite", (store) => {
    const request = store.get(RECORD);

    request.addEventListener("success", () => {
      if (request.result?.updatedAt === updatedAt) {
        store.put({ ...request.result, rendition }, RECORD);
      }
    });

    return request;
  });
}

// Brings the kept image up to date once the page shows it, so nobody has to choose it again: a
// placeholder from an older version, or of a shape that can no longer be painted (given as
// { updatedAt }), is made again from the full image, and so is a rendition for a larger screen
// than the last one. Resolves with the new placeholder when it changed.
export async function updateBackgroundImage(placeholder) {
  let record;

  try {
    record = await readStoredImage();
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

  if (result.rendition) {
    await storeRendition(placeholder.updatedAt, result.rendition).catch(() => {});
  }

  if (result.placeholder && storePlaceholder(result.placeholder)) {
    applyBackgroundImage(result.placeholder);

    return result.placeholder;
  }

  return undefined;
}
