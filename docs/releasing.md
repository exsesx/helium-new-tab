# Releasing

## Local checks and hooks

Use Bun 1.4.2, as pinned in `.bun-version` and `package.json`.
Use Node 26 for developer tooling. CI installs the latest Node 26 release explicitly.
Run `bun install --frozen-lockfile` after cloning. The `prepare` script automatically
sets up [Husky](https://typicode.github.io/husky/get-started.html); no separate hook
installation is needed. The tracked `.husky/pre-commit` runs `bun run check`, including
lint, formatting, tests, and a production build. It checks the current worktree, so
review staged and unstaged changes before committing.

If hooks need reinstalling, run `bun run prepare`. Git GUI clients must be able to
find Bun and Node on their PATH; see Husky's [GUI setup guidance](https://typicode.github.io/husky/how-to.html#node-version-managers-and-guis).
GitHub Actions sets `HUSKY=0` to skip local hook setup and runs the same checks directly
on every pull request and push to `main`.

Use Conventional Commits, for example `fix: preserve the selected language on reload`.

## GitHub release

1. Merge any open bang catalog refresh pull request, or run `bun run bangs:refresh`.
2. Update the version in `package.json`. The build copies it into the packaged manifest.
3. Run `bun install` to refresh package metadata in the lockfile, then `bun run check`.
4. Commit and push the release, then tag that commit with `v<package version>` and push the tag.
5. The Release workflow validates the tag, checks the source, builds the package, attests its
   build provenance, and creates a GitHub release with a ZIP and SHA-256 checksum. GitHub
   supplies the matching source archives. Verify a downloaded ZIP with
   `gh attestation verify helium-new-tab-<version>.zip --repo exsesx/helium-new-tab`.

`bun run package` also creates these files locally in `release/`. The ZIP contains the
contents of `dist/`, with `manifest.json` at its root. It includes privacy and license
notices and contains no dependencies, tests, editor files, or credentials. Packaging
uses the `zip` command available on macOS and GitHub's Ubuntu runners.

For local installation, extract the ZIP and use **Load unpacked** on the extracted folder.
When sharing a package, also make the matching source release available, including the
editable artwork and build instructions. The artwork retains its GPL-3.0 license.

### Refresh the bang catalog

The **Refresh bangs** workflow runs every Monday and on manual dispatch. When the upstream
catalog changed, it runs `bun run bangs:refresh` and `bun run check`, then opens or updates a
`chore/refresh-bang-catalog` pull request. Review and merge it before releasing.
It needs **Settings → Actions → General → Allow GitHub Actions to create and approve pull
requests**. Pull requests created with the workflow token do not trigger other workflows, so
the refresh workflow runs the same checks itself.

To refresh manually, run:

```sh
bun run bangs:refresh
bun run check
```

The command downloads Helium's published catalog and compares SHA-256 checksums of the
parsed JSON, so comments and whitespace do not count as updates. It formats standard JSON
while retaining every field, including format flags. It updates
the download date and generation timestamp in `THIRD_PARTY_NOTICES.md` when the catalog
changes. An unchanged catalog leaves the files untouched. Download, parsing, license,
or formatting failures stop before replacing the snapshot.
The existing catalog tests validate entries, unique aliases, URL templates, and format
flags when you run `bun run check`.

Review and commit the resulting diff before tagging. If the upstream license changes,
review its notice and update `licenses/bangs-MIT.txt` and the attribution before retrying.
Release workflows build the committed snapshot so the tag and ZIP contain the same catalog.
Both the Release and Chrome Web Store workflows run `bun run bangs:refresh --check`
before building. This downloads the upstream feed and compares its checksum without writing
files. A checksum mismatch or download/parsing/license error adds a warning to the run but
does not stop publishing, so hotfixes and re-runs of older tags still work. The normal
`bun run check` step then validates the committed entries before packaging.
Older releases without a bundled bang catalog skip this check.
The extension does not fetch this file at runtime.

## Chrome Web Store

The repository does not need store credentials for checks or GitHub releases.
The **Chrome Web Store** workflow runs only when manually dispatched. Choose `main` under
**Use workflow from** and leave the optional release tag blank to build its latest commit
at the time the run starts. Enter an existing release tag to build that version instead.
Leave **publish** unchecked to upload without submitting for review.
Selecting **publish** submits the item for review; approval and public availability
remain controlled by Google. This workflow does not run on commits or tags automatically.

Initial setup in your own Google account:

1. Set up a Chrome Web Store developer account with two-step verification.
2. Create the extension item in the Developer Dashboard. Complete its store listing,
   screenshots, privacy declarations, and distribution settings. Use the public
   [privacy policy](https://github.com/exsesx/helium-new-tab/blob/main/PRIVACY.md).
3. Enable the Chrome Web Store API in a Google Cloud project and create a service
   account. No project roles are required. Add its email under **Service account** in
   the Chrome Web Store publisher settings, following the
   [official service account guide](https://developer.chrome.com/docs/webstore/service-accounts).
4. Create a JSON key for that service account. In GitHub **Settings → Secrets and
   variables → Actions**, save the entire JSON as the repository secret
   `CWS_SERVICE_ACCOUNT_JSON`. Keep the key out of repository files and issue comments.
   This authentication does not need an OAuth client, consent screen, or refresh token.
5. Add repository variables `CWS_PUBLISHER_ID` and `CWS_EXTENSION_ID` from the Dashboard.
   The workflow uses the `chrome-web-store` environment, where optional required
   reviewers can add an approval before the upload job runs. Environment secrets and
   variables can also be used instead of repository settings.
6. Run the workflow from the updated branch, optionally supplying an existing release tag.
   Later uploads require a higher version; update `package.json` before uploading a
   new version. The package is built from the
   selected branch commit or tag, while the uploader comes from the workflow revision so
   older tags use current authentication.

The uploader exchanges a signed service account JWT for a short-lived access token
scoped to the Chrome Web Store API. It uses the official v2 API, waits for asynchronous
upload completion, and stops on upload errors before attempting publication. It never
logs private keys, tokens, or response bodies. Review the Developer Dashboard if it fails;
do not assume a failed or interrupted workflow means the upload or submission did not
reach Google.

Store listing text must describe this as an unofficial extension. The `search` permission
is used only to submit a user's query through the browser's configured search provider.
The optional `favicon` permission is requested only when the user turns on service icons
and is used only to show locally cached icons for recognized bangs.
No remote code, tracking, or external startup requests are used.
