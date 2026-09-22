import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CATALOG_URL = "https://services.helium.imput.net/bangs.json";

function checksum(entries) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(entries)).digest("hex");
}

export async function refreshBangs({ request = fetch, root = ROOT, check = false } = {}) {
  const response = await request(CATALOG_URL, { signal: AbortSignal.timeout(30_000) });
  assert(response.ok, `Bang catalog download failed: HTTP ${response.status}`);

  const source = (await response.text()).replaceAll("\r\n", "\n");
  const entries = Bun.JSON5.parse(source);
  assert(Array.isArray(entries) && entries.length > 0, "Expected a nonempty bang catalog");

  const generatedAt = /^\/\/ Generated at (\S+)$/m.exec(source)?.[1];
  assert(generatedAt && Number.isFinite(Date.parse(generatedAt)), "Missing generation timestamp");

  const license = source
    .match(/^\/\/ MIT License\n(?:\/\/[^\n]*\n)*/m)?.[0]
    .replace(/^\/\/ ?/gm, "")
    .trim();
  const savedLicense = await Bun.file(join(root, "licenses/bangs-MIT.txt")).text();
  assert.equal(
    license,
    savedLicense.trim(),
    "Upstream license changed; review licenses/bangs-MIT.txt",
  );

  const catalogPath = join(root, "src/data/bangs.json");
  const current = await Bun.file(catalogPath).json();
  const latestChecksum = checksum(entries);

  if (latestChecksum === checksum(current)) {
    console.log(`Bang catalog unchanged (${entries.length} entries; SHA-256 ${latestChecksum}).`);

    return false;
  }

  assert(
    !check,
    "Bang catalog is outdated. Run bun run bangs:refresh, review and commit the changes, then publish that commit or a new release tag.",
  );

  const noticesPath = join(root, "THIRD_PARTY_NOTICES.md");
  const notices = await Bun.file(noticesPath).text();
  const snapshot = /^downloaded on .+\. Its generation timestamp is `[^`]+`\.$/m;
  assert(snapshot.test(notices), "Missing bang snapshot metadata in THIRD_PARTY_NOTICES.md");

  const downloadedOn = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date());
  const updatedNotices = notices.replace(
    snapshot,
    `downloaded on ${downloadedOn}. Its generation timestamp is \`${generatedAt}\`.`,
  );

  const formatter = Bun.spawn(
    [process.execPath, "run", "oxfmt", "--stdin-filepath", "src/data/bangs.json"],
    {
      cwd: ROOT,
      stdin: new Blob([JSON.stringify(entries)]),
      stdout: "pipe",
      stderr: "inherit",
    },
  );
  const formatted = await new Response(formatter.stdout).text();
  assert.equal(await formatter.exited, 0, "Catalog formatting failed");

  await Bun.write(catalogPath, formatted);
  await Bun.write(noticesPath, updatedNotices);
  console.log(
    `Refreshed ${entries.length} bangs from ${generatedAt}. Run bun run check before tagging.`,
  );

  return true;
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { check: { type: "boolean", default: false } },
  });

  await refreshBangs({ check: values.check });
}
