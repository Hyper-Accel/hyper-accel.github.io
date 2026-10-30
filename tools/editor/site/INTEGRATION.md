# Hosted editor integration

## Writing surface

The editor has no address of its own. A published post is edited on its own page
(`/posts/<slug>/?edit`, English `/en/posts/<slug>/?edit`; `assets/js/editor-entry.js` swaps the
article for the editor). New posts and unpublished drafts use `/editor-new/` (`?draft=<slug>`),
login and the OAuth callback use `/editor-login/`, and `?review=<PR number>` on either editing
page opens that pull request's review. `/editor-login/` and `/editor-new/` are Hugo pages
(`content/editor-{login,new}.md`, `layouts/_default/editor.html`) so the editor runs inside the
real site header, footer and stylesheet; old `/editor/#/...` links land on the matching new
address (`content/editor.md`, `layouts/_default/editor-redirect.html`). The page reads the Vite manifest
(`tools/editor/dist-site/editor/manifest.json`) and loads the `src/client/site.ts` entry, so
Vite must build before Hugo. The composer renders the post page itself
(`post-reading-layout` > `article.post-single`: breadcrumbs, category kicker, `h1.post-title`,
`post-meta`, `post-content`, `post-tags`, live table of contents). Title and body are edited in
place; category, date, authors and tags open the post-information panel under the meta line.
The site header's language pill switches the editing language. Save state and the GitHub save
action sit in a bottom bar.

## Local run

`bun run dev:site` builds `dist-site/editor/`, renders the Hugo site into `dist-site/`
(`build:shell`) and serves the blog with the editor at
`http://127.0.0.1:4175/` (login at `/editor-login/`); `EDITOR_SITE_PORT` overrides the port. The same
process owns the stateful fake GitHub, fake authorization page and real A token
exchange handler with explicitly fake server credentials. Browser login uses
real PKCE, the real auth controller and repository permission checks.

The harness seeds an editable example and an in-memory copy of the real
`crafting-compilers` post for pairing recovery. It does not modify repository
content. To log in a second browser context as reviewer, set the local,
non-secret `onsite-dev-user=reviewer` cookie. Restarting resets the remote model,
not IndexedDB drafts.

For production, build with `VITE_EDITOR_GITHUB_CLIENT_ID` and
`VITE_EDITOR_TOKEN_EXCHANGE_URL`. No client secret is included in the build.
Missing configuration produces a visible login setup error.

## Mounted lanes

- A supplies the auth controller, auth mount, IndexedDB DraftStore, recovery
  mount and immediate autosave. H bridges OAuth through a popup so the original
  editor remains mounted. Only a one-use callback URL crosses the validated
  same-origin, exact-window message channel; access tokens remain in the parent
  auth controller. One expiry subscription is used. Authenticated fetch is
  injected into B for 401 invalidation.
- B is instantiated once for the application and retained across re-auth.
  Explicit saves serialize ko/en/images together. H compares the remote snapshot
  before retrying after reload: an already-applied save is reconciled without a
  second commit; a different advanced remote head is a conflict.
- C supplies the actual metadata form, paired block editor, document codec,
  validation and manual pairing repair. Author directory names are emitted as
  `authors.json` during the Vite build. H adapts its mount handle, captures
  selection/language changes, flushes live state before login or route teardown,
  and updates the local remote-head baseline after a successful save.
  A small H extension captures committed ProseMirror selection updates, avoiding
  the earlier native-DOM-event ordering race.
- R supplies the actual sanitized renderer and full-file source maps. H resolves
  committed image blobs in the parent through authenticated GitHub requests,
  pending Blob URLs and raster dimensions. Serialized source is supplied for
  exact line numbers. The renderer's outer `.post-content` wrapper is removed
  for E, which already supplies that wrapper.
- E supplies the single sandboxed frame and review screen, comments, approval
  and publishing. Its selection/highlight/height protocol differs from R's
  standalone preview protocol, so frames are not nested or mixed. The frame gets
  only rendered content, resolved image URLs and a fingerprinted stylesheet.
  `preview.css` compiles the site's existing resource order plus pinned KaTeX
  0.16.25 and local font assets. The `isPublished` hook reads fake merge state
  locally. Production requires a public build marker matching the PR merge SHA
  or a proven descendant, plus a successful public post response.
- D2's block-extension factory is mounted through C's media resolver and image
  picker, including typed shortcodes, math, slash commands and drop zones.
  No auth/GitHub/composer/renderer/review service stubs remain.

## Compatibility and persistence

`GitHubAdapter.getPullState?` is additive so existing injected adapters remain
valid. B implements fresh pull/review reads and returns head SHA, draft state,
latest effective approval SHAs, nullable mergeability and merged state.
Outstanding changes requests remove approval eligibility. E restores its
approval gate from this result rather than the prior screen's memory.

