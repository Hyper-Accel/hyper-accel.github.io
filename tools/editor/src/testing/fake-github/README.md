# Stateful GitHub test server

```ts
import { startFakeGitHub } from "./index"

const github = startFakeGitHub()
try {
  // Configure the adapter's REST/GraphQL origin to github.url.
  // Authorization: Bearer github.defaultToken (author, write access).
  // github.reviewerToken is a different writer who can approve.
  github.seed("main", { "content/posts/example/index.md": "Existing source\n" })
  github.inject({
    method: "PATCH",
    path: "/repos/Hyper-Accel/hyper-accel.github.io/git/refs/heads/post/example",
    status: 429,
    afterMutation: true,
  })
} finally {
  github.stop()
}
```

`startFakeGitHub({ owner?, repository?, now?, requireApproval? })` binds loopback on
port 0. Tests own each instance and call `stop()`. `state` exposes maps for assertions,
not a substitute for driving the HTTP API. `seed(branch, files)` takes a complete file
snapshot and returns a commit SHA; subsequent seeds of the same branch preserve ancestry.
Use Git Data endpoints to branch from main for PR tests. Tokens are explicitly fake.

## Wire surface

- `GET /user`, `GET /repos/:owner/:repo` (public repo and permissions),
  `GET .../collaborators/:login/permission`.
- `POST/GET .../git/blobs`, `.../git/trees`, `.../git/commits` (GET takes a SHA).
  Blobs preserve binary base64 bytes. Tree overlays support inline content, blob SHA,
  and null SHA deletion. Writes create immutable objects; refs change only explicitly.
- `POST .../git/refs`, `GET .../git/ref/heads/:branch`,
  `PATCH/DELETE .../git/refs/heads/:branch`, `GET .../git/matching-refs/:prefix`.
  Non-forced updates reject non-fast-forward siblings, including concurrent requests.
- `GET .../contents/:path?ref=...` returns file content/base64.
- `GET/POST .../pulls`, `GET/PATCH .../pulls/:number`; list supports state/head/base
  and numeric pagination. Duplicate open PRs and branches without differing commits
  fail with 422. Creation needs an initial commit, as on GitHub.
- `GET/POST .../pulls/:number/comments`, `POST .../pulls/:number/comments/:id/replies`.
  Ranges retain `start_line`, `line`, `start_side`, and `side`. New comments require
  the current head and a changed right-side range. Single-line comments omit start fields.
- `GET/POST .../issues/:number/comments`, `GET/PATCH .../{issues,pulls}/comments/:id`.
  Issue comments support versioned range metadata supplied by the adapter.
- `GET/POST .../pulls/:number/reviews`; author self-approval fails. Review responses
  retain reviewer identity, commit SHA and approval/changes-requested state.
- `PUT .../pulls/:number/merge` accepts only squash and an expected SHA. Draft/closed
  PRs, absent current-head approval, a latest changes-requested review, wrong SHA,
  or advanced base fail. Merge creates a single-parent commit on base and closes the PR.
- `POST /graphql`: `reviewThreads`, `resolveReviewThread`, `unresolveReviewThread`,
  `markPullRequestReadyForReview`. Mutations accept `variables.input` or flat variables;
  thread query takes `variables.number` (or `pullNumber`) and returns nodes and edges.
- `POST /oauth/token`: `{code, codeVerifier, redirectUri}` to
  `{accessToken, tokenType: "bearer", expiresIn: 28800}`. Register a one-use code using
  `grantCode(code, verifier, redirectUri, identity)`. S256 verification and redirect
  matching are enforced. `grantToken` supports read-only and expired-token cases.

`inject({method, path, status, afterMutation?})` consumes the next exact method/path
match. Status is 401/403/409/422/429. Before-mutation failures leave state unchanged.
After-mutation failures deliberately return an error after applying a successful write,
allowing read-back reconciliation tests. This models ambiguous application outcomes,
not a TCP disconnect. Rate headers are deterministic using the injected clock.

## Intentional test-model limits

This is not all of GitHub: only the endpoints above are supported; unknown operations
fail rather than return success. Trees are flattened recursive file lists; tree/commit
hashes are deterministic hashes of the model, not Git's binary object serialization.
Blob hashes do use Git's byte serialization. Diff validation trims equal prefix/suffix
lines, treating the changed middle as one hunk; complex multiple-hunk alignment belongs
in adapter integration tests against GitHub. GraphQL supports the named operations,
not an arbitrary GraphQL interpreter. REST list pagination is numeric, without Link
headers. Merge conservatively requires the base to remain an ancestor of the head.
OAuth tests model exchange/PKCE, not GitHub's interactive authorization web page.

Run `bun test src/testing/fake-github` from `tools/editor`.
