# Roadmap

## 1.3

- Move bang-catalog downloads and cache writes into an extension service worker so
  searches and closed new tabs cannot interrupt updates.
- Keep a bundled fallback and refresh a validated local cache weekly on first bang use.
  Failed updates should retain the last good snapshot and retry after an hour.
- Keep each open tab's catalog stable so its preview and submitted destination agree.
  Catalog requests must omit search terms, cookies, and referrers.
- Verify quick navigation, interrupted downloads, offline use, corrupt caches, and
  concurrent tabs in the installed extension before enabling automatic updates.

Until then, the extension uses only its bundled catalog. A weekly workflow opens a pull request
with catalog updates; see the [release instructions](docs/releasing.md).
