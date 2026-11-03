import { z } from "zod"
import { gitShaSchema } from "../../shared/onsite/document"
import {
  RANGE_METADATA_PREFIX,
  RANGE_METADATA_SUFFIX,
  type RangeAnchor,
  type ReviewComment,
  type ReviewThread,
  rangeAnchorSchema,
  reviewThreadSchema,
} from "../../shared/onsite/review"
import { GitHubFailure, type GitHubHttp, type HttpOptions, invalid, unknownOutcome } from "./http"
import { commentResponse, pullResponse, threadsResponse, type WireComment } from "./wire"

const metadataSchema = z.object({
  kind: z.enum(["root", "reply", "state"]),
  operationId: z.string(),
  anchor: rangeAnchorSchema,
  commitSha: gitShaSchema,
  rootCommentId: z.number().int().positive().optional(),
  resolved: z.boolean().optional(),
})
type Metadata = z.infer<typeof metadataSchema>

function metadata(body: string): { readonly body: string; readonly value: Metadata } | undefined {
  const start = body.lastIndexOf(RANGE_METADATA_PREFIX)
  if (start < 0 || !body.endsWith(RANGE_METADATA_SUFFIX)) return undefined
  const json = body.slice(start + RANGE_METADATA_PREFIX.length, -RANGE_METADATA_SUFFIX.length)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
  const value = metadataSchema.safeParse(parsed)
  return value.success ? { body: body.slice(0, start).trimEnd(), value: value.data } : undefined
}

function withMetadata(body: string, value: Metadata): string {
  const json = JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")
  return `${body}\n\n${RANGE_METADATA_PREFIX}${json}${RANGE_METADATA_SUFFIX}`
}

function comment(value: WireComment): ReviewComment {
  return {
    id: value.id,
    author: value.user?.login ?? "ghost",
    body: metadata(value.body)?.body ?? value.body,
    createdAt: value.created_at,
  }
}

function validateBody(body: string): void {
  if (!body.trim()) invalid("A comment body is required.", ["body"])
}

export class Discussions {
  // IDs survive an ambiguous outcome within this adapter, allowing exact read-back matching.
  private readonly operations = new Map<string, string>()

  constructor(
    private readonly http: GitHubHttp,
    private readonly options: HttpOptions,
    private readonly checkedPull: (
      number: number,
      sha: string,
    ) => Promise<z.infer<typeof pullResponse>>,
  ) {}

