# Third-party notices

The original extension code is Copyright (c) 2026 Oleh Vanin, under the MIT license.
Helium artwork remains under its upstream GPL-3.0 license, included in
[licenses/GPL-3.0.txt](licenses/GPL-3.0.txt). The MIT license does not relicense that artwork.

## Bang catalog

`src/data/bangs.json` is a snapshot of [Helium's published bang catalog](https://services.helium.imput.net/bangs.json),
downloaded on 21 September 2026. Its generation timestamp is `2026-09-01T08:41:24.475Z`.
The catalog is Copyright (c) 2024 Kagi Search, 2026 imput, under the MIT license
included in [licenses/bangs-MIT.txt](licenses/bangs-MIT.txt).

The source header identifies [Kagi's bangs](https://github.com/kagisearch/bangs) and
[Helium's extras](https://github.com/imputnet/helium-services/blob/main/svc/bangs/extras.json)
as its inputs. We converted the published JSON with comments and trailing commas to
standard JSON using `Bun.JSON5.parse`, without changing its entries.
The build packages a compact copy with only the service names, aliases, URL templates, and
format flags that the extension reads.

## Top-level domain list

The search field bundles the [`tlds`](https://github.com/stephenmathieson/node-tlds) package's
list of IANA top-level domains to tell website addresses such as `example.com` from file
names such as `next.js`. It is Copyright (c) 2013 Stephen Mathieson and 2020 Richie Bendall,
under the MIT license included in [licenses/tlds-MIT.txt](licenses/tlds-MIT.txt).

## Helium artwork

Copyright 2026 The Helium Authors.

- `src/assets/favicon-light.png` is Helium's native New Tab favicon.
- `src/assets/favicon-dark.svg` embeds the same bitmap as a mask, tinted light gray.
- `src/assets/extension-icon.svg` reproduces the Helium product-logo geometry with a neutral fill.
- `src/assets/extension-icon-*.png` are rasterizations of that SVG.
- The inline logo in `src/index.html` uses Helium's brand-kit geometry with `currentColor`.

Upstream references, inspected at revision `030abda45d9b7f719d3dcbbe570cf07fcc229fe2`:

- [Native favicon](https://github.com/imputnet/helium/blob/030abda45d9b7f719d3dcbbe570cf07fcc229fe2/resources/favicons/favicon_ntp_32.png)
- [Product logo](https://github.com/imputnet/helium/blob/030abda45d9b7f719d3dcbbe570cf07fcc229fe2/resources/branding/product_logo.icon)
- [Upstream license](https://github.com/imputnet/helium/blob/030abda45d9b7f719d3dcbbe570cf07fcc229fe2/LICENSE)
- [Brand kit](https://helium.computer/brand)

Changes made on 21 September 2026: neutral recoloring, SVG mask wrapping, inline embedding,
and rasterization at extension icon sizes. Editable sources and build instructions are
included in the matching source release at
[exsesx/helium-new-tab](https://github.com/exsesx/helium-new-tab).

Helium names and branding belong to their respective owners. This is an unofficial
project and is not affiliated with or endorsed by Helium or imput. No trademark
permission is granted by this project's license.
