import { expect, test } from "bun:test";
import { SEARCH_KEY_ACTIONS, searchKeyAction } from "../src/lib/search-keys.js";

// A stand-in for an element that answers only the selectors it was built with.
function element(...selectors) {
  return { matches: (query) => selectors.some((selector) => query.split(", ").includes(selector)) };
}

const body = element("body");

function keydown(key, overrides = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    target: body,
    ...overrides,
  };
}

function actionFor(event, context = {}) {
  return searchKeyAction(event, {
    typeToSearch: true,
    hasQuery: false,
    isDialogOpen: () => false,
    ...context,
  });
}

test("printable keys type into search, while other keys do nothing", () => {
  for (const key of ["a", "Z", "7", "é", "?", "日"]) {
    expect(actionFor(keydown(key))).toBe(SEARCH_KEY_ACTIONS.type);
  }

  expect(actionFor(keydown("A", { shiftKey: true }))).toBe(SEARCH_KEY_ACTIONS.type);

  for (const key of ["Backspace", "ArrowDown", "Enter", "Tab", "Escape", "F5", "Dead", "Process"]) {
    expect(actionFor(keydown(key))).toBe(SEARCH_KEY_ACTIONS.none);
  }
});

test("slash only focuses search, with or without typing to search", () => {
  expect(actionFor(keydown("/"))).toBe(SEARCH_KEY_ACTIONS.focus);
  expect(actionFor(keydown("/"), { typeToSearch: false })).toBe(SEARCH_KEY_ACTIONS.focus);
  expect(actionFor(keydown("/"), { hasQuery: true })).toBe(SEARCH_KEY_ACTIONS.focus);
});

test("Ctrl, Cmd, and Alt leave keys to the browser", () => {
  for (const modifier of ["ctrlKey", "metaKey", "altKey"]) {
    expect(actionFor(keydown("a", { [modifier]: true }))).toBe(SEARCH_KEY_ACTIONS.none);
    expect(actionFor(keydown("/", { [modifier]: true }))).toBe(SEARCH_KEY_ACTIONS.none);
  }
});

test("keys that belong to an input method are left alone", () => {
  expect(actionFor(keydown("a", { isComposing: true }))).toBe(SEARCH_KEY_ACTIONS.none);
  expect(actionFor(keydown("/", { isComposing: true }))).toBe(SEARCH_KEY_ACTIONS.none);
});

test("editable targets and open dialogs keep their keys", () => {
  for (const target of [
    element("input"),
    element("textarea"),
    element("select"),
    element("[contenteditable]"),
  ]) {
    expect(actionFor(keydown("a", { target }))).toBe(SEARCH_KEY_ACTIONS.none);
    expect(actionFor(keydown("/", { target }))).toBe(SEARCH_KEY_ACTIONS.none);
  }

  const dialogOpen = { isDialogOpen: () => true };

  expect(actionFor(keydown("a"), dialogOpen)).toBe(SEARCH_KEY_ACTIONS.none);
  expect(actionFor(keydown("/"), dialogOpen)).toBe(SEARCH_KEY_ACTIONS.none);
});

test("focused links and buttons still send typing to search", () => {
  expect(actionFor(keydown("a", { target: element("a") }))).toBe(SEARCH_KEY_ACTIONS.type);
  expect(actionFor(keydown("a", { target: element("button") }))).toBe(SEARCH_KEY_ACTIONS.type);
});

test("turning the setting off leaves only slash", () => {
  const off = { typeToSearch: false };

  expect(actionFor(keydown("a"), off)).toBe(SEARCH_KEY_ACTIONS.none);
  expect(actionFor(keydown("a"), { ...off, hasQuery: true })).toBe(SEARCH_KEY_ACTIONS.none);
  expect(actionFor(keydown(" "), { ...off, hasQuery: true })).toBe(SEARCH_KEY_ACTIONS.none);
});

test("a space never starts a search and never replaces a button press", () => {
  expect(actionFor(keydown(" "))).toBe(SEARCH_KEY_ACTIONS.none);
  expect(actionFor(keydown(" "), { hasQuery: true })).toBe(SEARCH_KEY_ACTIONS.type);

  const button = element("button");

  expect(actionFor(keydown(" ", { target: button }), { hasQuery: true })).toBe(
    SEARCH_KEY_ACTIONS.none,
  );
});

test("the dialog is checked only for keys that could reach search", () => {
  let checks = 0;
  const isDialogOpen = () => {
    checks += 1;

    return false;
  };

  actionFor(keydown("ArrowDown"), { isDialogOpen });
  actionFor(keydown("a", { ctrlKey: true }), { isDialogOpen });
  actionFor(keydown("a", { target: element("input") }), { isDialogOpen });

  expect(checks).toBe(0);

  actionFor(keydown("a"), { isDialogOpen });

  expect(checks).toBe(1);
});
