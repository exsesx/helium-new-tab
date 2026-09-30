# Roadmap

Every feature stays local: no external network requests, no permissions with install
warnings, and no slower first paint.

## Next: Bang suggestions

- Suggest matching bangs while the user types a `!` token, for example `!yo` lists YouTube
  and other services whose aliases start with `yo`, with the alias and service name.
- Search only the bundled catalog, loaded on the first `!` as today. Rank exact alias
  matches first, then prefix matches, then shorter aliases.
- Show the cached service icon when **Show service icons** is on; otherwise show none.
- Use an accessible combobox: arrow keys move through suggestions, Enter or Tab accepts
  one, Escape closes the list, and screen readers announce the active option.
- Keep the list short and stable while typing so the layout does not jump, and respect
  reduced motion.
- Verify with unit tests for ranking and Playwright tests for keyboard and pointer use.

## Done

### Type anywhere to search

- Typing a character on the page focuses the search field and types it there, so Escape
  from the address bar and then typing works without pressing `/` first.
- Typing while a link or button has focus goes to the search field too. Text already in
  the field is kept and the new characters go after it.
- Keys held with Ctrl, Cmd, or Alt, keys that are not characters, a leading space, input
  method composition, and typing in fields or in **Customize** keep their usual behavior.
  Space still presses a focused button.
- `/` still only focuses the field, and Escape still leaves it.
- **Customize → Type anywhere to search** turns it off, leaving only `/`. The setting syncs
  with the other preferences and is on by default.

### Pinned sites

- Let people pin up to eight favorite sites as a row of shortcuts below the clock and date.
  Sites are chosen by hand, never collected from browsing history.
- **Customize → Show pinned sites** shows the row. It is off by default so the page stays
  minimal, syncs with the other preferences, and keeps the list while off.
- Add, rename, reorder, and remove sites in **Customize** with the keyboard or a pointer.
  Addresses follow the search field's rules, so `github.com` pins `https://github.com/`
  while text it would search for, and sites already pinned, are refused.
- Open them like links: Ctrl, Cmd, or a middle click opens a background tab, and Shift opens a
  new window.
- Sync the list with the other preferences as its own storage item, so it stays within
  sync's per-item size limit.
- Show icons from the browser's favicon cache when **Show service icons** is on, and a
  pastel letter tile from Helium's palette otherwise. Nothing is downloaded.
- Skip a most-visited list, because the `topSites` permission shows an install warning.
- Show no row until the switch is on and a site is pinned, and draw it with the first paint
  so the page does not shift.

### Custom backgrounds

- Let people pick a pastel preset, a custom color, or their own image in **Customize**. The
  current backgrounds stay the default.
- Keep images on the device at full quality. They do not sync, because sync's per-item limit is
  a few kilobytes; a chosen color syncs with the other preferences.
- Paint the background with the first paint, so a new tab never flashes the default first. An
  image paints at once as a 1280 px preview that is cheap to draw, and a copy scaled to the
  screen fades in over it once it has loaded and been drawn, with nothing else on the page
  changing. Previews from an earlier version are made again from the kept image.
  Text and controls follow the chosen color, or the parts of the photo behind the content in
  the window's current shape, whatever the appearance. Photos show as they are, with a soft halo behind the text, a
  stronger one where no text color reads everywhere, and a faint overlay only as a last resort.
- Nothing is downloaded, and no new permission shows an install warning.

## Considering

Ideas that are not approved yet and may be dropped.

- An animated background based on Helium's Prism gradient shimmer, off by default so the
  minimal look stays the default. Load it only after the first paint, draw a still frame
  with reduced motion, and keep plain JavaScript without Svelte. Helium Prism is
  GPL-3.0-only, so using its code means relicensing the extension or writing an
  independent version.
- Following the browser's theme colors. Chromium does not share theme colors with
  extensions beyond light or dark mode, so this needs investigation first.

## Not planned

- Downloading bang catalog updates at runtime. The catalog ships with each release so the
  extension makes no network requests.
- Taking focus from the address bar when a new tab opens. The browser always focuses the
  address bar first, and the only workaround reloads the page, which shows the extension's
  URL in the address bar and slows every new tab.
