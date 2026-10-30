import { z } from "zod"
import { tokenExchangeRequestSchema } from "../../shared/onsite/auth"
import {
  createState,
  type FakeComment,
  type FakeFailure,
  type FakeGitHubState,
  type FakeIdentity,
  type FakePull,
  filesAt,
  isAncestor,
  putBlob,
  putCommit,
  putTree,
  seedBranch,
} from "./state"

export type { FakeFailure, FakeGitHubState, FakeIdentity } from "./state"

const shaSchema = z.string().regex(/^[a-f0-9]{40}$/)
const pathSchema = z
  .string()
  .min(1)
  .refine((path) => !path.startsWith("/") && !path.split("/").some((part) => part === ".."))
const treeEntrySchema = z.object({
  path: pathSchema,
  mode: z.literal("100644"),
  type: z.literal("blob"),
  sha: shaSchema.nullable().optional(),
  content: z.string().optional(),
})
const treeRequestSchema = z.object({
  base_tree: shaSchema.optional(),
  tree: z.array(treeEntrySchema),
})
const reviewCommentRequestSchema = z.object({
  body: z.string().min(1),
  commit_id: shaSchema,
  path: pathSchema,
  line: z.number().int().positive(),
  side: z.literal("RIGHT"),
  start_line: z.number().int().positive().optional(),
  start_side: z.literal("RIGHT").optional(),
})
const graphqlSchema = z.object({
  query: z.string(),
  variables: z.record(z.string(), z.unknown()).default({}),
})

class HttpFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface FakeGitHubOptions {
  readonly owner?: string
  readonly repository?: string
  readonly now?: () => number
  readonly requireApproval?: boolean
}
export interface FakeGitHub {
  readonly url: string
  readonly state: FakeGitHubState
  readonly defaultToken: string
  readonly reviewerToken: string
  readonly oauthUrl: string
  seed(branch: string, files: Readonly<Record<string, string | Uint8Array>>): string
  grantToken(token: string, identity: FakeIdentity): void
  grantCode(code: string, codeVerifier: string, redirectUri: string, identity: FakeIdentity): void
  grantChallenge(code: string, challenge: string, redirectUri: string, identity: FakeIdentity): void
  inject(failure: FakeFailure): void
  stop(): void
}

