// Turns a chosen image file into a background record. Everything happens on this device.
import { MAX_IMAGE_LENGTH } from "./background.js";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

// The first pass keeps the image sharp on large screens; the second trades a little
// detail for size once when the first is over the cap.
export const IMAGE_ENCODINGS = [
  { maxSide: 2560, quality: 0.85 },
  { maxSide: 1920, quality: 0.7 },
];

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

// Tries each encoding in turn and returns the first data URL under the cap.
export async function encodeWithinCap(encode, encodings = IMAGE_ENCODINGS, cap = MAX_IMAGE_LENGTH) {
  for (const encoding of encodings) {
    const dataUrl = await encode(encoding);

    if (dataUrl.length <= cap) {
      return dataUrl;
    }
  }

  throw new BackgroundImageError("size");
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
    // GIFs decode to their first frame.
    return await createImageBitmap(file);
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

async function encode(bitmap, color, { maxSide, quality }) {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");

  // Transparent areas show the same color the page paints under the image.
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);

  let blob = await canvas.convertToBlob({ type: "image/webp", quality });

  // Browsers without a WebP encoder return PNG instead.
  if (blob.type !== "image/webp") {
    blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  }

  return readAsDataUrl(blob);
}

export async function importBackgroundImage(file) {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new BackgroundImageError("type");
  }

  const bitmap = await decode(file);

  try {
    const color = sampleColor(bitmap);
    const dataUrl = await encodeWithinCap((encoding) => encode(bitmap, color, encoding));

    return { dataUrl, averageColor: color, updatedAt: Date.now() };
  } finally {
    bitmap.close();
  }
}
