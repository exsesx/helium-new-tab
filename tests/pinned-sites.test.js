import { expect, test } from "bun:test";
import { translate } from "../src/i18n/languages.js";
import {
  PINNED_SITES_BYTES,
  PINNED_SITES_LIMIT,
  readPinnedSites,
  SITE_TITLE_LIMIT,
  siteHost,
  siteUrl,
} from "../src/lib/model.js";
import {
  addPinnedSite,
  movePinnedSite,
  pinnedSitesBytes,
  removePinnedSite,
  renamePinnedSite,
} from "../src/lib/pinned-sites.js";
import { pastels, siteLetter, siteTone } from "../src/lib/site-tiles.js";

const site = (host, title = host) => ({ url: `https://${host}/`, title });

test("adds what the search field would open as a website", () => {
  expect(addPinnedSite([], "github.com").sites).toEqual([
    { url: "https://github.com/", title: "github.com" },
  ]);

  expect(addPinnedSite([], "  https://www.example.com/docs?page=1  ", " Docs ").sites).toEqual([
    { url: "https://www.example.com/docs?page=1", title: "Docs" },
  ]);

  expect(addPinnedSite([], "localhost:3000").sites[0].url).toBe("http://localhost:3000/");
  expect(addPinnedSite([], "www.github.com").sites[0].title).toBe("github.com");
});

test("refuses searches, other schemes, and over-long addresses", () => {
  for (const text of ["", "   ", "next.js", "quiet music", "!yt music", "javascript:alert(1)"]) {
    expect(addPinnedSite([], text)).toEqual({ error: "address" });
  }

  expect(addPinnedSite([], "https://user:secret@example.com")).toEqual({ error: "address" });
  expect(addPinnedSite([], `https://example.com/${"a".repeat(2048)}`)).toEqual({
    error: "address",
  });
});

test("refuses duplicates by normalized address", () => {
  const sites = [site("github.com")];

  expect(addPinnedSite(sites, "https://github.com")).toEqual({ error: "duplicate" });
  expect(addPinnedSite(sites, "GitHub.com")).toEqual({ error: "duplicate" });
  expect(addPinnedSite(sites, "github.com/features").sites).toHaveLength(2);
});

test("stops adding at the limit", () => {
  const sites = Array.from({ length: PINNED_SITES_LIMIT }, (_, index) =>
    site(`${index}.example.com`),
  );

  expect(addPinnedSite(sites, "github.com")).toEqual({ error: "full" });
  expect(addPinnedSite(sites.slice(1), "github.com").sites).toHaveLength(PINNED_SITES_LIMIT);
});

test("renames, moves, and removes sites without changing the original list", () => {
  const sites = [site("a.com"), site("b.com"), site("c.com")];

  expect(renamePinnedSite(sites, 1, "  Bee  ").sites[1]).toEqual({
    url: "https://b.com/",
    title: "Bee",
  });
  expect(renamePinnedSite(sites, 1, "   ").sites[1].title).toBe("b.com");

  const moved = movePinnedSite(sites, 2, -1);

  expect(moved.map(({ title }) => title)).toEqual(["a.com", "c.com", "b.com"]);
  expect(movePinnedSite(sites, 0, -1)).toBe(sites);
  expect(movePinnedSite(sites, 2, 1)).toBe(sites);

  expect(removePinnedSite(sites, 0).map(({ title }) => title)).toEqual(["b.com", "c.com"]);
  expect(removePinnedSite([site("a.com")], 0)).toEqual([]);
  expect(sites.map(({ title }) => title)).toEqual(["a.com", "b.com", "c.com"]);
});

// A site whose address has a path of the given length.
const longSite = (host, length) => ({ url: `https://${host}/${"a".repeat(length)}`, title: host });
const longAddress = (host, length) => longSite(host, length).url;

test("adding stops at the last address that fits in one synced item", () => {
  const sites = ["a", "b", "c"].map((letter) => longSite(`${letter}.example.com`, 1800));
  const shortest = pinnedSitesBytes([...sites, longSite("d.example.com", 0)]);
  const room = PINNED_SITES_BYTES - shortest;

  expect(addPinnedSite(sites, longAddress("d.example.com", room)).sites).toHaveLength(4);
  expect(pinnedSitesBytes([...sites, longSite("d.example.com", room)])).toBe(PINNED_SITES_BYTES);
  expect(addPinnedSite(sites, longAddress("d.example.com", room + 1))).toEqual({
    error: "size",
  });
});

