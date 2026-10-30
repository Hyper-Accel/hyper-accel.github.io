export interface FakeIdentity {
  readonly login: string
  readonly id: number
  readonly permission: "read" | "write" | "admin"
  readonly expiresAt: number
}
export interface FakeBlob {
  readonly sha: string
  readonly content: string
  readonly encoding: "base64"
  readonly size: number
}
export interface FakeTreeEntry {
  readonly path: string
  readonly mode: "100644"
  readonly type: "blob"
  readonly sha: string
}
export interface FakeTree {
  readonly sha: string
  readonly tree: readonly FakeTreeEntry[]
}
export interface FakeCommit {
  readonly sha: string
  readonly message: string
  readonly tree: { readonly sha: string }
  readonly parents: readonly { readonly sha: string }[]
}
// Mutable records model server state. Tests start a fresh server for each case.
export interface FakePull {
  readonly number: number
  readonly node_id: string
  readonly head: string
  readonly base: string
  readonly author: string
  title: string
  body: string
  draft: boolean
  state: "open" | "closed"
  merged: boolean
}
export interface FakeComment {
  readonly id: number
  readonly node_id: string
  readonly pull: number
  readonly user: { readonly login: string }
  body: string
  readonly created_at: string
  readonly kind: "review" | "issue"
  readonly commit_id?: string
  readonly path?: string
  readonly line?: number
  readonly start_line?: number
  readonly side?: "RIGHT"
  readonly start_side?: "RIGHT"
  readonly in_reply_to_id?: number
}
export interface FakeThread {
  readonly id: string
  readonly pull: number
  readonly root: number
  isResolved: boolean
}
export interface FakeReview {
  readonly id: number
  readonly pull: number
  readonly user: { readonly login: string }
  readonly commit_id: string
  readonly state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED"
  readonly body: string
}
export interface FakeFailure {
  readonly method: string
  readonly path: string
  readonly status: 401 | 403 | 409 | 422 | 429
  readonly afterMutation?: boolean
}
export interface FakeGitHubState {
  readonly blobs: Map<string, FakeBlob>
  readonly trees: Map<string, FakeTree>
  readonly commits: Map<string, FakeCommit>
  readonly refs: Map<string, string>
  readonly pulls: Map<number, FakePull>
  readonly comments: Map<number, FakeComment>
  readonly threads: Map<string, FakeThread>
  readonly reviews: Map<number, FakeReview>
  readonly tokens: Map<string, FakeIdentity>
  readonly failures: FakeFailure[]
}

export function objectSha(kind: string, content: string | Uint8Array): string {
  const bytes = typeof content === "string" ? Buffer.from(content) : content
  return new Bun.CryptoHasher("sha1")
    .update(`${kind} ${bytes.byteLength}\0`)
    .update(bytes)
    .digest("hex")
}

export function createState(): FakeGitHubState {
  return {
    blobs: new Map(),
    trees: new Map(),
    commits: new Map(),
    refs: new Map(),
    pulls: new Map(),
    comments: new Map(),
    threads: new Map(),
    reviews: new Map(),
    tokens: new Map(),
    failures: [],
  }
}

export function putBlob(state: FakeGitHubState, bytes: Uint8Array): FakeBlob {
  const sha = objectSha("blob", bytes)
  const blob = {
    sha,
    content: Buffer.from(bytes).toString("base64"),
    encoding: "base64" as const,
    size: bytes.byteLength,
  }
  state.blobs.set(sha, blob)
  return blob
}

export function putTree(state: FakeGitHubState, entries: readonly FakeTreeEntry[]): FakeTree {
  const tree = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const sha = objectSha("tree", JSON.stringify(tree))
  const result = { sha, tree }
  state.trees.set(sha, result)
  return result
}

export function putCommit(
  state: FakeGitHubState,
  tree: string,
  parents: readonly string[],
  message: string,
): FakeCommit {
  const data = { message, tree: { sha: tree }, parents: parents.map((sha) => ({ sha })) }
  const sha = objectSha("commit", JSON.stringify(data))
  const commit = { sha, ...data }
  state.commits.set(sha, commit)
  return commit
}

export function seedBranch(
  state: FakeGitHubState,
  branch: string,
  files: Readonly<Record<string, string | Uint8Array>>,
): string {
  const entries = Object.entries(files).map(([path, content]) => ({
    path,
    mode: "100644" as const,
    type: "blob" as const,
    sha: putBlob(state, typeof content === "string" ? Buffer.from(content) : content).sha,
  }))
  const previous = state.refs.get(`heads/${branch}`)
  const commit = putCommit(
    state,
    putTree(state, entries).sha,
    previous ? [previous] : [],
    `Seed ${branch}`,
  )
  state.refs.set(`heads/${branch}`, commit.sha)
  return commit.sha
}

export function filesAt(state: FakeGitHubState, sha: string): readonly FakeTreeEntry[] {
  const commit = state.commits.get(sha)
  return commit ? (state.trees.get(commit.tree.sha)?.tree ?? []) : []
}

export function isAncestor(state: FakeGitHubState, ancestor: string, sha: string): boolean {
  const pending = [sha]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const next = pending.pop()
    if (!next || visited.has(next)) continue
    if (next === ancestor) return true
    visited.add(next)
    pending.push(...(state.commits.get(next)?.parents.map((parent) => parent.sha) ?? []))
  }
  return false
}