export function startFakeGitHub(options: FakeGitHubOptions = {}): FakeGitHub {
  const state = createState()
  const owner = options.owner ?? "Hyper-Accel"
  const repository = options.repository ?? "hyper-accel.github.io"
  const prefix = `/repos/${owner}/${repository}`
  const now = options.now ?? Date.now
  const requireApproval = options.requireApproval ?? true
  const defaultToken = "fake-author-token"
  const reviewerToken = "fake-reviewer-token"
  const identity: FakeIdentity = {
    login: "author",
    id: 1,
    permission: "write",
    expiresAt: now() + 8 * 60 * 60 * 1000,
  }
  state.tokens.set(defaultToken, identity)
  state.tokens.set(reviewerToken, { ...identity, id: 2, login: "reviewer" })
  seedBranch(state, "main", {})
  const codes = new Map<
    string,
    { challenge: string; redirectUri: string; identity: FakeIdentity }
  >()
  let nextId = 1
  const pkce = (verifier: string): string =>
    new Bun.CryptoHasher("sha256").update(verifier).digest("base64url")

  function pull(number: number): FakePull {
    const result = state.pulls.get(number)
    if (!result) throw new HttpFailure(404, "Pull request not found")
    return result
  }
  function head(pr: FakePull): string {
    const sha = state.refs.get(`heads/${pr.head}`)
    if (!sha) throw new HttpFailure(422, "Head branch does not exist")
    return sha
  }
  function pullResponse(pr: FakePull): object {
    return {
      ...pr,
      user: { login: pr.author },
      head: { ref: pr.head, sha: head(pr) },
      base: { ref: pr.base, sha: state.refs.get(`heads/${pr.base}`) },
      mergeable: isAncestor(state, state.refs.get(`heads/${pr.base}`) ?? "", head(pr)),
    }
  }
  function paginate<T>(items: readonly T[], url: URL): readonly T[] {
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1))
    const size = Math.min(100, Math.max(1, Number(url.searchParams.get("per_page") ?? 30)))
    return items.slice((page - 1) * size, page * size)
  }
  function refResponse(ref: string, sha: string): object {
    return { ref: `refs/${ref}`, object: { type: "commit", sha } }
  }
  function textAt(sha: string, path: string): string {
    const entry = filesAt(state, sha).find((file) => file.path === path)
    const blob = entry ? state.blobs.get(entry.sha) : undefined
    return blob ? Buffer.from(blob.content, "base64").toString("utf8") : ""
  }
  function assertDiffRange(pr: FakePull, path: string, start: number, end: number): void {
    const before = textAt(state.refs.get(`heads/${pr.base}`) ?? "", path).split("\n")
    const after = textAt(head(pr), path).split("\n")
    let first = 0
    while (first < before.length && first < after.length && before[first] === after[first]) {
      first += 1
    }
    let oldEnd = before.length
    let newEnd = after.length
    while (oldEnd > first && newEnd > first && before[oldEnd - 1] === after[newEnd - 1]) {
      oldEnd -= 1
      newEnd -= 1
    }
    if (start > end || start <= first || end > newEnd) {
      throw new HttpFailure(422, "Line range is outside the diff")
    }
  }
  function addComment(
    pr: FakePull,
    user: FakeIdentity,
    kind: "issue" | "review",
    body: string,
    extra: Partial<
      Pick<
        FakeComment,
        "commit_id" | "path" | "line" | "start_line" | "side" | "start_side" | "in_reply_to_id"
      >
    > = {},
  ): FakeComment {
    const id = nextId++
    const comment: FakeComment = {
      id,
      node_id: `COMMENT_${id}`,
      pull: pr.number,
      user: { login: user.login },
      body,
      created_at: new Date(now()).toISOString(),
      kind,
      ...extra,
    }
    state.comments.set(id, comment)
    if (kind === "review" && !extra.in_reply_to_id) {
      state.threads.set(`THREAD_${id}`, {
        id: `THREAD_${id}`,
        pull: pr.number,
        root: id,
        isResolved: false,
      })
    }
    return comment
  }

  async function route(request: Request, url: URL, user: FakeIdentity): Promise<Response> {
    const method = request.method
    const pathname = decodeURIComponent(url.pathname)
    const path = pathname.slice(prefix.length)
    const json = (value: unknown, status = 200): Response => Response.json(value, { status })
    const body = async (): Promise<unknown> => request.json()
    if (pathname === "/user" && method === "GET") {
      return json({ login: user.login, id: user.id })
    }
    if (pathname === "/graphql" && method === "POST") {
      const input = graphqlSchema.parse(await body())
      const variables = input.variables
      const graphInput = z.record(z.string(), z.unknown()).parse(variables["input"] ?? variables)
      const canWrite = user.permission !== "read"
      if (
        input.query.includes("resolveReviewThread") ||
        input.query.includes("unresolveReviewThread")
      ) {
        if (!canWrite) throw new HttpFailure(403, "Write access required")
        const threadId = z.string().parse(graphInput["threadId"])
        const thread = state.threads.get(threadId)
        if (!thread) throw new HttpFailure(404, "Thread not found")
        const operation = input.query.includes("unresolveReviewThread")
          ? "unresolveReviewThread"
          : "resolveReviewThread"
        thread.isResolved = operation === "resolveReviewThread"
        return json({
          data: { [operation]: { thread: { id: thread.id, isResolved: thread.isResolved } } },
        })
      }
      if (input.query.includes("markPullRequestReadyForReview")) {
        if (!canWrite) throw new HttpFailure(403, "Write access required")
        const id = z.string().parse(graphInput["pullRequestId"])
        const pr = [...state.pulls.values()].find((value) => value.node_id === id)
        if (pr?.state !== "open") throw new HttpFailure(422, "Open pull required")
        pr.draft = false
        return json({
          data: { markPullRequestReadyForReview: { pullRequest: { id, isDraft: false } } },
        })
      }
      if (input.query.includes("reviewThreads")) {
        const number = z
          .number()
          .int()
          .parse(variables["number"] ?? variables["pullNumber"])
        const pr = pull(number)
        const nodes = [...state.threads.values()]
          .filter((thread) => thread.pull === number)
          .map((thread) => {
            const root = state.comments.get(thread.root)
            const comments = [...state.comments.values()]
              .filter(
                (comment) => comment.id === thread.root || comment.in_reply_to_id === thread.root,
              )
              .map((comment) => ({
                ...comment,
                databaseId: comment.id,
                id: comment.node_id,
                author: comment.user,
                createdAt: comment.created_at,
              }))
            return {
              ...thread,
              isOutdated: root?.commit_id !== head(pr),
              path: root?.path,
              line: root?.line,
              startLine: root?.start_line,
              comments: { nodes: comments, edges: comments.map((node) => ({ node })) },
            }
          })
        return json({
          data: {
            repository: {
              pullRequest: {
                id: pr.node_id,
                isDraft: pr.draft,
                reviewThreads: {
                  nodes,
                  edges: nodes.map((node) => ({ node })),
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        })
      }
      throw new HttpFailure(422, "Unsupported GraphQL operation")
    }
    if (!pathname.startsWith(`${prefix}/`) && pathname !== prefix) {
      throw new HttpFailure(404, "Repository not found")
    }
    if (method !== "GET" && user.permission === "read") {
      throw new HttpFailure(403, "Write access required")
    }
    if (path === "" && method === "GET") {
      return json({
        name: repository,
        full_name: `${owner}/${repository}`,
        private: false,
        default_branch: "main",
        permissions: {
          pull: true,
          push: user.permission !== "read",
          admin: user.permission === "admin",
        },
      })
    }
    const permission = /^\/collaborators\/([^/]+)\/permission$/.exec(path)
    if (permission && method === "GET") {
      const member = [...state.tokens.values()].find((token) => token.login === permission[1])
      return json({ permission: member?.permission ?? "none", user: { login: permission[1] } })
    }
    if (path === "/git/blobs" && method === "POST") {
      const input = z
        .object({ content: z.string(), encoding: z.enum(["utf-8", "base64"]) })
        .parse(await body())
      return json(
        putBlob(state, Buffer.from(input.content, input.encoding === "base64" ? "base64" : "utf8")),
        201,
      )
    }
    const object = /^\/git\/(blobs|trees|commits)\/([a-f0-9]{40})$/.exec(path)
    if (object && method === "GET") {
      const sha = object[2] ?? ""
      const result =
        object[1] === "blobs"
          ? state.blobs.get(sha)
          : object[1] === "trees"
            ? state.trees.get(sha)
            : state.commits.get(sha)
      if (!result) throw new HttpFailure(404, "Git object not found")
      return json(result)
    }
    if (path === "/git/trees" && method === "POST") {
      const input = treeRequestSchema.parse(await body())
      const base = input.base_tree ? state.trees.get(input.base_tree) : undefined
      if (input.base_tree && !base) throw new HttpFailure(422, "Base tree not found")
      const entries = new Map((base?.tree ?? []).map((entry) => [entry.path, entry]))
      for (const entry of input.tree) {
        if (entry.sha === null) {
          if (!entries.delete(entry.path)) throw new HttpFailure(422, "Deleted path not found")
        } else {
          if ((entry.content !== undefined) === (entry.sha !== undefined)) {
            throw new HttpFailure(422, "Specify exactly one of sha or content")
          }
          const sha =
            entry.content === undefined ? entry.sha : putBlob(state, Buffer.from(entry.content)).sha
          if (!sha || !state.blobs.has(sha)) throw new HttpFailure(422, "Blob not found")
          entries.set(entry.path, { path: entry.path, mode: "100644", type: "blob", sha })
        }
      }
      return json(putTree(state, [...entries.values()]), 201)
    }
    if (path === "/git/commits" && method === "POST") {
      const input = z
        .object({ message: z.string(), tree: shaSchema, parents: z.array(shaSchema) })
        .parse(await body())
      if (!state.trees.has(input.tree) || input.parents.some((sha) => !state.commits.has(sha))) {
        throw new HttpFailure(422, "Unknown tree or parent")
      }
      return json(putCommit(state, input.tree, input.parents, input.message), 201)
    }
    if (path === "/git/refs" && method === "POST") {
      const input = z
        .object({ ref: z.string().startsWith("refs/heads/"), sha: shaSchema })
        .parse(await body())
      const ref = input.ref.slice(5)
      if (state.refs.has(ref)) throw new HttpFailure(422, "Reference already exists")
      if (!state.commits.has(input.sha)) throw new HttpFailure(422, "Unknown commit")
      state.refs.set(ref, input.sha)
      return json(refResponse(ref, input.sha), 201)
    }
    const reference = /^\/git\/refs?\/(heads\/.+)$/.exec(path)
    if (reference) {
      const ref = reference[1] ?? ""
      const current = state.refs.get(ref)
      if (!current) throw new HttpFailure(404, "Reference not found")
      if (method === "GET") return json(refResponse(ref, current))
      if (method === "PATCH") {
        const input = z
          .object({ sha: shaSchema, force: z.boolean().default(false) })
          .parse(await body())
        if (!state.commits.has(input.sha)) throw new HttpFailure(422, "Unknown commit")
        const latest = state.refs.get(ref)
        if (!latest) throw new HttpFailure(404, "Reference not found")
        if (!input.force && !isAncestor(state, latest, input.sha)) {
          throw new HttpFailure(422, "Update is not a fast forward")
        }
        state.refs.set(ref, input.sha)
        return json(refResponse(ref, input.sha))
      }
      if (method === "DELETE") {
        if (ref === "heads/main") throw new HttpFailure(422, "Cannot delete default branch")
        state.refs.delete(ref)
        return new Response(null, { status: 204 })
      }
    }
    if (path.startsWith("/git/matching-refs/") && method === "GET") {
      const prefix = path.slice("/git/matching-refs/".length)
      return json(
        [...state.refs]
          .filter(([ref]) => ref.startsWith(prefix))
          .map(([ref, sha]) => refResponse(ref, sha)),
      )
    }
    if (path.startsWith("/contents/") && method === "GET") {
      const filePath = path.slice("/contents/".length)
      const ref = url.searchParams.get("ref") ?? "main"
      const sha = state.refs.get(`heads/${ref}`) ?? ref
      const file = filesAt(state, sha).find((entry) => entry.path === filePath)
      const blob = file ? state.blobs.get(file.sha) : undefined
      if (!file || !blob) throw new HttpFailure(404, "File not found")
      return json({ ...blob, path: filePath, name: filePath.split("/").at(-1), type: "file" })
    }
    if (path === "/pulls" && method === "GET") {
      const requestedState = url.searchParams.get("state") ?? "open"
      const requestedHead = url.searchParams.get("head")?.split(":").at(-1)
      const requestedBase = url.searchParams.get("base")
      return json(
        paginate(
          [...state.pulls.values()].filter(
            (pr) =>
              (requestedState === "all" || pr.state === requestedState) &&
              (!requestedHead || pr.head === requestedHead) &&
              (!requestedBase || pr.base === requestedBase),
          ),
          url,
        ).map(pullResponse),
      )
    }
    if (path === "/pulls" && method === "POST") {
      const input = z
        .object({
          title: z.string().min(1),
          head: z.string(),
          base: z.string(),
          body: z.string().default(""),
          draft: z.boolean().default(false),
        })
        .parse(await body())
      const branch = input.head.split(":").at(-1) ?? input.head
      if (!state.refs.has(`heads/${branch}`) || !state.refs.has(`heads/${input.base}`)) {
        throw new HttpFailure(422, "Branch not found")
      }
      if (
        [...state.pulls.values()].some(
          (pr) => pr.head === branch && pr.base === input.base && pr.state === "open",
        )
      ) {
        throw new HttpFailure(422, "Pull request already exists")
      }
      if (state.refs.get(`heads/${branch}`) === state.refs.get(`heads/${input.base}`)) {
        throw new HttpFailure(422, "No commits between branches")
      }
      const number = nextId++
      const pr: FakePull = {
        ...input,
        head: branch,
        number,
        node_id: `PR_${number}`,
        author: user.login,
        state: "open",
        merged: false,
      }
      state.pulls.set(number, pr)
      return json(pullResponse(pr), 201)
    }
    const pullPath = /^\/pulls\/(\d+)(\/.*)?$/.exec(path)
    if (pullPath) {
      const pr = pull(Number(pullPath[1]))
      const suffix = pullPath[2] ?? ""
      if (suffix === "" && method === "GET") return json(pullResponse(pr))
      if (suffix === "" && method === "PATCH") {
        const input = z
          .object({
            title: z.string().optional(),
            body: z.string().optional(),
            state: z.enum(["open", "closed"]).optional(),
          })
          .parse(await body())
        if (input.title !== undefined) pr.title = input.title
        if (input.body !== undefined) pr.body = input.body
        if (input.state !== undefined) pr.state = input.state
        return json(pullResponse(pr))
      }
      if (suffix === "/comments" && method === "GET") {
        return json(
          paginate(
            [...state.comments.values()].filter((c) => c.pull === pr.number && c.kind === "review"),
            url,
          ),
        )
      }
      if (suffix === "/comments" && method === "POST") {
        const input = reviewCommentRequestSchema.parse(await body())
        if (pr.state !== "open") throw new HttpFailure(422, "Pull is closed")
        if (input.commit_id !== head(pr))
          throw new HttpFailure(422, "Comment must target current head")
        if ((input.start_line === undefined) !== (input.start_side === undefined)) {
          throw new HttpFailure(422, "start_line and start_side must be paired")
        }
        assertDiffRange(pr, input.path, input.start_line ?? input.line, input.line)
        return json(
          addComment(pr, user, "review", input.body, {
            commit_id: input.commit_id,
            path: input.path,
            line: input.line,
            side: input.side,
            ...(input.start_line === undefined ? {} : { start_line: input.start_line }),
            ...(input.start_side === undefined ? {} : { start_side: input.start_side }),
          }),
          201,
        )
      }
      const reply = /^\/comments\/(\d+)\/replies$/.exec(suffix)
      if (reply && method === "POST") {
        const root = state.comments.get(Number(reply[1]))
        if (!root || root.pull !== pr.number || root.kind !== "review" || root.in_reply_to_id) {
          throw new HttpFailure(422, "Root review comment not found")
        }
        const input = z.object({ body: z.string().min(1) }).parse(await body())
        return json(addComment(pr, user, "review", input.body, { in_reply_to_id: root.id }), 201)
      }
      if (suffix === "/reviews" && method === "GET") {
        return json(
          paginate(
            [...state.reviews.values()].filter((review) => review.pull === pr.number),
            url,
          ),
        )
      }
      if (suffix === "/reviews" && method === "POST") {
        const input = z
          .object({
            event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
            commit_id: shaSchema.optional(),
            body: z.string().default(""),
          })
          .parse(await body())
        if (pr.state !== "open") throw new HttpFailure(422, "Pull is closed")
        if (input.event === "APPROVE" && user.login === pr.author) {
          throw new HttpFailure(422, "Authors cannot approve their own pull requests")
        }
        const commit = input.commit_id ?? head(pr)
        if (!isAncestor(state, commit, head(pr)))
          throw new HttpFailure(422, "Review commit is not in pull")
        const review = {
          id: nextId++,
          pull: pr.number,
          user: { login: user.login },
          commit_id: commit,
          state:
            input.event === "APPROVE"
              ? ("APPROVED" as const)
              : input.event === "REQUEST_CHANGES"
                ? ("CHANGES_REQUESTED" as const)
                : ("COMMENTED" as const),
          body: input.body,
        }
        state.reviews.set(review.id, review)
        return json(review, 200)
      }
      if (suffix === "/merge" && method === "PUT") {
        const input = z
          .object({ sha: shaSchema, merge_method: z.literal("squash") })
          .parse(await body())
        if (pr.state !== "open" || pr.draft)
          throw new HttpFailure(405, "Pull is not ready to merge")
        if (input.sha !== head(pr)) throw new HttpFailure(409, "Head SHA changed")
        const reviews = new Map<string, string>()
        for (const review of state.reviews.values()) {
          if (
            review.pull === pr.number &&
            review.commit_id === head(pr) &&
            review.state !== "COMMENTED"
          ) {
            reviews.set(review.user.login, review.state)
          }
        }
        if (
          requireApproval &&
          (!Array.from(reviews.values()).includes("APPROVED") ||
            Array.from(reviews.values()).includes("CHANGES_REQUESTED"))
        ) {
          throw new HttpFailure(405, "Current head requires approval")
        }
        const base = state.refs.get(`heads/${pr.base}`)
        const commit = state.commits.get(head(pr))
        if (!base || !commit) throw new HttpFailure(422, "Missing merge objects")
        if (!isAncestor(state, base, head(pr)))
          throw new HttpFailure(409, "Base advanced; update branch before merge")
        const merged = putCommit(state, commit.tree.sha, [base], `Squash ${pr.title}`)
        state.refs.set(`heads/${pr.base}`, merged.sha)
        pr.merged = true
        pr.state = "closed"
        return json({ sha: merged.sha, merged: true, message: "Pull Request successfully merged" })
      }
    }
    const issueComments = /^\/issues\/(\d+)\/comments$/.exec(path)
    if (issueComments) {
      const pr = pull(Number(issueComments[1]))
      if (method === "GET")
        return json(
          paginate(
            [...state.comments.values()].filter((c) => c.pull === pr.number && c.kind === "issue"),
            url,
          ),
        )
      if (method === "POST") {
        const input = z.object({ body: z.string().min(1) }).parse(await body())
        return json(addComment(pr, user, "issue", input.body), 201)
      }
    }
    const commentPath = /^\/(issues|pulls)\/comments\/(\d+)$/.exec(path)
    if (commentPath) {
      const comment = state.comments.get(Number(commentPath[2]))
      if (!comment || comment.kind !== (commentPath[1] === "issues" ? "issue" : "review")) {
        throw new HttpFailure(404, "Comment not found")
      }
      if (method === "GET") return json(comment)
      if (method === "PATCH") {
        if (comment.user.login !== user.login && user.permission !== "admin")
          throw new HttpFailure(403, "Comment belongs to another user")
        comment.body = z.object({ body: z.string().min(1) }).parse(await body()).body
        return json(comment)
      }
    }
    throw new HttpFailure(404, `Unsupported route: ${method} ${path}`)
  }

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type, x-github-api-version",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
      }
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers })
      try {
        const injectionIndex = state.failures.findIndex(
          (failure) => failure.method === request.method && failure.path === url.pathname,
        )
        const injection =
          injectionIndex < 0 ? undefined : state.failures.splice(injectionIndex, 1)[0]
        const injected = (): Response =>
          Response.json(
            {
              message: "Injected test failure",
              mutationApplied: injection?.afterMutation ?? false,
            },
            {
              status: injection?.status ?? 500,
              headers: {
                ...headers,
                "Retry-After": "1",
                "X-RateLimit-Reset": String(Math.ceil(now() / 1000) + 1),
              },
            },
          )
        if (injection && !injection.afterMutation) return injected()
        if (url.pathname === "/oauth/token" && request.method === "POST") {
          const input = tokenExchangeRequestSchema.parse(await request.json())
          const grant = codes.get(input.code)
          if (
            !grant ||
            grant.challenge !== pkce(input.codeVerifier) ||
            grant.redirectUri !== input.redirectUri
          ) {
            throw new HttpFailure(401, "Invalid authorization code or PKCE verifier")
          }
          codes.delete(input.code)
          const accessToken = `fake-oauth-${nextId++}`
          state.tokens.set(accessToken, {
            ...grant.identity,
            expiresAt: now() + 8 * 60 * 60 * 1000,
          })
          return Response.json({ accessToken, tokenType: "bearer", expiresIn: 28800 }, { headers })
        }
        const token = request.headers.get("authorization")?.replace(/^(Bearer|token) /i, "")
        const user = token ? state.tokens.get(token) : undefined
        if (!user || user.expiresAt <= now()) throw new HttpFailure(401, "Bad credentials")
        const result = await route(request, url, user)
        if (injection?.afterMutation && result.ok) return injected()
        for (const [key, value] of Object.entries(headers)) result.headers.set(key, value)
        return result
      } catch (error: unknown) {
        if (error instanceof HttpFailure) {
          return Response.json({ message: error.message }, { status: error.status, headers })
        }
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          return Response.json({ message: "Validation failed" }, { status: 422, headers })
        }
        throw error
      }
    },
  })
  return {
    url: server.url.origin,
    oauthUrl: `${server.url.origin}/oauth/token`,
    state,
    defaultToken,
    reviewerToken,
    seed: (branch, files) => seedBranch(state, branch, files),
    grantToken: (token, user) => {
      state.tokens.set(token, user)
    },
    grantCode: (code, verifier, redirectUri, user) => {
      codes.set(code, { challenge: pkce(verifier), redirectUri, identity: user })
    },
    grantChallenge: (code, challenge, redirectUri, user) => {
      codes.set(code, { challenge, redirectUri, identity: user })
    },
    inject: (failure) => {
      state.failures.push(failure)
    },
    stop: () => {
      server.stop(true)
    },
  }
}
