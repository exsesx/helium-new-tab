# Verification

Historical checks from development on 21 September 2026. Earlier sections describe earlier revisions; test counts, assets, colors, and tooling changed during development. The current production check is `bun run check`.

- `bun run check`: Oxlint, Oxfmt, four tests with 25 assertions, and the Tailwind build passed.
- Browser preview: official light/dark logos load; no console errors or warnings.
- Clock seconds advance, and seconds/font preferences persist after reload. Clock and date font families were checked against the selected options.
- Narrow 280 × 568 and short 568 × 320 layouts have no horizontal overflow. The settings dialog fits the short viewport and scrolls internally.
- `/` focuses search. Temporary viewport and appearance overrides were reset.
- The earlier automatic appearance, clock visibility, URL validation, and CSS-watcher checks passed before this redesign.

The extension has not been installed in Helium during this session. Its new-tab override, tab-strip favicon rendering, and native `chrome.search` integration require an installed-extension check. The localhost preview uses DuckDuckGo instead.

## Custom local fonts

- `bun run check` passed with five tests and 33 assertions, including literal CSS font-name escaping and saved custom preferences.
- Browser: custom clock, date, and interface names applied and persisted after reload. Clearing a name with the keyboard restored the System fallback.
- At 320 × 568, settings scroll with all three custom inputs enabled. No browser warnings or errors were recorded. Test font selections and viewport overrides were reset.

## Global fonts and drawer

- Seven tests, 45 assertions pass, including global inheritance, component overrides, and migration of earlier custom preferences. Oxlint, Oxfmt, and Tailwind build pass.
- Preview content top measured at 245.25 px in a 981 px viewport, exactly 25%.
- 320 × 568 mobile sheet fits the viewport with internal scrolling and no horizontal overflow. 568 × 320 dark layout inspected. Escape dismissal and font persistence checked; no console errors or warnings.
- Extension payload is 29,620 bytes across all files at this revision. This is file size, not a measured startup latency. No runtime dependencies were added.
- Manifest now declares the bundled Helium PNG for extension icons. The initial favicon frame still requires a Helium extension reload and live verification; localhost cannot test that browser behavior.

## Startup appearance

- The synchronous startup bundle is 2.64 KB and shares font resolution with the application.
- With `app.js` blocked in the browser, the saved MonoLisaText family was already applied, clock text was empty and hidden, and focus remained on BODY. After unblocking and reloading, the same font remained, the current time was visible, and focus was still on BODY. Blocking was removed after the check.
- No fade or artificial loading delay was added. Date/time formatters are reused between clock ticks.

## Lazy settings, Bun bundles, and neutral palette

- `bun run check` passes: Oxlint, Oxfmt, seven tests / 45 assertions, and all Bun/Tailwind builds. Sources now live under `src/`; the installed folder contains generated JavaScript.
- Initial HTML + CSS + JavaScript: 19,480 bytes, down from 29,912 bytes (35%). This is uncompressed file size, excluding unchanged logos/favicon. The settings chunk is 6,147 bytes and loads on demand.
- Browser resource entries contain no settings request on a fresh load, and the settings dialog is absent from the DOM. Clicking Customize downloads the chunk and creates the drawer. Closing/reopening reuses it; Escape restores focus to Customize.
- Dark computed colors are exactly `rgb(30, 32, 32)` for the background and `rgb(53, 55, 55)` for search. The dialog has no focus outline; controls retain keyboard focus indicators. Close uses a centered SVG independent of the selected font.
- At 320 × 568, the dialog is 296 px wide, inset 12 px, with internal scrolling and no horizontal page overflow. Light and dark modes were visually inspected.
- Global font editing persists after reload; the original font and appearance were restored. Initial focus stays on BODY; `/` focuses search and Escape blurs it.
- With the application bundle blocked, the saved font still applies and the empty clock remains hidden. With the settings bundle blocked, an accessible status message requests a reload. All network blocking was removed and the drawer successfully reopened after reload.
- One localhost reload measured first contentful paint at 72 ms and DOMContentLoaded at 25.6 ms. These are local preview observations, not an installed-Helium benchmark or a measured before/after speedup.

## Native favicon and extension name

- Extension name is `Helium New Tab`; description: “A lightweight New Tab page for Helium with search, a clock, and local customization.” The page title remains `New Tab`.
- Replaced the blue favicon and manifest fallback with Helium’s original transparent 32 px monochrome NTP icon. Dark-mode favicon uses the same embedded mask tinted `#C7C7C7` in a self-contained SVG.
- Verified the favicon URL switches between light PNG and dark SVG when browser color-scheme emulation changes, without reloading. The SVG was rendered and visually checked. Emulation was cleared afterward.
- Preview image CSP permits embedded data images used inside the SVG; extension permissions are unchanged. Actual Helium tab-strip rendering and its static manifest fallback still require an extension reload.
- `bun run check` passes: seven tests, 45 assertions, lint, formatting, and builds.

## Locale-aware date and time