Existing slug case is preserved. `newSlugSchema` and C's new-post form enforce
lowercase only for new posts. Korean paths support `index.md` and `index.ko.md`;
B passes the actual paths through `ParseBundleInput.paths`, and C's normal and
repair assembly preserve them. B rejects writes that would create the alternate
Korean filename alongside the existing one. Images may live at the bundle root
or under `images/`; traversal and unrelated paths remain rejected.

`parseForEditing` is wired through the adapter's codec boundary so the edit
route can mount either a valid bundle or C's unpaired repair state from the same
captured remote head. Pairing issues are shown as a banner. Valid local drafts
take precedence when their remote-head baseline matches.

Unfinished pairing is deliberately not coerced into PostBundle. H stores a
versioned `repair` record in `hyperaccel-onsite-repairs`, using the same
repository/user/slug key. Each operation clones and atomically saves both
languages, metadata, images, active language, scroll position, head and monotonic
sequence. Login and route teardown flush these writes. Reload restores repair
mode; a changed head is reported without overwriting the record. Completion
first persists the valid PostBundle through A, then deletes the repair record.

## Commands and remaining checks

- `bun run e2e:site` builds the app, runs the integrated Chromium scenario at
  390x844 and 1440x900, then E's standalone Chromium suite.
- `src/e2e/site-flow.e2e.ts` drives real new-post creation, atomic save,
  uncommitted image recovery, expiry/re-login without remounting, reload,
  second-user range comment, approval surviving reload, squash publication,
  and legacy repair recovery/record cleanup.
- `src/testing/legacy-contracts.test.ts`, `repair-store.test.ts`, and B's adapter
  tests cover legacy filenames/case/root images, repair structured-clone and
  sequence guarantees, and approval/revocation/head/merge state.
- G's `ci:dry-run` command includes check, hosted build, CI tests and the full
  post validator. Pages still consumes exactly `dist-site/editor/`.

Integration findings for lane owners: C's current WebP encoder rejects inputs
smaller than 64px before trying to encode them. B's fetch option uses Bun's
`typeof fetch` (including `preconnect`), while A exposes the standard callable
fetch type; H currently preserves the native property on the injected function.
The draft list uses front matter authors; B's list contract still omits the
authoritative update time and PR-author identity. Approval state now comes from
`getPullState`.

## Final verification, October 27, 2026

- Final `bun run check` passes: Biome, typecheck and 376 tests, 0 failures.
- Hosted build and `bun run e2e:site` pass. The final integrated scenario also
  explicitly injects adapter 401 responses and verifies that re-login keeps the
  original editor node mounted. Both 390x844 and 1440x900 pass.
- The recovery assertion compares ko/en documents, metadata, snapshot hash, remote
  baseline, pending image path/bytes, active language, cursor and scroll position.
  Legacy repair recovery and deletion after completion pass at both sizes.
- The actual `bun run dev:site` process was started and driven in Chromium through
  real A/B/C/R/E login, new post, save and rendered review, then stopped.
- `git diff --check` passes. Full block-browser checks also pass at 390/1440
  after correcting math selection and native drag event synchronization.
- Latest integrated screenshots:
  `$TMPDIR/hyperaccel-site-flow-XRFyrD/`.
  Review suite screenshots: `$TMPDIR/onsite-review-e2e-ySdSP6/`.
  Actual dev command screenshot: `/tmp/hyperaccel-dev-site-smoke.png`.

No project commits were created. D2 registration is connected and the integrated
checks pass after this connection. See `QA.md` for the final evidence ledger.

Local-only drafts are now discovered from scoped IndexedDB records, rather than
only the current tab's sessionStorage pointer. They can be reopened before any
remote branch exists. When a remote head advances, an on-site comparison shows
both languages, metadata and image inventories. Explicit local/remote choices
continue editing from the selected version and the current remote baseline.
Reload and re-login conflict paths are covered at both widths.

## Production setup

1. Register and install the GitHub App on this repository. Enable user
   authorization with the callback `https://hyper-accel.github.io/editor-login/`.
   Grant repository Contents, Pull requests and Issues read/write access and
   Checks read access. Existing repository access remains the editing gate.
2. Deploy `workers/token-exchange/` with its GitHub client ID and a
   `GITHUB_CLIENT_SECRET` Worker secret. Never place that secret in site variables.
3. Set repository Actions variables `VITE_EDITOR_GITHUB_CLIENT_ID` and
   `VITE_EDITOR_TOKEN_EXCHANGE_URL` to the OAuth Client ID and the deployed
   exchange endpoint ending in `/exchange`. Use the OAuth Client ID, not the
   numeric App ID. The Pages workflow injects these at hosted build time.
4. Require `editor/ko-en`, `editor/authors`, `editor/category` and `editor/hugo`
   checks on the protected default branch, and allow squash merging.

App creation, Worker deployment, repository settings and a live GitHub publish
have not been performed by the local fake-server checks.
