# Lane A integration

`auth/index.ts` exports `createAuthController`, `mountAuth`, and
`isReturningEditor`. `drafts/index.ts` exports `createDraftStore`,
`createDraftAutosave`, and `mountDrafts`. Both mounts return `{ dispose() }`.
The host owns the theme/button styles and keeps these roots separate from the
composer so login state changes never remove the writing surface.

## H wiring

1. Create one draft store and one auth controller. Supply the GitHub App client ID,
   deployed Worker `/exchange` URL, `{ owner, name }`, and
   `flushDrafts: () => store.flush()`.
2. Mount auth with `onSession`. It handles the callback once, removes the one-use
   code/state from the URL before exchange, and provides non-secret session data.
   A null session means show login without clearing the composer or draft store.
   A session with `canWrite: false` is not an editor; the mount displays Korean
   permission guidance and logout.
3. Pass `auth.tokens` to the GitHub adapter. Use `auth.fetch` for its requests,
   or call `auth.notifyUnauthorized()` when its result is `unauthorized`.
   The wrapper refuses to send tokens outside the configured API origin and
   emits `onsite:relogin-required` on expiry/401. Subscribe through
   `onReloginRequired` or the window event, not both.
4. After authentication, scope drafts by owner, repository, numeric user ID and
   slug. Call `store.restore(key, remoteHeadSha)` before enabling autosave.
   `conflict` includes the untouched local snapshot and current remote SHA;
   do not apply it over the remote version without the host's comparison flow.
   `mountDrafts` also supports this flow with `onRestore` and `onConflict`.
5. Restore the whole bundle, cursor selection, active language
   (`snapshot.cursor.language`) and scroll position. Create autosave using the
   restored `sequence` (zero for a new draft). Call `update(bundle, cursor)` on
   every edit, image change, selection change and language switch. Supply the
   current cursor even when the selection is collapsed so active language is
   preserved. The shared contract stores language in the cursor, not separately.
6. Each update clones and immediately starts one atomic IndexedDB write (zero
   debounce). Await/catch its promise to show save failures. Visibility changes
   and pagehide also flush; `onError` reports lifecycle flush failures.
   Logout never removes drafts. On a successful GitHub save, update
   `bundle.headSha` to the returned head and autosave that new baseline.
7. Dispose mounts, autosave bindings and auth listeners on route/application
   teardown. Flush before closing a draft store. Do not clear browser storage on
   logout. The header may use `isReturningEditor()` without authentication.

`beginLogin()` flushes then performs full-page navigation. For callers using the
shared `AuthController.login()` contract, a non-callback call throws
`AuthError` with `kind: "redirecting"` after navigation begins; a callback call
resolves to its session. `mountAuth` uses `beginLogin()` directly.

## Deployment

Register `https://hyper-accel.github.io/editor-login/` as the GitHub App callback.
The standard query callback is used for authorization. The fixed redirect sent to GitHub and
the Worker is always the exact origin plus `/editor-login/` (`CALLBACK_PATH`), without query
or hash.
Local callbacks must be registered for their exact localhost/127.0.0.1 port.

The Worker accepts the snake_case request specified by lane A and normalizes
camelCase requests from the shared test contract too. Its response is the
shared camelCase token response. Configure `GITHUB_CLIENT_ID` and set
`GITHUB_CLIENT_SECRET` using the Worker secret store; never put the secret in
the site build. Expiring user tokens must remain enabled (8-hour GitHub App
tokens). Authorization requests `offline_access` for an expiring token; the
Worker deliberately discards the refresh token. No refresh token is returned to
the browser.

No real GitHub App credentials are supplied by this lane. Live OAuth and Worker
deployment require those external settings; the Chromium test uses the real
client, real IndexedDB, real Worker handler and the stateful fake GitHub server.

## Checks

From `tools/editor`:

```sh
bunx biome check src/client/auth src/client/drafts workers/token-exchange
bunx tsc --noEmit
bunx tsc --noEmit -p workers/token-exchange/tsconfig.json
bun test src/client/auth src/client/drafts workers/token-exchange
bun run src/client/auth/auth.e2e.ts
```

The browser fixture is test-only, built in memory. It checks 390x844 and
1440x900 Chromium, expiry while editing, re-login with identical ko/en metadata,
body, binary image and selection, reload and tab close/reopen. It records
light/dark screenshots and uses DOM state/transaction completion, never sleeps.