  async list(pullNumber: number): Promise<ReviewThread[]> {
    z.number().int().positive().parse(pullNumber)
    const pr = await this.http.request(`${this.http.repo}/pulls/${pullNumber}`, pullResponse, {
      fresh: true,
    })
    const native = await this.http.list(
      `${this.http.repo}/pulls/${pullNumber}/comments`,
      commentResponse,
      true,
    )
    const issues = await this.http.list(
      `${this.http.repo}/issues/${pullNumber}/comments`,
      commentResponse,
      true,
    )
    const threads: ReviewThread[] = []
    let cursor: string | null = null
    for (;;) {
      const data: z.infer<typeof threadsResponse> = await this.http.graph(
        `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
          repository(owner: $owner, name: $name) {
            pullRequest(number: $number) {
              reviewThreads(first: 100, after: $cursor) {
                nodes { id isResolved isOutdated comments(first: 1) { nodes { databaseId } } }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        }`,
        { owner: this.options.owner, name: this.options.repository, number: pullNumber, cursor },
        threadsResponse,
      )
      const connection = data.repository.pullRequest.reviewThreads
      for (const thread of connection.nodes) {
        const rootId = thread.comments.nodes[0]?.databaseId
        const root = native.find((entry) => entry.id === rootId)
        const anchor = root ? metadata(root.body)?.value : undefined
        if (!root || anchor?.kind !== "root") continue
        threads.push({
          id: thread.id,
          pullNumber,
          storage: "review",
          rootCommentId: root.id,
          anchor: anchor.anchor,
          commitSha: root.commit_id ?? anchor.commitSha,
          resolved: thread.isResolved,
          outdated: thread.isOutdated,
          comments: native
            .filter((entry) => entry.id === root.id || entry.in_reply_to_id === root.id)
            .sort((a, b) => a.id - b.id)
            .map(comment),
        })
      }
      if (!connection.pageInfo.hasNextPage) break
      if (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === cursor) {
        invalid("GitHub returned an invalid review-thread cursor.")
      }
      cursor = connection.pageInfo.endCursor
    }
    const events = issues
      .map((entry) => ({ entry, meta: metadata(entry.body)?.value }))
      .sort((a, b) => a.entry.id - b.entry.id)
    for (const root of events) {
      if (root.meta?.kind !== "root") continue
      const related = events.filter((event) => event.meta?.rootCommentId === root.entry.id)
      const state = related.filter((event) => event.meta?.kind === "state").at(-1)
      threads.push({
        id: `issue:${root.entry.id}`,
        pullNumber,
        storage: "issue",
        rootCommentId: root.entry.id,
        anchor: root.meta.anchor,
        commitSha: root.meta.commitSha,
        resolved: state?.meta?.resolved ?? false,
        outdated: root.meta.commitSha !== pr.head.sha,
        comments: [
          comment(root.entry),
          ...related
            .filter((event) => event.meta?.kind === "reply")
            .map((event) => comment(event.entry)),
        ],
      })
    }
    return threads.sort((a, b) => a.rootCommentId - b.rootCommentId)
  }

  async add(
    pullNumber: number,
    sha: string,
    anchor: RangeAnchor,
    body: string,
  ): Promise<ReviewThread> {
    rangeAnchorSchema.parse(anchor)
    validateBody(body)
    const pr = await this.checkedPull(pullNumber, sha)
    if (
      !pr.head.ref.startsWith("post/") ||
      !anchor.markdown.path.startsWith(`content/posts/${pr.head.ref.slice(5)}/`)
    )
      invalid("The comment anchor must belong to the pull request's post.", ["path"])
    const key = JSON.stringify(["root", pullNumber, sha, anchor, body])
    const operationId = this.operation(key)
    const wireBody = withMetadata(body, { kind: "root", operationId, anchor, commitSha: sha })
    const readBack = async (): Promise<WireComment | undefined> => {
      for (const source of ["pulls", "issues"]) {
        const comments = await this.http.list(
          `${this.http.repo}/${source}/${pullNumber}/comments`,
          commentResponse,
          true,
        )
        const existing = comments.find(
          (entry) => metadata(entry.body)?.value.operationId === operationId,
        )
        if (existing) return existing
      }
      return undefined
    }
    // A successful write followed by a failed thread lookup must also reconcile on re-entry.
    let posted = await readBack()
    if (!posted) {
      posted = await this.http.reconcile(
        key,
        async () => {
          const { start_line, start_side, ...range } = anchor.markdown
          try {
            return await this.http.request(
              `${this.http.repo}/pulls/${pullNumber}/comments`,
              commentResponse,
              {
                method: "POST",
                body: {
                  body: wireBody,
                  commit_id: sha,
                  ...range,
                  ...(start_line === range.line ? {} : { start_line, start_side }),
                },
              },
            )
          } catch (error: unknown) {
            if (!(error instanceof GitHubFailure)) throw error
            if (
              error.status !== 422 ||
              !(
                /outside the diff|diff hunk|line|position/i.test(
                  JSON.stringify(error.payload ?? error.message),
                ) ||
                (error.detail.kind === "validation" &&
                  error.detail.fields.some((field) =>
                    ["line", "start_line", "position"].includes(field),
                  ))
              )
            )
              throw error
            await this.checkedPull(pullNumber, sha)
            return this.http.request(
              `${this.http.repo}/issues/${pullNumber}/comments`,
              commentResponse,
              {
                method: "POST",
                body: { body: wireBody },
              },
            )
          }
        },
        readBack,
      )
    }
    let threads: ReviewThread[]
    try {
      threads = await this.list(pullNumber)
    } catch (error: unknown) {
      if (error instanceof GitHubFailure || error instanceof z.ZodError) unknownOutcome()
      throw error
    }
    const thread = threads.find((entry) => entry.rootCommentId === posted.id)
    if (!thread) unknownOutcome()
    this.operations.delete(key)
    return thread
  }

