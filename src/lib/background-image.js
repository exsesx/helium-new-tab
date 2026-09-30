// Turns a chosen image file into a background: the full image, kept at full quality, and a tiny
// placeholder for the first paint. Everything happens on this device.
import { imageForeground, MAX_IMAGE_SIDE } from "./background.js";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

// Compressed photos within these limits are kept byte for byte. PNG and GIF files, which are
// large for photos, and larger images are encoded again.
const KEPT_TYPES = ["image/jpeg", "image/webp", "image/avif"];
const MAX_KEPT_SIZE = 12 * 1024 * 1024;
const ENCODED_SIDE = 3840;
const ENCODED_QUALITY = 0.92;
// Files this large would take too long to decode.
const MAX_FILE_SIZE = 64 * 1024 * 1024;

// The placeholder's thumbnail: about 1 KB, and blurred when painted.
const THUMBNAIL_SIDE = 32;
const THUMBNAIL_QUALITY = 0.8;
// Tiny enough to average quickly, large enough to not be one pixel's color.
const SAMPLE_SIDE = 16;

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

export function thumbnailSize(width, height) {
  return fitWithin(width, height, THUMBNAIL_SIDE);
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

function sampleColor(bitmap) {
  const canvas = new OffscreenCanvas(SAMPLE_SIDE, SAMPLE_SIDE);
  const context = canvas.getContext("2d");

  context.drawImage(bitmap, 0, 0, SAMPLE_SIDE, SAMPLE_SIDE);

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

// Returns the full image as a Blob and the placeholder that stands in for it at first paint.
export async function importBackgroundImage(file) {
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
    const kept = keepsOriginal({ type: file.type, size: file.size, width, height });
    const size = kept ? { width, height } : fitWithin(width, height, ENCODED_SIDE);
    const blob = kept ? file : await encode(bitmap, color, size, ENCODED_QUALITY);
    const thumbnail = await encode(bitmap, color, thumbnailSize(width, height), THUMBNAIL_QUALITY);

    return {
      blob,
      placeholder: {
        averageColor: color,
        thumbnail: await readAsDataUrl(thumbnail),
        width: size.width,
        height: size.height,
        updatedAt: Date.now(),
        foreground: imageForeground(color).tone,
      },
    };
  } finally {
    bitmap.close();
  }
}