test("the longest allowed addresses fill the synced item before the site limit", () => {
  let sites = [];
  let result;

  for (let index = 0; index < PINNED_SITES_LIMIT; index++) {
    result = addPinnedSite(sites, longAddress(`${index}.example.com`, 2000));

    if (result.error) {
      break;
    }

    sites = result.sites;
  }

  expect(result).toEqual({ error: "size" });
  expect(sites).toHaveLength(3);
  expect(pinnedSitesBytes(sites)).toBeLessThanOrEqual(PINNED_SITES_BYTES);
});

test("names count by their encoded bytes, not their characters", () => {
  const others = ["b", "c", "d", "e"].map((letter) => longSite(`${letter}.example.com`, 1400));
  const plainName = "n".repeat(SITE_TITLE_LIMIT);
  const wideName = "🌍".repeat(SITE_TITLE_LIMIT);
  const shortest = pinnedSitesBytes([
    { ...longSite("a.example.com", 0), title: plainName },
    ...others,
  ]);
  const sites = [longSite("a.example.com", PINNED_SITES_BYTES - shortest), ...others];

  expect(renamePinnedSite(sites, 0, plainName).sites[0].title).toBe(plainName);
  expect(renamePinnedSite(sites, 0, wideName)).toEqual({ error: "size" });
  expect(renamePinnedSite(sites, 0, "Кириллица").sites[0].title).toBe("Кириллица");
});

test("addresses count in their percent-encoded form", () => {
  const cyrillic = addPinnedSite([], `example.com/${"п".repeat(100)}`).sites;
  const ascii = addPinnedSite([], `example.com/${"a".repeat(600)}`).sites;

  expect(cyrillic[0].url).toStartWith("https://example.com/%D0%BF%D0%BF");
  expect(pinnedSitesBytes(cyrillic)).toBe(pinnedSitesBytes(ascii));
});

test("the item is measured as Chromium serializes it", () => {
  const empty = `helium-tab-sites{"sites":[],"changedAt":9007199254740991.0,"changedBy":"${"x".repeat(64)}"}`;

  expect(pinnedSitesBytes([])).toBe(empty.length);
});

test("characters count by the bytes Chromium writes for them", () => {
  const bytes = (title) => pinnedSitesBytes([{ url: "https://a.com/", title }]);
  const plain = bytes("a");

  // Chromium escapes < and the line and paragraph separators as six-byte \uXXXX sequences.
  for (const escaped of ["<", "\u2028", "\u2029"]) {
    expect(bytes(escaped) - plain).toBe(5);
  }

  // It writes > as it is, like JSON.stringify.
  expect(bytes(">") - plain).toBe(0);

  expect(bytes("é") - plain).toBe(1);
  expect(bytes("日") - plain).toBe(2);
  expect(bytes("🌍") - plain).toBe(3);
});

test("names Chromium escapes count at their escaped size up to the exact limit", () => {
  const sites = ["a", "b", "c"].map((letter) => longSite(`${letter}.example.com`, 1800));
  const title = "<".repeat(SITE_TITLE_LIMIT);
  const withPath = (length) => [...sites, { ...longSite("d.example.com", length), title }];
  const room = PINNED_SITES_BYTES - pinnedSitesBytes(withPath(0));

  expect(pinnedSitesBytes(withPath(room))).toBe(PINNED_SITES_BYTES);
  expect(addPinnedSite(sites, longAddress("d.example.com", room), title).sites).toHaveLength(4);
  expect(addPinnedSite(sites, longAddress("d.example.com", room + 1), title)).toEqual({
    error: "size",
  });
});

test("four long addresses named with forty < each no longer all fit", () => {
  // Helium's chrome.storage.sync rejected this list when the estimate ignored Chromium's escapes.
  const title = "<".repeat(SITE_TITLE_LIMIT);
  let sites = [];
  let result;

  for (const letter of ["a", "b", "c", "d"]) {
    result = addPinnedSite(sites, longAddress(`${letter}.example.com`, 1800), title);

    if (result.error) {
      break;
    }

    sites = result.sites;
  }

  const rejected = [...sites, { ...longSite("d.example.com", 1800), title }];

  expect(result).toEqual({ error: "size" });
  expect(sites).toHaveLength(3);
  expect(pinnedSitesBytes(rejected)).toBeGreaterThan(8192);
});

test("a list already too large for sync can still take shorter names", () => {
  const sites = ["a", "b", "c", "d"].map((letter) => longSite(`${letter}.example.com`, 2000));

  expect(pinnedSitesBytes(sites)).toBeGreaterThan(PINNED_SITES_BYTES);
  expect(renamePinnedSite(sites, 0, "A").sites[0].title).toBe("A");
  expect(renamePinnedSite(sites, 0, "n".repeat(SITE_TITLE_LIMIT))).toEqual({ error: "size" });
});

