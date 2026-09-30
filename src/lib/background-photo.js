// The full-quality background image. It stays on this device as a Blob in IndexedDB and is
// faded in over the first-paint placeholder once it has decoded.
import { applyBackgroundImage, BACKGROUND_IMAGE_KEY } from "./background.js";

const DATABASE = "helium-tab";
const STORE = "background";
const RECORD = "image";
// The full image fades in over the placeholder, or appears at once with reduced motion.
const FADE = 200;

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

// Returns { blob, updatedAt }, or undefined when there is no full image.
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

  const url = URL.createObjectURL(record.blob);
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

  document.body.append(next);
  photo = next;
  status = "shown";

  await next.animate({ opacity: [0, 1] }, { duration: reducedMotion ? 0 : FADE, easing: "ease" })
    .finished;
  previous?.remove();

  return status;
}

// Keeps an imported image: the full image first, then the placeholder that tells this tab and
// the others to show it. Throws when either store is full or unavailable, and then keeps neither.
export async function saveBackgroundImage({ blob, placeholder }) {
  await transact("readwrite", (store) =>
    store.put({ blob, updatedAt: placeholder.updatedAt }, RECORD),
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
