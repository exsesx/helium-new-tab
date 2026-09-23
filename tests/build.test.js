import { beforeAll, expect, test } from "bun:test";
import { build, root } from "../scripts/build.js";

const dist = (path) => Bun.file(`${root}dist/${path}`);

beforeAll(async () => {
  await build();
}, 30_000);

test("embeds both tab favicons in the page", async () => {
  const html = await dist("index.html").text();

  expect(html).toContain('href="data:image/png;base64,');
  expect(html).toContain('href="data:image/svg+xml;base64,');
  expect(html).not.toContain('href="assets/favicon-');
});

test("writes the package version into the packaged manifest", async () => {
  const { version } = await Bun.file(`${root}package.json`).json();
  const manifest = await dist("manifest.json").json();

  expect(manifest.version).toBe(version);
  expect(manifest.manifest_version).toBe(3);
});

test("packages the compact bang catalog next to the page scripts", async () => {
  const catalog = await dist("data/bangs.json").json();
  const app = await dist("assets/app.js").text();

  expect(catalog.length).toBeGreaterThan(1000);
  expect(catalog.every(({ s }) => typeof s === "string" && s.trim() !== "")).toBe(true);
  expect(catalog.every((entry) => !Object.hasOwn(entry, "sc"))).toBe(true);
  expect(app).toContain("../data/bangs.json");
});

test("ships no remote service URLs in page scripts", async () => {
  const scripts = [...new Bun.Glob("**/*.js").scanSync({ cwd: `${root}dist` })];

  expect(scripts).toContain("bootstrap.js");

  for (const path of scripts) {
    const code = await dist(path).text();

    expect(code).not.toContain("google.com/s2/favicons");
  }
});
