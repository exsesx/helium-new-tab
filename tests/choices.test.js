import { expect, test } from "bun:test";
import { createChoices } from "../src/settings/choices.js";

// A choice that finishes when its promise is resolved, and keeps its result only if still latest.
function slowChoice(choices, kept, value) {
  const token = choices.begin();
  let finish;
  const done = new Promise((resolve) => (finish = resolve)).then(() => {
    if (choices.isCurrent(token)) {
      kept.push(value);
    }
  });

  return { finish, done };
}

test("the latest choice owns the result, whatever finishes last", async () => {
  const choices = createChoices();
  const kept = [];

  // An import is still decoding when Default is chosen.
  const image = slowChoice(choices, kept, "image");
  const defaultMode = choices.begin();

  image.finish();
  await image.done;

  expect(kept).toEqual([]);
  expect(choices.isCurrent(defaultMode)).toBe(true);
});

test("a second import wins over a first that finishes after it", async () => {
  const choices = createChoices();
  const kept = [];
  const first = slowChoice(choices, kept, "first");
  const second = slowChoice(choices, kept, "second");

  second.finish();
  await second.done;
  first.finish();
  await first.done;

  expect(kept).toEqual(["second"]);
});

test("a choice that is still the latest keeps its result", async () => {
  const choices = createChoices();
  const kept = [];
  const image = slowChoice(choices, kept, "image");

  image.finish();
  await image.done;

  expect(kept).toEqual(["image"]);
});
