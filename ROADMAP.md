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

## Planned: Pinned sites

- Let people pin their favorite sites as a row of shortcuts below the search field. Sites
  are chosen by hand, never collected from browsing history.
- Add, rename, reorder, and remove sites in **Customize** with the keyboard or a pointer.
- Open them like links: Ctrl, Cmd, or a middle click opens a background tab, as the
  search field does.
- Sync the list with the other preferences as its own storage item, so it stays within
  sync's per-item size limit, and cap its length so the row stays tidy.
- Show icons from the browser's favicon cache when **Show service icons** is on, and a
  letter tile otherwise. Nothing is downloaded.
- Skip a most-visited list, because the `topSites` permission shows an install warning.
- Show no row until a site is pinned, and draw it with the first paint so the page does not
  shift.
- Verify with unit tests for address validation and Playwright tests for adding,
  reordering, and opening sites.

## Considering

Ideas that are not approved yet and may be dropped.

- Custom backgrounds, such as following the browser's theme colors or picking a color.
  Chromium does not share theme colors with extensions beyond light or dark mode, so
  following the browser needs investigation first.

## Not planned

- Downloading bang catalog updates at runtime. The catalog ships with each release so the
  extension makes no network requests.
