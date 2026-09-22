import { expect, test } from "bun:test";
import { resolveSearchDestination } from "../src/lib/search.js";
import catalog from "../src/data/bangs.json";
import { resolveBang } from "../src/lib/bangs.js";

test("favicon previews use only a recognized service origin, never query terms", () => {
  const youtube = new URL(resolveBang("!yt private query").favicon);
  expect(youtube.origin).toBe("https://www.google.com");
  expect([...youtube.searchParams]).toEqual([
    ["domain_url", "https://www.youtube.com"],
    ["sz", "64"],
  ]);
  expect(resolveBang("private query !YouTube").favicon).toBe(youtube.href);
  expect(new URL(resolveBang("!gh private query").favicon).searchParams.get("domain_url")).toBe(
    "https://github.com",
  );
  expect(resolveBang("!unknown-bang-8294 query")).toBeNull();
  expect(resolveBang("plain query")).toBeNull();
  expect(resolveBang("!rtfd private-query").favicon).toBe("");
});

test("resolves YouTube bangs locally at the start, middle, or end", async () => {
  for (const input of [
    "!yt quiet music",
    "quiet !yt music",
    "quiet music !yt",
    "  !YT quiet music  ",
  ]) {
    expect(await resolveSearchDestination(input)).toMatchObject({
      url: "https://www.youtube.com/results?search_query=quiet+music",
    });
  }
});

test("uses catalog aliases and safely encodes search terms", async () => {
  const result = await resolveSearchDestination("!youtube cats & dogs #日本語 + 100%");
  const url = new URL(result.url);

  expect(url.hostname).toBe("www.youtube.com");
  expect([...url.searchParams]).toEqual([["search_query", "cats & dogs #日本語 + 100%"]]);
  expect(url.hash).toBe("");

  const wikipedia = new URL((await resolveSearchDestination("!w café / tea")).url);
  expect(wikipedia.hostname).toContain("wikipedia.org");
  expect(wikipedia.searchParams.get("search")).toBe("café / tea");
});

test("catalog format flags preserve raw paths and the required space encoding", () => {
  expect(resolveBang("!ghr imputnet/helium").url).toBe("https://github.com/imputnet/helium");
  expect(resolveBang("!ghr owner/$&").url).toBe("https://github.com/owner/$&");
  expect(resolveBang("!ia https://example.com/a?b=c").url).toBe(
    "https://web.archive.org/web/*/https://example.com/a?b=c",
  );
  expect(resolveBang("!cu css grid").url).toBe("https://caniuse.com/?search=css%20grid");
  expect(resolveBang("!sgdb half life").url).toBe(
    "https://www.steamgriddb.com/search/grids?term=half+life",
  );
});

test("bare bangs follow the catalog's home-page or search-page behavior", () => {
  expect(resolveBang("!yt").url).toBe("https://www.youtube.com/");
  expect(resolveBang("!gh").url).toBe("https://github.com/");
  expect(resolveBang("!hn").url).toBe("https://hn.algolia.com/?q=");
  expect(resolveBang("!zig").url).toBe("https://ziglang.org/documentation/master/std/#?");
});

test("unknown bangs, punctuation and ordinary searches keep the default provider", async () => {
  for (const query of [
    "!not-a-real-bang-8294 cats",
    "hello!",
    "wow!yt music",
    "!",
    "quiet music",
    "!unknown-bang-8294 !yt cats",
  ]) {
    expect(await resolveSearchDestination(query)).toEqual({ query });
  }

  expect(await resolveSearchDestination("  ")).toEqual({ query: "" });
  expect(await resolveSearchDestination("https://example.com/!yt?q=hello")).toEqual({
    url: "https://example.com/!yt?q=hello",
  });
});

test("hostname bangs navigate valid names and fall back for invalid names", async () => {
  expect(await resolveSearchDestination("!rtfd example")).toMatchObject({
    url: "https://example.rtfd.io/",
    favicon: "",
  });

  for (const query of ["!rtfd", "!rtfd two words", "!rtfd .", "!dauser", "!wpblog", "!hypestat"]) {
    expect(await resolveSearchDestination(query)).toEqual({ query });
  }
});

test("bundled entries retain valid names, aliases, formats and safe destinations", () => {
  const aliases = new Set();

  for (const { s, ts, u, f } of catalog) {
    expect(typeof s).toBe("string");
    expect(s.trim()).not.toBe("");
    expect(ts.length).toBeGreaterThan(0);
    expect(u).toContain("{searchTerms}");

    if (f !== undefined) {
      expect(Number.isInteger(f) && f >= 0 && f <= 15).toBe(true);
    }

    for (const trigger of ts) {
      expect(trigger).toMatch(/^\S+$/u);
      expect(aliases.has(trigger.toLowerCase())).toBe(false);
      aliases.add(trigger.toLowerCase());
    }

    const destination = resolveBang(`!${ts[0]} example`);

    const url = new URL(destination.url);
    expect(["https:", "http:"]).toContain(url.protocol);
    expect(url.username).toBe("");
    expect(url.password).toBe("");
  }
});