  async reply(thread: ReviewThread, body: string): Promise<ReviewComment> {
    reviewThreadSchema.parse(thread)
    validateBody(body)
    const key = JSON.stringify(["reply", thread.id, thread.pullNumber, body])
    const operationId = this.operation(key)
    const wireBody = withMetadata(body, {
      kind: "reply",
      operationId,
      anchor: thread.anchor,
      commitSha: thread.commitSha,
      rootCommentId: thread.rootCommentId,
    })
    const source = thread.storage === "review" ? "pulls" : "issues"
    const path =
      thread.storage === "review"
        ? `${this.http.repo}/pulls/${thread.pullNumber}/comments/${thread.rootCommentId}/replies`
        : `${this.http.repo}/issues/${thread.pullNumber}/comments`
    const posted = await this.http.reconcile(
      key,
      () => this.http.request(path, commentResponse, { method: "POST", body: { body: wireBody } }),
      async () =>
        (
          await this.http.list(
            `${this.http.repo}/${source}/${thread.pullNumber}/comments`,
            commentResponse,
            true,
          )
        ).find((entry) => metadata(entry.body)?.value.operationId === operationId),
    )
    this.operations.delete(key)
    return comment(posted)
  }

  async resolve(thread: ReviewThread, resolved: boolean): Promise<ReviewThread> {
    reviewThreadSchema.parse(thread)
    const key = JSON.stringify(["state", thread.id, thread.pullNumber, resolved])
    const readBack = async (): Promise<ReviewThread | undefined> =>
      (await this.list(thread.pullNumber)).find(
        (entry) => entry.id === thread.id && entry.resolved === resolved,
      )
    const current = await readBack()
    if (current) return current
    if (thread.storage === "review") {
      const operation = resolved ? "resolveReviewThread" : "unresolveReviewThread"
      const inputType = resolved ? "ResolveReviewThreadInput" : "UnresolveReviewThreadInput"
      await this.http.reconcile(
        key,
        async () => {
          await this.http.graph(
            `mutation($input: ${inputType}!) { ${operation}(input: $input) { thread { id isResolved } } }`,
            { input: { threadId: thread.id } },
            z.record(
              z.string(),
              z.object({ thread: z.object({ id: z.string(), isResolved: z.boolean() }) }),
            ),
            true,
          )
          return { ...thread, resolved }
        },
        readBack,
      )
    } else {
      const operationId = this.operation(key)
      // Append a state event: GitHub does not allow a reviewer to edit another author's comment.
      await this.http.reconcile(
        key,
        async () => {
          await this.http.request(
            `${this.http.repo}/issues/${thread.pullNumber}/comments`,
            commentResponse,
            {
              method: "POST",
              body: {
                body: withMetadata(resolved ? "Resolved." : "Reopened.", {
                  kind: "state",
                  operationId,
                  rootCommentId: thread.rootCommentId,
                  anchor: thread.anchor,
                  commitSha: thread.commitSha,
                  resolved,
                }),
              },
            },
          )
          return { ...thread, resolved }
        },
        readBack,
      )
      this.operations.delete(key)
    }
    return { ...thread, resolved }
  }

  private operation(key: string): string {
    const existing = this.operations.get(key)
    if (existing) return existing
    const id = crypto.randomUUID()
    this.operations.set(key, id)
    return id
  }
}
