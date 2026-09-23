import { cp, mkdir, rm } from "node:fs/promises";
import { languages } from "../src/i18n/languages.js";
import { compactCatalog } from "../src/lib/bangs.js";

export const root = new URL("../", import.meta.url).pathname;

export async function build() {
  const english = await Bun.file(`${root}src/i18n/locales/en.json`).json();
  const keys = Object.keys(english).sort().join();
  const catalogs = [];

  for (const language of Object.keys(languages)) {
    const messages = await Bun.file(`${root}src/i18n/locales/${language}.json`).json();
    const hasMatchingKeys = Object.keys(messages).sort().join() === keys;
    const hasInvalidMessages = Object.values(messages).some(
      (value) => typeof value !== "string" || !value.trim(),
    );

    if (!hasMatchingKeys || hasInvalidMessages) {
      throw new Error(`Incomplete translation: ${language}`);
    }

    catalogs.push([language, messages]);
  }

  await rm(`${root}dist`, { recursive: true, force: true });
  await mkdir(`${root}dist/locales`, { recursive: true });
  await mkdir(`${root}dist/data`, { recursive: true });

  // Bun's CSS bundler lowers light-dark() into variables that need color-scheme in the same
  // file, while index.html sets the scheme. The stylesheet has no imports, so copy it as is.
  for (const name of ["index.html", "style.css", "assets"]) {
    await cp(`${root}src/${name}`, `${root}dist/${name}`, { recursive: true });
  }

  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md", "PRIVACY.md", "licenses"]) {
    await cp(`${root}${name}`, `${root}dist/${name}`, { recursive: true });
  }

  // package.json is the single source of the release version.
  const { version } = await Bun.file(`${root}package.json`).json();
  const manifest = await Bun.file(`${root}src/manifest.json`).json();
  await Bun.write(
    `${root}dist/manifest.json`,
    `${JSON.stringify({ ...manifest, version }, null, 2)}\n`,
  );

  // Keep authored images in src/assets; embed only the tab icons in the page head.
  let html = await Bun.file(`${root}src/index.html`).text();

  for (const [name, type] of [
    ["favicon-light.png", "image/png"],
    ["favicon-dark.svg", "image/svg+xml"],
  ]) {
    const image = await Bun.file(`${root}src/assets/${name}`).arrayBuffer();
    const data = Buffer.from(image).toString("base64");

    const reference = `href="assets/${name}"`;

    if (!html.includes(reference)) {
      throw new Error(`index.html no longer references assets/${name}`);
    }

    html = html.replace(reference, `href="data:${type};base64,${data}"`);
  }

  await Bun.write(`${root}dist/index.html`, html);

  for (const [language, messages] of catalogs) {
    await Bun.write(`${root}dist/locales/${language}.json`, JSON.stringify(messages));
  }

  // JSON.parse on fetched data is faster than evaluating a megabyte-sized object literal.
  const bangs = await Bun.file(`${root}src/data/bangs.json`).json();
  await Bun.write(`${root}dist/data/bangs.json`, JSON.stringify(compactCatalog(bangs)));

  const startup = await bundle({
    entrypoints: [`${root}src/theme.js`],
    target: "browser",
    format: "iife",
    minify: true,
    define: {
      __TAB_TITLES__: JSON.stringify(
        Object.fromEntries(catalogs.map(([language, messages]) => [language, messages.newTab])),
      ),
    },
  });

  await Bun.write(`${root}dist/theme.js`, startup.outputs[0]);

  await bundle({
    entrypoints: [`${root}src/app.js`],
    outdir: `${root}dist/assets`,
    target: "browser",
    format: "esm",
    splitting: true,
    minify: true,
    modulePreload: false,
    // Entry names are referenced from index.html; chunk hashes keep split names unique.
    naming: { entry: "[name].[ext]", chunk: "[name]-[hash].[ext]" },
  });
}

async function bundle(options) {
  const result = await Bun.build(options);

  if (!result.success) {
    throw new AggregateError(result.logs, "Build failed");
  }

  return result;
}

if (import.meta.main) {
  await build();
}
