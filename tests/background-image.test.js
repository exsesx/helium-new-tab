import { expect, test } from "bun:test";
import {
  averageColor,
  fitWithin,
  keepsOriginal,
  thumbnailSize,
} from "../src/lib/background-image.js";

test("fits the longest side within the limit without enlarging", () => {
  expect(fitWithin(5120, 2880, 2560)).toEqual({ width: 2560, height: 1440 });
  expect(fitWithin(1000, 4000, 2560)).toEqual({ width: 640, height: 2560 });
  expect(fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600 });
  expect(fitWithin(10_000, 1, 2560)).toEqual({ width: 2560, height: 1 });
});

test("keeps compressed photos byte for byte, and encodes the rest again", () => {
  const photo = { type: "image/jpeg", size: 6 * 1024 * 1024, width: 5120, height: 2880 };

  for (const type of ["image/jpeg", "image/webp", "image/avif"]) {
    expect(keepsOriginal({ ...photo, type }), type).toBe(true);
  }

  // PNG and GIF files are large for photos.
  expect(keepsOriginal({ ...photo, type: "image/png" })).toBe(false);
  expect(keepsOriginal({ ...photo, type: "image/gif" })).toBe(false);

  // So are photos over about 12 MB or wider than 5120 px on their longest side.
  expect(keepsOriginal({ ...photo, size: 12 * 1024 * 1024 })).toBe(true);
  expect(keepsOriginal({ ...photo, size: 12 * 1024 * 1024 + 1 })).toBe(false);
  expect(keepsOriginal({ ...photo, width: 5121 })).toBe(false);
  expect(keepsOriginal({ ...photo, width: 2880, height: 5121 })).toBe(false);
});

test("thumbnails are about 32 px on their longest side, keeping the shape", () => {
  expect(thumbnailSize(5120, 2880)).toEqual({ width: 32, height: 18 });
  expect(thumbnailSize(3024, 4032)).toEqual({ width: 24, height: 32 });
  expect(thumbnailSize(20, 10)).toEqual({ width: 20, height: 10 });
  expect(thumbnailSize(10_000, 10)).toEqual({ width: 32, height: 1 });
});

test("averages visible pixels into a hex color", () => {
  // Red and blue, then a fully transparent green that does not count.
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 0]);

  expect(averageColor(pixels)).toBe("#800080");
  expect(averageColor(new Uint8ClampedArray([10, 20, 30, 0]))).toBe("#808080");
});
