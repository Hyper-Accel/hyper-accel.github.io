# Browser GitHub adapter

`createGitHubAdapter` implements the shared `GitHubAdapter` contract with browser
`fetch`. It defaults to `https://api.github.com`; `baseUrl` redirects both REST and
GraphQL to the stateful fake. No package or shared contract changes are required.

```ts
import { createGitHubAdapter } from "./github"

const github = createGitHubAdapter({
  owner: "Hyper-Accel",
  repository: "hyper-accel.github.io",
  tokenProvider, // MemoryTokenProvider; read for each request
  expiresAt: () => sessionExpiresAt, // actual token expiry from authentication
  codec: documentCodec, // lane C; only parse is needed here
})
```

`loadBundle(slug)` captures the post branch head, falling back to the repository's
default branch before a draft exists. All Contents/tree reads use that SHA.
The concrete adapter also supports `loadBundle(slug, sha)` for explicit historical
reads. `listDrafts()` returns the contract's PR/slug/head metadata, including ready
open PRs, and excludes other branches and fork heads.

Pass serialized `initialFiles` when creating a draft. The adapter creates the
branch from the default branch, saves the initial bundle, and then opens a Draft
PR. Existing open PRs are returned without overwriting their content. Saves create
all immutable objects before one non-forced ref update, with the expected head as
the commit's only parent.

Lane E/C must run document validation for review/publication before `markReady`
or `squashMerge`. The adapter verifies head SHA, ready state, and current-head
approval; the merge endpoint also receives the expected SHA. The token must have
Contents and Pull requests write access (and Issues access for issue comments).

Native threads use REST review comments and GraphQL thread IDs/resolution.
Out-of-diff anchors use issue comments. Issue replies and resolution changes are
append-only metadata events, so reviewers never need to edit someone else's root
comment. Hidden metadata escapes both angle brackets and is removed from displayed
comment bodies.

Failures are `GitHubResult` errors. Rate limits include epoch-millisecond
`retryAt`; there are no automatic mutation retries or sleeps. ETags are kept only
in memory and cleared on token changes/mutations. Conflicts include the actual
head when available.

A lost mutation response triggers read-back. Unresolved writes remain pending
in the same adapter and are not blindly replayed. Keep that instance across
reauthentication. After a page reload, callers must reconcile an
`outcomeUnknown: true` operation against loaded remote state before submitting it
again; the shared contract has no durable operation/idempotency key.

## Tests

Run from `tools/editor`:

```sh
bunx biome check src/client/github
bunx tsc --noEmit
bun test src/client/github
```

Tests drive H's stateful fake over HTTP. `__tests__/http-extension.ts` adds ETag
responses, request observation, deterministic concurrency barriers, and simulated
lost responses without modifying the shared fake. Its merge-response extension
also supplies the real `merge_commit_sha` read-back field omitted by H's fake,
using the receipt from the fake's actual merge endpoint. The fake's diff model is one
changed hunk; real-GitHub multi-hunk behavior remains a live integration check.
