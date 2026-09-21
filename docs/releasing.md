# Releasing

## Local checks and hooks

Use Bun 1.4.1, as pinned in `.bun-version` and `package.json`.
Run `bun install --frozen-lockfile` and `bun run hooks:install` after cloning.
The dependency-free pre-commit hook runs `bun run check`, including lint, formatting,
tests, and a production build. It checks the current worktree, so review staged and
unstaged changes before committing. Hooks are local; GitHub Actions also checks every
pull request and push to `main`.

Use Conventional Commits, for example `fix: preserve the selected language on reload`.

## GitHub release

1. Update the versions in `src/manifest.json` and `package.json` together.
2. Run `bun install` to refresh package metadata in the lockfile, then `bun run check`.
3. Commit and push the release, then tag that commit with `v<manifest version>` and push the tag.
4. The Release workflow validates the tag, checks the source, builds the package, and creates
   a GitHub release with a ZIP and SHA-256 checksum. GitHub supplies the matching source archives.

`bun run package` also creates these files locally in `release/`. The ZIP contains the
contents of `dist/`, with `manifest.json` at its root. It includes privacy and license
notices and contains no dependencies, tests, editor files, or credentials. Packaging
uses the `zip` command available on macOS and GitHub's Ubuntu runners.

For local installation, extract the ZIP and use **Load unpacked** on the extracted folder.
When sharing a package, also make the matching source release available, including the
editable artwork and build instructions. The artwork retains its GPL-3.0 license.

## Chrome Web Store

The repository does not need store credentials for checks or GitHub releases.
The **Chrome Web Store** workflow runs only when manually dispatched. Select an existing
release tag and leave **publish** unchecked to upload without submitting for review.
Selecting **publish** submits the item for review; approval and public availability
remain controlled by Google. This workflow does not run on commits or tags automatically.

Initial setup in your own Google account:

1. Set up a Chrome Web Store developer account with two-step verification.
2. Create the extension item in the Developer Dashboard. Complete its store listing,
   screenshots, privacy declarations, and distribution settings. Use the public
   [privacy policy](https://github.com/exsesx/helium-new-tab/blob/main/PRIVACY.md).
3. Enable the Chrome Web Store API and create OAuth credentials following the
   [official API guide](https://developer.chrome.com/docs/webstore/using-api).
4. Create a GitHub environment named `chrome-web-store`. Add environment variables
   `CWS_PUBLISHER_ID` and `CWS_EXTENSION_ID` from the Dashboard.
5. Add environment secrets `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, and `CWS_REFRESH_TOKEN`.
   Keep these out of repository files and issue comments. Optional required reviewers on
   the environment add an approval before the upload job runs.
6. Run the workflow for the intended release tag. Later uploads require a higher manifest version.

The workflow uses the official v2 API, waits for asynchronous upload completion, and
stops on upload errors before attempting publication. It never logs OAuth tokens or
response bodies. Review the Developer Dashboard if it fails; do not assume a failed
or interrupted workflow means the upload or submission did not reach Google.

Store listing text must describe this as an unofficial extension. The `search` permission
is used only to submit a user's query through the browser's configured search provider.
No remote code, tracking, or external startup requests are used.
