import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshBangs } from "../scripts/refresh-bangs.js";

const LICENSE = await Bun.file(new URL("../licenses/bangs-MIT.txt", import.meta.url)).text();
const ENTRY = { s: "Example", ts: ["ex"], u: "https://example.com/?q={searchTerms}" };
const GENERATED_AT = "2026-09-22T08:00:00.000Z";
const NOTICES =
  "# Notices\n\ndownloaded on 21 September 2026. Its generation timestamp is `2026-09-01T08:41:24.475Z`.\n\nOther attribution.\n";
let root;

function feed(entries = [ENTRY]) {
  const header = LICENSE.trim()
    .split("\n")
    .map((line) => `// ${line}`)
    .join("\n");

  return `// Generated at ${GENERATED_AT}\n${header}\n\n[\n${entries.map((entry) => JSON.stringify(entry)).join(",\n")},\n]\n`;
}

async function snapshot() {
  return Promise.all([
    Bun.file(join(root, "src/data/bangs.json")).text(),
    Bun.file(join(root, "THIRD_PARTY_NOTICES.md")).text(),
  ]);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "helium-bangs-refresh-"));
  await mkdir(join(root, "src/data"), { recursive: true });
  await mkdir(join(root, "licenses"));
  await Bun.write(join(root, "licenses/bangs-MIT.txt"), LICENSE);
  await Bun.write(join(root, "src/data/bangs.json"), JSON.stringify([ENTRY]));
  await Bun.write(join(root, "THIRD_PARTY_NOTICES.md"), NOTICES);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("refreshes JSONC, preserves all fields, and updates only snapshot metadata", async () => {
  const entries = [{ ...ENTRY, ts: ["ex", "example"], f: 4, extra: { upstream: true } }];
  const request = async (url) => {
    expect(url).toBe("https://services.helium.imput.net/bangs.json");

    return new Response(feed(entries));
  };

  expect(await refreshBangs({ request, root })).toBe(true);

  const [catalog, notices] = await snapshot();
  expect(JSON.parse(catalog)).toEqual(entries);
  expect(catalog.endsWith("\n")).toBe(true);
  expect(notices).toContain(`Its generation timestamp is \`${GENERATED_AT}\`.`);
  expect(notices.startsWith("# Notices\n\n")).toBe(true);
  expect(notices.endsWith("\n\nOther attribution.\n")).toBe(true);
});

test("unchanged catalogs preserve file contents and download metadata", async () => {
  const before = await snapshot();

  expect(await refreshBangs({ request: async () => new Response(feed()), root })).toBe(false);

  expect(await snapshot()).toEqual(before);
});

test("checksum comparison ignores comments and formatting without writing files", async () => {
  const before = await snapshot();

  expect(await refreshBangs({ request: async () => new Response(feed()), root, check: true })).toBe(
    false,
  );

  expect(await snapshot()).toEqual(before);
});

test("a changed entry produces a checksum mismatch without replacing the catalog", async () => {
  const before = await snapshot();
  const request = async () => new Response(feed([{ ...ENTRY, ts: ["ex", "new-alias"] }]));

  await expect(refreshBangs({ request, root, check: true })).rejects.toThrow(
    "Bang catalog is outdated. Run bun run bangs:refresh",
  );

  expect(await snapshot()).toEqual(before);
});

test.each([
  ["HTTP failure", "Unavailable", 503],
  ["invalid JSON", "not JSON", 200],
  ["empty catalog", "[]", 200],
  ["non-array catalog", "{}", 200],
  ["changed license", feed().replace("Kagi Search", "Changed owner"), 200],
  ["missing timestamp", feed().replace(GENERATED_AT, "unknown"), 200],
])("%s leaves the existing snapshot untouched", async (_name, source, status) => {
  const before = await snapshot();
  const request = async () => new Response(source, { status });

  await expect(refreshBangs({ request, root })).rejects.toThrow();

  expect(await snapshot()).toEqual(before);
});
