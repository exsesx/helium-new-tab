# Privacy

Helium New Tab stores appearance, language, clock, font, and service-icon preferences, and the
addresses and names of sites you pin, in local storage within your browser profile. It also
copies them, except the service-icon choice, to the browser's extension sync storage. If your
browser syncs extension data through your browser account, those preferences and pinned sites
follow you to your other devices; otherwise they stay on this device. Each saved copy also notes when it changed and a random identifier for the device
that changed it, so a device can tell its own older changes from newer ones. The identifier is
created on the device and identifies nothing else. It has no account, analytics, advertising,
telemetry, or backend. It does not collect or transmit browsing history.

A background color you choose syncs with the other preferences. A background image you choose
stays on this device: the full image in the extension's IndexedDB storage, kept as it is or
resized there, with a copy scaled to your screen, and a preview of it, about 1280 pixels wide,
with its average colors in local storage, so a new tab can paint it at once. The image is never synced or uploaded, and
**Remove image** deletes both.

The extension makes no external network requests. Translations, images, scripts,
and styles ship in the extension; custom fonts must already be installed on your device.

**Customize → Show service icons** is off by default. Turning it on asks for the optional
`favicon` permission, which lets the extension read site icons your browser has already
saved. While you type a recognized bang, the extension looks up the destination's icon in
that local cache, and pinned sites show their icons from it. No icon service or website receives
a request. Bangs with query-dependent hostnames show no icon.

The bang catalog ships with the extension. Maintainers update this snapshot manually
with extension releases. The extension does not download or cache bang catalogs.

When you submit a search, the extension passes your query to the browser's configured
search provider through the `search` permission. Recognized bangs, such as `!yt`, are
resolved using the local catalog and navigate directly to the destination with your
search terms. No external bang lookup or redirect service receives those queries.
Unknown bangs are passed to your configured search provider. Entering a website address
navigates to that website. Those destinations have their own privacy policies. The development
preview uses DuckDuckGo because it does not have access to the browser search API.

Uninstalling the extension removes its stored preferences. To report a privacy concern,
[open an issue](https://github.com/exsesx/helium-new-tab/issues) without including private data.
