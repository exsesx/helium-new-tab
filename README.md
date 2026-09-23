# Helium New Tab

A minimal, unofficial new-tab extension inspired by [Helium's brand kit](https://helium.computer/brand) and [Prism](https://prism.helium.computer/). Plain HTML, CSS, and JavaScript, built with Bun. No runtime dependencies.

## Install in Helium

Requires Helium or another Chromium browser, version 117 or later.

Download the ZIP from [Releases](https://github.com/exsesx/helium-new-tab/releases/latest),
extract it, and load the extracted folder through **Load unpacked**. No Bun installation
is needed for a release ZIP.

To build from source:

1. Run `bun install --frozen-lockfile` and `bun run build`.
2. Open `chrome://extensions` in Helium.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the `dist` folder in this project.
5. Open a new tab. If Helium asks, keep the new-tab change.

Disable or remove Helium New Tab on the extensions page to restore your previous new tab. After changing source files, reload the extension there and open a fresh tab.

## Features

- Automatic light and dark appearance, with manual overrides and a Blended or Helium dark background.
- Optional clock and date, with 12-hour or 24-hour time and optional seconds.
- 37 interface languages, with localized dates and times.
- Custom installed fonts for the interface, clock, date, and search field.
- Search through the browser's default provider or navigate directly to a website.
  Bare names open only with a known top-level domain, so `example.com` opens a site while
  `next.js` searches. Local names such as `localhost:3000`, `printer.local`, and IP
  addresses open over HTTP. Press `/` to focus search while the page has focus.
- Keyboard-accessible settings that adapt to small windows and respect reduced motion.
- Preferences saved in the extension's browser profile and synced across devices when the
  browser syncs extension data. Service icons stay a per-device choice.
- No analytics, remote fonts, or external network requests.
  Required permissions are `search` and `storage`, neither of which shows an install warning.
  Service icons ask for the optional `favicon` permission when you turn them on.

The favicon follows the browser's light or dark appearance. The page appearance can
be overridden separately. Custom browser theme palettes are not detected automatically.

The search field resolves bangs locally using [Helium's bang catalog](https://services.helium.imput.net/bangs.json),
with a bundled snapshot that works offline.
For example, `!yt quiet music`, `quiet !yt music`, and `quiet music !yt` open YouTube directly.
Aliases are case-insensitive. The catalog's format flags control query encoding and whether
a bare bang opens the site's home page or its search URL. Bangs that require a hostname,
such as `!rtfd`, fall back to ordinary search when no valid name is supplied.
The first bang token is used; an unknown bang stays in the query sent to your default provider.
A recognized bang shows the service's name before the query, like Helium's address bar keyword mode.
Website addresses still open directly.

The bundled catalog loads only when the input contains a bang. The extension does not download
or cache catalog updates. A weekly workflow opens a pull request with catalog updates;
see [release instructions](docs/releasing.md). Service-worker updates are planned for
[version 1.3](ROADMAP.md).
Turn on **Customize → Show service icons** to replace the search icon with the destination's
favicon while you type a recognized bang. Icons come from the browser's own favicon cache
through the optional `favicon` permission, which the browser asks you to grant when you turn
the setting on. Nothing is downloaded, and sites you have never visited keep the search icon.
Removing the permission on the extensions page turns the setting off again.
The image has rounded corners and fades in and out; reduced-motion settings disable the fade.
Unknown bangs keep the search icon. The localhost preview cannot show service icons.
Custom address-bar shortcuts are not included.
The localhost preview supports the same local bangs and uses DuckDuckGo for ordinary searches.

## Development

Use Bun 1.4.2 and Node 26 for development tooling. Run `bun install --frozen-lockfile`, then `bun run dev` and open http://127.0.0.1:4173. Installation also sets up the Husky pre-commit and pre-push hooks automatically. The dev command builds the extension and watches all of `src/` with one serialized rebuild pipeline. Refresh the preview after edits. Restart the dev command after editing build scripts.

```text
src/                       # Everything that ships: edit here
  index.html               # New-tab page shell
  manifest.json            # Extension metadata and permissions
  app.js                   # Search, clock, preferences, language switching
  bootstrap.js             # Synchronous title, appearance and font startup
  style.css                # Page and settings styles
  assets/                  # Tab favicons, extension SVG and raster icon sizes
  lib/                     # Preferences, font, search and date/time logic
  settings/                # Lazy drawer markup and event handlers
  i18n/                    # Language matching and translation loader
    locales/               # Editable JSON dictionaries
scripts/                   # Bun build and preview/watch server
tests/                     # Unit and build tests
e2e/                       # Playwright tests against the preview
dist/                      # Entirely generated; do not edit
```

`bun run build` deletes and regenerates `dist/`. Its assets directory contains copied images plus compiled JavaScript. It is ignored by Git, linting, and formatting. Only the generated `dist/` directory is needed for installation; rebuild it after a fresh checkout.

The extension icon source is `src/assets/extension-icon.svg`. Its PNG sizes are checked in so normal builds need no image tools. After editing the SVG, regenerate them with [librsvg](https://gitlab.gnome.org/GNOME/librsvg)'s `rsvg-convert`:

```sh
for size in 16 32 48 96 128 256; do
  rsvg-convert -w "$size" -h "$size" \
    -o "src/assets/extension-icon-$size.png" src/assets/extension-icon.svg
done
```

- `bun run build`: validate translation coverage, then compile/copy all sources.
- `bun run dev`: build, serve, and watch all sources.
- `bun run lint` / `bun run lint:fix`: check JavaScript with Oxlint or apply safe fixes.
- `bun run format` / `bun run format:check`: format source with Oxfmt or check it.
- `bun test`: check routing, preferences, date/time, language resolution, translation coverage, loading failures, and language-switch races.
- `bun run check`: lint, formatting, tests, and production build.
- `bun run test:e2e`: drive the preview in Chromium with Playwright: theme painting,
  settings persistence, language switching, keyboard focus, and search destinations.
  Run `bun x playwright install chromium` once first, or point
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at an installed Chromium.

### Manual checks in Helium

Run `bun run check`, reload the unpacked `dist/` extension, and open a fresh tab.
The localhost preview uses DuckDuckGo and cannot verify native browser integration.

- Confirm the extension opens as the new-tab page and the address bar keeps initial focus.
- Submit a sample query through the page and confirm it uses the browser's default search
  provider. Check direct navigation with `https://example.com`.
- Check the tab title and favicon in light and dark browser appearance, including on a fresh tab.
- Change appearance, language, clock, and font preferences; open another new tab and confirm
  they persist without a flash of the default settings.
- Check `/` search focus, Escape dismissal, keyboard navigation in Customize, and the
  settings layout in narrow and short windows.

## Languages

**Customize → Language** defaults to **Automatic**, which follows your supported browser
languages and falls back to English. A manual choice updates the interface, tab title,
and date and time formatting, and is saved on this device.

Available languages: Albanian, Bosnian, Bulgarian, Catalan, Croatian, Czech, Danish,
Dutch, English, Estonian, Finnish, French, German, Greek, Hungarian, Icelandic, Irish,
Italian, Japanese, Korean, Latvian, Lithuanian, Macedonian, Maltese, Norwegian Bokmål,
Polish, Portuguese, Romanian, Serbian (Latin), Simplified Chinese, Slovak, Slovenian,
Spanish, Swedish, Traditional Chinese, Turkish, and Ukrainian.

**Russian is intentionally excluded and must not be added.**

Translations have not received native-speaker review. Date and time formatting depends
on the browser's built-in locale support and may fall back to another locale.

## Releases and contributing

Use Conventional Commits. The local pre-commit hook lints and formats staged files, and the
pre-push hook runs lint, formatting, tests, and the build. GitHub Actions repeats these checks on pull requests and `main` pushes.
Version tags create release ZIPs with checksums. Chrome Web Store upload and optional
review submission use a separate manual workflow after account setup.
See [release instructions](docs/releasing.md).

## License and privacy

Original code is [MIT licensed](LICENSE), Copyright 2026 Oleh Vanin.
Reused Helium artwork retains GPL-3.0; see [third-party notices](THIRD_PARTY_NOTICES.md).
This is an unofficial project, not affiliated with or endorsed by Helium or imput.

See the [privacy policy](PRIVACY.md). No analytics or backend is used.
