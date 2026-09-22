# Privacy

Helium New Tab stores appearance, language, clock, font, and service-icon preferences in local
storage within your browser profile. It has no account, analytics, advertising,
telemetry, or backend. It does not collect or transmit browsing history.

Opening a new tab makes no external network requests. Translations, images, scripts,
and styles ship in the extension; custom fonts must already be installed on your device.

Typing a recognized bang requests a 64-pixel icon from Google's favicon service.
This sends the destination's origin, such as `https://www.youtube.com`, to Google
before you submit the search. It sends no search terms, cookies, or referrer.
The extension uses Chromium's credentialless image policy to omit cookies.
Google still receives ordinary connection information such as your IP address.
Turn off **Customize → Show service icons** to stop these requests. Bangs with
query-dependent hostnames do not request an icon.

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
