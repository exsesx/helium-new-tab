import { cp, mkdir, rm } from "node:fs/promises";
import { languages } from "../src/i18n/languages.js";

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

  for (const name of ["index.html", "manifest.json", "assets"]) {
    await cp(`${root}src/${name}`, `${root}dist/${name}`, { recursive: true });
  }

  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md", "PRIVACY.md", "licenses"]) {
    await cp(`${root}${name}`, `${root}dist/${name}`, { recursive: true });
  }

  // Keep authored images in src/assets; embed only the tab icons in the page head.
  let html = await Bun.file(`${root}src/index.html`).text();

  for (const [name, type] of [
    ["favicon-light.png", "image/png"],
    ["favicon-dark.svg", "image/svg+xml"],
  ]) {
    const image = await Bun.file(`${root}src/assets/${name}`).arrayBuffer();
    const data = Buffer.from(image).toString("base64");

    html = html.replace(`href="assets/${name}"`, `href="data:${type};base64,${data}"`);
  }

  await Bun.write(`${root}dist/index.html`, html);

  for (const [language, messages] of catalogs) {
    await Bun.write(`${root}dist/locales/${language}.json`, JSON.stringify(messages));
  }

  const startup = await Bun.build({
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

  if (!startup.success) {
    throw new AggregateError(startup.logs, "Startup build failed");
  }

  await Bun.write(`${root}dist/theme.js`, startup.outputs[0]);

  for (const args of [
    [
      "bun",
      "build",
      "src/app.js",
      "--outdir",
      "dist/assets",
      "--target",
      "browser",
      "--format",
      "esm",
      "--splitting",
      "--chunk-naming",
      "[name].[ext]",
      "--minify",
      "--no-module-preload",
    ],
    ["bun", "build", "src/style.css", "--outdir", "dist", "--minify"],
  ]) {
    const task = Bun.spawn(args, {
      cwd: root,
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env, NO_COLOR: "1" },
    });

    if ((await task.exited) !== 0) {
      throw new Error(`Build failed: ${args[0]}`);
    }
  }
}

if (import.meta.main) {
  await build();
}
