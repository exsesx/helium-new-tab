import { afterEach, expect, test } from "bun:test";
import { bookmarksBarLinks, requestBookmarks } from "../src/lib/bookmarks.js";
import { readPreferences } from "../src/lib/model.js";

afterEach(() => {
  delete globalThis.chrome;
});

test("bookmarks are off by default and only accept boolean preferences", () => {
  expect(readPreferences(null).showBookmarks).toBe(false);
  expect(readPreferences({ showBookmarks: true }).showBookmarks).toBe(true);
  expect(readPreferences({ showBookmarks: "true" }).showBookmarks).toBe(false);
});

test("bookmark style keeps the existing bar by default and accepts tiles", () => {
  expect(readPreferences(null).bookmarkStyle).toBe("bar");
  expect(readPreferences({ bookmarkStyle: "tiles" }).bookmarkStyle).toBe("tiles");
  expect(readPreferences({ bookmarkStyle: "unknown" }).bookmarkStyle).toBe("bar");
});

test("reads localized and account bookmark bars in order, including subfolders", () => {
  const links = bookmarksBarLinks([
    {
      children: [
        { id: "1", title: "Old bar", children: [{ url: "https://ignored.example", title: "Old" }] },
        {
          id: "20",
          folderType: "bookmarks-bar",
          title: "Favoris",
          children: [
            { id: "21", url: "https://example.com", title: "Example" },
            { title: "Work", children: [{ id: "22", url: "https://github.com", title: "GitHub" }] },
          ],
        },
        {
          id: "30",
          folderType: "bookmarks-bar",
          children: [{ id: "31", url: "https://helium.computer", title: "" }],
        },
        {
          id: "2",
          folderType: "other",
          children: [{ url: "https://other.example", title: "Other" }],
        },
      ],
    },
  ]);

  expect(links.map(({ id }) => id)).toEqual(["21", "22", "31"]);
  expect(links[1].folder).toBe("Work");
  expect(links[2].title).toBe("helium.computer");
});

test("supports older Chromium without folderType and skips executable or malformed URLs", () => {
  const links = bookmarksBarLinks([
    {
      children: [
        {
          id: "1",
          children: [
            { id: "a", title: "Local", url: "file:///tmp/example.html" },
            { id: "b", title: "Settings", url: "chrome://settings" },
            { title: "Script", url: "javascript:alert(1)" },
            { title: "Data", url: "data:text/html,test" },
            { title: "Bad", url: "not a URL" },
          ],
        },
      ],
    },
  ]);

  expect(links.map(({ id }) => id)).toEqual(["a", "b"]);
  expect(bookmarksBarLinks([])).toEqual([]);
});

test("requests bookmark and favicon access together and handles denial or missing APIs", async () => {
  const requests = [];
  globalThis.chrome = {
    permissions: {
      request: async (value) => {
        requests.push(value);

        return false;
      },
    },
  };

  expect(await requestBookmarks()).toBe(false);
  expect(requests).toEqual([{ permissions: ["bookmarks", "favicon"] }]);

  chrome.permissions.request = async () => true;
  expect(await requestBookmarks()).toBe(true);

  chrome.permissions.request = async () => {
    throw new Error("unavailable");
  };
  expect(await requestBookmarks()).toBe(false);

  delete globalThis.chrome;
  expect(await requestBookmarks()).toBe(false);
});