- `bun run check`: 12 tests / 69 assertions, lint, formatting, and build pass. Tests cover new Automatic defaults, migration of both legacy hour24 values, explicit overrides, US/UK automatic hour cycles, midnight, seconds, Polish date names, date component order, and Chinese prefixed day periods.
- Browser preview migrated the existing saved choice to 24-hour. Automatic persisted after reload; the preview’s reported `en-US` language produced `Monday, September 21` and a 12-hour clock with PM. Existing 24-hour preference was restored after verification.
- Both date and time now share the browser’s preferred language list, with the browser’s default time zone. Cached formatters are rebuilt when the browser sends `languagechange`. No runtime dependencies were added.

## Source layout and localization

- All authored extension files now live in `src/`, including HTML, manifest, images, logic, styles, settings markup, and translation dictionaries. `scripts/build.js` removes and regenerates the entire `dist/` folder; the output is excluded from lint, formatting, and Git. `scripts/dev.js` watches all sources with one serialized build pipeline.
- 37 complete interface dictionaries ship, with Russian intentionally excluded. Automatic chooses the first supported browser language and preserves its region for date/time; manual overrides are saved. Tests cover regional and Chinese script matching, invalid/unsupported preferences, dictionary keys/substitutions, cached loads, failure/retry, and stale language requests.
- `bun run check` passes with 17 tests and 4,904 assertions, plus Oxlint, Oxfmt, Bun, and Tailwind builds. The assertion count includes every key and placeholder across all dictionaries; it does not imply native-speaker translation review.
- Browser: initial English page loads no translation file or settings chunk. Reloading a saved Polish choice loads only `locales/pl.json`, with no drawer request. Its title, placeholder, accessibility labels, settings, and date remain Polish after reload.
- Checked Polish, Ukrainian, Spanish, Italian, Traditional Chinese, Japanese, Korean, and Irish interface switching. At 320 × 568, long labels wrap, selects stay inside the panel, and the page/drawer have no horizontal overflow. Korean dark-mode and Spanish footer layouts were visually inspected.
- Blocking the Italian catalog produces the English fallback and an accessible error message. Removing the block and selecting Italian again loads it successfully. Network blocking, viewport override, and temporary dark appearance were cleared; language is back to Automatic.
- Browser `Intl.DateTimeFormat.supportedLocalesOf(["ga"])` returned an empty list in the preview: Irish UI text is available, but dates fall back to the browser locale. Date-language coverage depends on the browser's built-in Intl data; no polyfill was added.
- Installed-Helium extension behavior still requires reloading the extension. These checks exercise the generated output in the localhost preview.

- Watcher verification: changing source markup triggers one rebuild; restoring it triggers one more. Duplicate notifications and unchanged content do not rebuild. The completed output contains 47 files (37 dictionaries), and all manifest/page asset references resolve. `/` and Escape retain their search-focus behavior after the final build.

## Favicon startup

- Build embeds the existing light PNG and dark SVG as data URLs in the HTML head, before scripts/styles. Source assets remain editable under `src/assets/`; manifest icons still reference the PNG file.
- Native `prefers-color-scheme` media attributes select the favicon. Removed the startup-script favicon replacement and its theme-change listener. Selection follows browser appearance independently of the page override.
- Preview showed no favicon file requests. With both startup scripts and favicon file URLs blocked, the icon declarations remained available and their media matches switched correctly between dark and light.
- Decoded both embedded images at 32 × 32. Center pixels were `[60,64,67,255]` for light and `[199,199,199,255]` for dark, preserving the existing artwork and tint. Blocking/cache/theme overrides were cleared afterward.
- `bun run check` passed: lint, formatting, 17 tests, and production build. This verifies removal of the resource/script dependency, not zero globe frames in Helium's native tab strip. That requires reloading the installed extension and opening a fresh tab.

## Early tab titles and background options

- The build extracts all 37 translated tab titles into the synchronous startup bundle. No full translation catalogs are added to that bundle. Executing the generated bundle verified all 37 titles and saved background preferences.
- Browser: with the application bundle and translation requests blocked, a saved Ukrainian preference already produced `Нова вкладка`, the saved Helium dark background was `rgb(59, 60, 60)`, the clock stayed empty/hidden, and focus remained on BODY.
- Blended remains the default, including for existing preferences. Computed light/dark backgrounds were `#F3F3F3` / `#1E2020` for Blended and `#FFFFFF` / `#3B3C3C` for Helium default. Manual light/dark and automatic browser appearance were checked. New labels are translated in all 37 catalogs.
- The main logo now uses its original path inline with currentColor, removing both external logo requests and duplicate theme-switching CSS. Its computed colors remained `#292B2B` and `#E3E5E5`.
- Lint, formatting, build, and 18 tests pass. The startup bundle is 4,786 bytes. This removes startup dependencies; no installed-browser latency improvement or zero-placeholder-frame guarantee is claimed.

## 1.0 release preparation

- Removed Tailwind; Bun builds and minifies plain CSS. Both background choices retain
  their appearance, and old separate settings migrate using the effective dark style.
- Browser preview checked Blended dark `#1E2020`, Helium dark `#3B3C3C`, and white
  for both light backgrounds. Drawer alignment and saved custom fonts remain intact.
- The release suite has 22 tests, including mocked Chrome Web Store v2 upload,
  asynchronous completion, upload-only defaults, and rejection before publication.
  Store credentials have not been configured and no live store upload was performed.
- Git hooks and CI run lint, formatting, tests, and the production build. Release
  packaging checks the manifest version and supplies a ZIP and SHA-256 checksum.
