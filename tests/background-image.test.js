import { expect, test } from "bun:test";
import {
  averageColor,
  encodeWithinCap,
  fitWithin,
  IMAGE_ENCODINGS,
} from "../src/lib/background-image.js";

test("fits the longest side within the limit without enlarging", () => {
  expect(fitWithin(5120, 2880, 2560)).toEqual({ width: 2560, height: 1440 });
  expect(fitWithin(1000, 4000, 2560)).toEqual({ width: 640, height: 2560 });
  expect(fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600 });
  expect(fitWithin(10_000, 1, 2560)).toEqual({ width: 2560, height: 1 });
});

test("encodes once more at a lower quality and size when the first result is too large", async () => {
  const attempts = [];
  const encode = async (encoding) => {
    attempts.push(encoding);

    return "x".repeat(encoding.quality > 0.8 ? 200 : 100);
  };

  expect(await encodeWithinCap(encode, IMAGE_ENCODINGS, 150)).toHaveLength(100);
  expect(attempts).toEqual(IMAGE_ENCODINGS);

  const second = IMAGE_ENCODINGS[1];

  expect(second.quality).toBeLessThan(IMAGE_ENCODINGS[0].quality);
  expect(second.maxSide).toBeLessThan(IMAGE_ENCODINGS[0].maxSide);
});

test("stops at the first encoding under the cap and rejects images that never fit", async () => {
  let calls = 0;
  const small = async () => {
    calls++;

    return "x".repeat(10);
  };

  expect(await encodeWithinCap(small, IMAGE_ENCODINGS, 150)).toHaveLength(10);
  expect(calls).toBe(1);

  const large = async () => "x".repeat(200);

  await expect(encodeWithinCap(large, IMAGE_ENCODINGS, 150)).rejects.toMatchObject({
    code: "size",
  });
});

test("averages visible pixels into a hex color", () => {
  // Red and blue, then a fully transparent green that does not count.
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 0]);

  expect(averageColor(pixels)).toBe("#800080");
  expect(averageColor(new Uint8ClampedArray([10, 20, 30, 0]))).toBe("#808080");
});
