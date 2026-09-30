// Turns a chosen image file into a background: the full image, kept at full quality, and a small
// placeholder for the first paint. Everything happens on this device.
import { imageForeground, MAX_IMAGE_SIDE, MAX_THUMBNAIL_LENGTH } from "./background.js";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

// Compressed photos within these limits are kept byte for byte. PNG and GIF files, which are
// large for photos, and larger images are encoded again.
const KEPT_TYPES = ["image/jpeg", "image/webp", "image/avif"];
const MAX_KEPT_SIZE = 12 * 1024 * 1024;
const ENCODED_SIDE = 3840;
const ENCODED_QUALITY = 0.92;
// Files this large would take too long to decode.
const MAX_FILE_SIZE = 64 * 1024 * 1024;

// The placeholder's thumbnail: large enough that the browser's own scaling makes it a soft
// version of the image, with no filter to paint, and close enough to it that the full image's
// fade is hard to see. Busy photos that would not fit local storage's share are encoded smaller.
const THUMBNAIL_ENCODINGS = [
  { side: 640, quality: 0.7 },
  { side: 640, quality: 0.5 },
  { side: 480, quality: 0.5 },
  { side: 320, quality: 0.5 },
];
// Tiny enough to average quickly, large enough to not be one pixel's color.
const SAMPLE_SIDE = 16;
// Where the page's content sits, as fractions of the window: the logo and search field, then the
// clock, date, and pinned sites. The text set is chosen by the parts of the image behind these.
const CONTENT_BANDS = [
  { left: 0.25, right: 0.75, top: 0.25, bottom: 0.45 },
  { left: 0.25, right: 0.75, top: 0.45, bottom: 0.7 },
];
const WHOLE_IMAGE = { left: 0, right: 1, top: 0, bottom: 1 };

export class BackgroundImageError extends Error {
  constructor(code) {
    super(`Background image ${code}`);
    this.code = code;
  }
}

// Scales a size down so its longest side is at most maxSide, keeping its shape.
export function fitWithin(width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// The part of an image that a band of the window shows when the image covers the window,
// centered, as fractions of the image.
export function coveredRegion(image, view, band) {
  const scale = Math.max(view.width / image.width, view.height / image.height);
  const shownWidth = view.width / scale / image.width;
  const shownHeight = view.height / scale / image.height;
  const left = (1 - shownWidth) / 2;
  const top = (1 - shownHeight) / 2;

  return {
    left: left + band.left * shownWidth,
    right: left + band.right * shownWidth,
    top: top + band.top * shownHeight,
    bottom: top + band.bottom * shownHeight,
  };
}

// The parts of an image behind the content in a window of this size.
export function contentRegions(image, view) {
  return CONTENT_BANDS.map((band) => coveredRegion(image, view, band));
}

export function thumbnailSize(width, height, side = THUMBNAIL_ENCODINGS[0].side) {
  return fitWithin(width, height, side);
}

// Whether a decoded file is kept as it is rather than encoded again.
export function keepsOriginal({ type, size, width, height }) {
  return (
    KEPT_TYPES.includes(type) && size <= MAX_KEPT_SIZE && Math.max(width, height) <= MAX_IMAGE_SIDE
  );
}

// The average of the visible pixels in RGBA data, as #rrggbb.
export function averageColor(pixels) {
  const sums = [0, 0, 0];
  let weight = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] / 255;

    sums[0] += pixels[index] * alpha;
    sums[1] += pixels[index + 1] * alpha;
    sums[2] += pixels[index + 2] * alpha;
    weight += alpha;
  }

  if (weight === 0) {
    return "#808080";
  }

  const hex = sums.map((sum) =>
    Math.round(sum / weight)
      .toString(16)
      .padStart(2, "0"),
  );

  return `#${hex.join("")}`;
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

async function decode(file) {
  try {
    // Phone photos are upright only after their EXIF orientation is applied. GIFs decode to
    // their first frame.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new BackgroundImageError("decode");
  }
}

// The average color of a region of the bitmap, given as fractions of it.
function sampleColor(bitmap, region = WHOLE_IMAGE) {
  const canvas = new OffscreenCanvas(SAMPLE_SIDE, SAMPLE_SIDE);
  const context = canvas.getContext("2d");
  const x = region.left * bitmap.width;
  const y = region.top * bitmap.height;
  const width = Math.max(1, (region.right - region.left) * bitmap.width);
  const height = Math.max(1, (region.bottom - region.top) * bitmap.height);

  context.drawImage(bitmap, x, y, width, height, 0, 0, SAMPLE_SIDE, SAMPLE_SIDE);

  return averageColor(context.getImageData(0, 0, SAMPLE_SIDE, SAMPLE_SIDE).data);
}

// Draws the bitmap at a size and encodes it as WebP, or JPEG where WebP is not available.
async function encode(bitmap, color, { width, height }, quality) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");

  // Transparent areas show the same color the page paints under the image.
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);

  const blob = await canvas.convertToBlob({ type: "image/webp", quality });

  // Browsers without a WebP encoder return PNG instead.
  if (blob.type === "image/webp") {
    return blob;
  }

  return canvas.convertToBlob({ type: "image/jpeg", quality });
}

// The largest thumbnail that fits the placeholder, as a data URL.
async function encodeThumbnail(bitmap, color) {
  let thumbnail;

  for (const { side, quality } of THUMBNAIL_ENCODINGS) {
    const size = thumbnailSize(bitmap.width, bitmap.height, side);

    thumbnail = await readAsDataUrl(await encode(bitmap, color, size, quality));

    if (thumbnail.length <= MAX_THUMBNAIL_LENGTH) {
      return thumbnail;
    }
  }

  return thumbnail;
}

// Returns the full image as a Blob and the placeholder that stands in for it at first paint. The
// text set is chosen for a window of the given size, this one by default.
export async function importBackgroundImage(
  file,
  view = { width: globalThis.innerWidth, height: globalThis.innerHeight },
) {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new BackgroundImageError("type");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new BackgroundImageError("size");
  }

  const bitmap = await decode(file);

  try {
    const { width, height } = bitmap;
    const color = sampleColor(bitmap);
    const bands = contentRegions({ width, height }, view).map((region) =>
      sampleColor(bitmap, region),
    );
    const kept = keepsOriginal({ type: file.type, size: file.size, width, height });
    const size = kept ? { width, height } : fitWithin(width, height, ENCODED_SIDE);
    const blob = kept ? file : await encode(bitmap, color, size, ENCODED_QUALITY);
    const thumbnail = await encodeThumbnail(bitmap, color);

    return {
      blob,
      placeholder: {
        averageColor: color,
        bands,
        thumbnail,
        width: size.width,
        height: size.height,
        updatedAt: Date.now(),
        foreground: imageForeground(bands).tone,
      },
    };
  } finally {
    bitmap.close();
  }
}
