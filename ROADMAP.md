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

## Not planned

- Downloading bang catalog updates at runtime. The catalog ships with each release so the
  extension makes no network requests.