test("stored lists are read whole even when they are too large for sync", () => {
  const sites = Array.from({ length: PINNED_SITES_LIMIT }, (_, index) =>
    longSite(`${index}.example.com`, 2000),
  );

  expect(pinnedSitesBytes(sites)).toBeGreaterThan(PINNED_SITES_BYTES);
  expect(readPinnedSites({ sites }).sites).toEqual(sites);
});

test("reads stored sites defensively", () => {
  expect(readPinnedSites(null)).toEqual({ sites: [] });
  expect(readPinnedSites("bad")).toEqual({ sites: [] });
  expect(readPinnedSites({ sites: "bad" })).toEqual({ sites: [] });
  expect(readPinnedSites({ sites: [] })).toEqual({ sites: [] });

  const value = readPinnedSites({
    sites: [
      null,
      "https://example.com/",
      { url: "https://github.com" },
      { url: "https://github.com/", title: "Duplicate" },
      { url: "not a url", title: "Broken" },
      { url: "ftp://example.com/", title: "FTP" },
      { url: "javascript:alert(1)", title: "Script" },
      { url: 42 },
      { url: `https://example.com/${"a".repeat(2048)}` },
      { url: "https://example.com", title: `  ${"x".repeat(SITE_TITLE_LIMIT + 10)}  ` },
      { url: "https://www.youtube.com/", title: "Line\nbreak" },
      { url: "https://mail.example.com/", title: { name: "Mail" } },
    ],
    changedAt: 5,
    changedBy: "device",
    extra: true,
  });

  expect(value).toEqual({
    sites: [
      { url: "https://github.com/", title: "github.com" },
      { url: "https://example.com/", title: "x".repeat(SITE_TITLE_LIMIT) },
      { url: "https://www.youtube.com/", title: "Linebreak" },
      { url: "https://mail.example.com/", title: "mail.example.com" },
    ],
    changedAt: 5,
    changedBy: "device",
  });
});

test("keeps at most eight stored sites", () => {
  const sites = Array.from({ length: 12 }, (_, index) => site(`${index}.example.com`));

  expect(readPinnedSites({ sites }).sites).toEqual(sites.slice(0, PINNED_SITES_LIMIT));
});

test("normalizes addresses and names sites by hostname", () => {
  expect(siteUrl("HTTPS://Example.COM")).toBe("https://example.com/");
  expect(siteUrl("http://192.168.1.1:8080/admin")).toBe("http://192.168.1.1:8080/admin");
  expect(siteUrl("chrome://settings")).toBe("");
  expect(siteUrl(undefined)).toBe("");

  expect(siteHost("https://www.github.com/login")).toBe("github.com");
  expect(siteHost("http://localhost:3000/")).toBe("localhost");
  expect(siteHost("https://wwwexample.com/")).toBe("wwwexample.com");
});

test("letter tiles use the title's first letter in upper case", () => {
  expect(siteLetter("github.com")).toBe("G");
  expect(siteLetter("  école")).toBe("É");
  expect(siteLetter("日本")).toBe("日");
  expect(siteLetter("😀 Fun")).toBe("😀");
});

test("letter tile colors come from the palette and follow the hostname", () => {
  const tone = siteTone("https://github.com/");

  expect(pastels).toContain(tone);
  expect(siteTone("https://www.github.com/login")).toBe(tone);
  expect(siteTone("http://github.com/other")).toBe(tone);

  const hosts = Array.from({ length: 60 }, (_, index) => `https://site${index}.example/`);
  const used = new Set(hosts.map((url) => siteTone(url).name));

  expect(used.size).toBeGreaterThan(pastels.length / 2);
});

test("every pastel has light and dark tones", () => {
  expect(pastels).toHaveLength(12);

  for (const tone of pastels) {
    for (const key of ["light", "lightText", "dark", "darkText"]) {
      expect(tone[key]).toMatch(/^#[\da-f]{6}$/);
    }
  }
});

test("translations name the site a control acts on", () => {
  const button = { dataset: { site: "GitHub" }, attributes: {} };
  button.getAttribute = (name) =>
    name === "data-i18n-label" ? "removeSite" : button.attributes[name];
  button.setAttribute = (name, value) => {
    button.attributes[name] = value;
  };

  const root = {
    querySelectorAll: (selector) => (selector === "[data-i18n-label]" ? [button] : []),
  };

  translate(root, () => "{site} entfernen");

  expect(button.attributes["aria-label"]).toBe("GitHub entfernen");
});
