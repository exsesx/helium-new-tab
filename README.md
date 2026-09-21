# Helium New Tab

A minimal, unofficial new-tab extension inspired by [Helium's brand kit](https://helium.computer/brand) and [Prism](https://prism.helium.computer/). Plain HTML, CSS, and JavaScript, built with Bun. No runtime dependencies.

## Install in Helium

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

- Follows the device's light/dark appearance, with manual overrides in Customize. Background offers Blended (`#1E2020` in dark mode, matching solid browser chrome with native frame materials disabled) or Helium (`#3B3C3C` in dark mode). Both use white in light mode. Saved backgrounds apply before the first paint and follow device appearance changes. Existing background preferences are preserved.
- Larger Helium logo and search positioned around a quarter of the way down the page, with an optional clock and date below. Short windows use tighter spacing.
- Native settings dialog styled as an animated side drawer on desktop and a bottom sheet on mobile. Markup and event handlers load only on the first Customize click and are reused afterward. Supports Escape, backdrop dismissal, focus management, and reduced motion. No React or component-library runtime.
- Saved fonts and appearance apply before the first paint. Clock space stays reserved until the actual time is ready; no loading fade or placeholder.
- Date and time use the selected language and the browser’s default time zone through cached `Intl.DateTimeFormat` instances. Automatic follows the first supported entry in `navigator.languages`, preserving its region (for example, US versus UK hour cycles). Time format offers Automatic (the default for new settings), 12-hour, and 24-hour, plus optional seconds. Existing 12/24-hour choices are preserved. Locale-specific ordering, digits, spacing, and AM/PM placement are retained; formatters refresh on browser language changes. The clock stops scheduling updates while the tab is hidden.
- Global UI and Mono fonts, each with System or Custom. UI controls ordinary text; Mono controls the clock. Optional Clock, Date, and Search overrides can inherit the default, choose either global font, or use a custom installed family. Existing custom preferences are migrated. No fonts are downloaded.
- Search using the browser's default search provider, or navigate directly to a website. Press `/` to focus search while the page has focus. The address bar retains its normal new-tab focus.
- Preferences stay in local storage for this extension and browser profile.
- No analytics, remote fonts, favicons, background service, or remote network requests on page load. The only extension permission is `search`.

The localhost preview uses DuckDuckGo because the browser search API is available only to an installed extension. Native Helium bangs remain available in the address bar; this page does not implement its own bang resolver.

## Development

Use Bun 1.4.1. Run `bun install --frozen-lockfile` and `bun run hooks:install`, then `bun run dev` and open http://127.0.0.1:4173. This builds the extension and watches all of `src/` with one serialized rebuild pipeline. Refresh the preview after edits. Restart the dev command after editing build scripts.

```text
src/                       # Everything that ships: edit here
  index.html               # New-tab page shell
  manifest.json            # Extension metadata and permissions
  app.js                   # Search, clock, preferences, language switching
  theme.js                 # Synchronous appearance/font bootstrap
  style.css                # Page and settings styles
  assets/                  # Tab favicons, extension SVG and raster icon sizes
  lib/                     # Preferences, font, search and date/time logic
  settings/                # Lazy drawer markup and event handlers
  i18n/                    # Language matching and translation loader
    locales/               # Editable JSON dictionaries
scripts/                   # Bun build and preview/watch server
tests/                     # Unit tests
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

Bun minifies and tree-shakes the app into ESM, with settings imported only on demand. The synchronous `theme.js` applies the translated tab title, saved appearance, background, and fonts before CSS loads. The build extracts only the 37 short tab titles from the catalogs into this bundle, so the title does not wait for the application or translation request. The main logo is inline SVG and follows the text color, eliminating separate light/dark image requests. Bun minifies the plain CSS stylesheet. There are no runtime dependencies.

- `bun run build`: validate translation coverage, then compile/copy all sources.
- `bun run dev`: build, serve, and watch all sources.
- `bun run lint` / `bun run lint:fix`: check JavaScript with Oxlint or apply safe fixes.
- `bun run format` / `bun run format:check`: format source with Oxfmt or check it.
- `bun test`: check routing, preferences, date/time, language resolution, translation coverage, loading failures, and language-switch races.
- `bun run check`: lint, formatting, tests, and production build.

## Languages

**Customize → Language** defaults to **Automatic**. It selects the first supported browser language, with English as fallback. A manual choice is saved on this device and changes interface text, tab title, accessibility labels, and date/time locale. Appearance, background, and time-format overrides remain independent.

37 translations are included: Bulgarian, Catalan, Croatian, Czech, Danish, Dutch, English, Estonian, Finnish, French, German, Greek, Hungarian, Irish, Italian, Latvian, Lithuanian, Maltese, Polish, Portuguese, Romanian, Slovak, Slovenian, Spanish, Swedish, Albanian, Bosnian, Icelandic, Macedonian, Norwegian Bokmål, Serbian (Latin), Turkish, Ukrainian, Simplified Chinese, Traditional Chinese, Japanese, and Korean.

Regional browser preferences match the corresponding translation (`es-MX` → Spanish); Chinese script/region distinguishes Simplified and Traditional. Norwegian variants use Bokmål. **Russian is intentionally excluded and must not be added.** Unsupported browser languages are skipped when selecting Automatic; if none match, English is used.

English is bundled as the fallback. Only the selected non-English JSON dictionary is fetched locally, and successful loads are cached for that tab. Other languages do not add to startup downloads. Failed loads fall back to English and can be retried. All dictionaries have matching keys and interpolation placeholders checked by tests. Translations have not received native-speaker review.

Date names and number conventions depend on the browser’s built-in `Intl` locale data. A translated interface can still use fallback date formatting if the browser lacks that locale (observed for Irish in the preview). No date polyfill or external translation service is loaded.

Uses the supplied Helium browser-chrome backgrounds, `#FFFFFF` in light mode and `#1E2020` in dark mode, with `#353737` dark inputs. The search field follows the supplied omnibox reference: flat `#EBEBEB` / `#353737` idle fills, white / `#3B3C3C` focused fills, 16 px corners scaled for our 54 px field from Helium’s 8 px corners on its 28 px omnibox, and a 2 px focus border (`#4157D2` / `#7A95F8`), without a shadow. Text, surfaces, and dividers are neutral; accent color is reserved for active controls and keyboard focus. The main logo uses the SVG shape from [Helium's brand kit](https://helium.computer/brand), recolored to match the neutral text (`#292B2B` in light mode and `#E3E5E5` in dark mode); the monochrome tab icon comes from [Helium’s native New Tab favicon](https://github.com/imputnet/helium/blob/main/resources/favicons/favicon_ntp_32.png). Its light variant is the original PNG; the dark SVG applies a light neutral tint to the same embedded alpha mask. The favicon follows the browser’s `prefers-color-scheme`, independently of the page appearance override. The tab title is the localized equivalent of New Tab. The manifest uses separate extension icons rendered from Helium's vector product logo at 16, 32, 48, 96, 128, and 256 pixels, including Retina sizes. These do not load on the new-tab page. The build embeds both tab favicon variants as data URLs near the start of the HTML, before scripts and styles. Native media queries select the browser color scheme without JavaScript or a separate favicon file request. The browser still controls when its tab strip replaces the initial placeholder; embedding removes our loading dependency but does not guarantee the first tab-strip frame. Reload the extension after manifest changes; first-frame favicon behavior must be verified in Helium. No Prism code is bundled. This project is not affiliated with or endorsed by Helium or imput.

Browser theme palettes are not exposed through Chromium's public extension API; matching the selected Customize Helium palette automatically is not supported here. Automatic light/dark detection remains available through `prefers-color-scheme`. See the [Chrome Extensions team’s explanation](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/c5FgEIf3MBI).

## Releases and contributing

Use Conventional Commits. The local pre-commit hook runs lint, formatting, tests, and
the build. GitHub Actions repeats these checks on pull requests and `main` pushes.
Version tags create release ZIPs with checksums. Chrome Web Store upload and optional
review submission use a separate manual workflow after account setup.
See [release instructions](docs/releasing.md).

## License and privacy

Original code is [MIT licensed](LICENSE), Copyright 2026 Oleh Vanin.
Reused Helium artwork retains GPL-3.0; see [third-party notices](THIRD_PARTY_NOTICES.md).
This is an unofficial project, not affiliated with or endorsed by Helium or imput.

See the [privacy policy](PRIVACY.md). No analytics or backend is used.
