import { z } from "zod"
import type { AuthSession } from "../../shared/onsite/auth"
import {
  type BundleFile,
  type BundleImage,
  bundleFileSchema,
  type DocumentCodec,
  gitShaSchema,
  imagePathSchema,
  newSlugSchema,
  type PostBundle,
  slugSchema,
} from "../../shared/onsite/document"
import {
  type CommitReceipt,
  type DraftPullRequest,
  draftPullRequestSchema,
  type GitHubAdapter,
  type GitHubResult,
  type PullState,
} from "../../shared/onsite/github"
import type { RangeAnchor, ReviewComment, ReviewThread } from "../../shared/onsite/review"
import {
  conflict,
  GitHubFailure,
  GitHubHttp,
  type HttpOptions,
  invalid,
  result,
  unknownOutcome,
} from "./http"
import { Discussions } from "./threads"
import {
  commitResponse,
  pullResponse,
  refResponse,
  repositoryResponse,
  reviewResponse,
  shaResponse,
  userResponse,
} from "./wire"

export interface GitHubAdapterOptions extends HttpOptions {
  readonly codec: Pick<DocumentCodec, "parse">
  // The memory-token contract exposes no expiry getter. Auth supplies the real expiry.
  readonly expiresAt: () => number
}

const contentResponse = z.object({ content: z.string(), encoding: z.literal("base64") })
const treeResponse = z.object({
  tree: z.array(z.object({ path: z.string(), type: z.string(), sha: gitShaSchema })),
  truncated: z.boolean().optional(),
})

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/")
}

function draft(pr: z.infer<typeof pullResponse>): DraftPullRequest {
  return draftPullRequestSchema.parse({
    number: pr.number,
    nodeId: pr.node_id,
    slug: pr.head.ref.slice("post/".length),
    branch: pr.head.ref,
    headSha: pr.head.sha,
    draft: pr.draft,
    state: pr.merged ? "merged" : pr.state,
  })
}

const AUTHOR_PROFILE = /^content\/authors\/[A-Za-z][A-Za-z .'-]*[A-Za-z]\/_index(?:\.en)?\.md$/

function validateFiles(slug: string, files: readonly BundleFile[]): void {
  slugSchema.parse(slug)
  z.array(bundleFileSchema).min(1).parse(files)
  const prefix = `content/posts/${slug}/`
  const paths = new Set<string>()
  for (const file of files) {
    // A post may bring the profile of a new author it names (content/authors/<Name>/_index*.md).
    if (AUTHOR_PROFILE.test(file.path)) {
      if (paths.has(file.path) || file.encoding !== "utf-8")
        invalid("Author profiles must be unique UTF-8 Markdown.", [file.path])
      paths.add(file.path)
      continue
    }
    const relative = file.path.startsWith(prefix) ? file.path.slice(prefix.length) : ""
    const markdown =
      relative === "index.md" || relative === "index.ko.md" || relative === "index.en.md"
    if ((!markdown && !imagePathSchema.safeParse(relative).success) || paths.has(file.path)) {
      invalid("Bundle paths must be unique and belong to this post.", [file.path])
    }
    paths.add(file.path)
    if (
      file.encoding !== "delete" &&
      (markdown ? file.encoding !== "utf-8" : file.encoding !== "base64")
    ) {
      invalid("Markdown requires UTF-8; images require base64.", [file.path])
    }
    if (
      file.encoding === "base64" &&
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)
    ) {
      invalid("Invalid base64 image.", [file.path])
    }
  }
}

export class FetchGitHubAdapter implements GitHubAdapter {
  private readonly http: GitHubHttp
  private readonly discussions: Discussions
  private readonly pendingCommits = new Map<string, string>()

  constructor(private readonly options: GitHubAdapterOptions) {
    this.http = new GitHubHttp(options)
    this.discussions = new Discussions(this.http, options, (number, sha) =>
      this.checkedPull(number, sha),
    )
  }

  getAccess(): Promise<GitHubResult<AuthSession>> {
    return result(async () => {
      const user = await this.http.request("/user", userResponse)
      const repository = await this.http.request(this.http.repo, repositoryResponse)
      return {
        login: user.login,
        userId: user.id,
        expiresAt: z.number().int().positive().parse(this.options.expiresAt()),
        repository: { owner: this.options.owner, name: this.options.repository },
        canWrite: repository.permissions?.push ?? false,
      }
    })
  }

  listDrafts(): Promise<GitHubResult<readonly DraftPullRequest[]>> {
    return result(async () => (await this.openPulls()).map(draft))
  }

  getPullState(pullNumber: number): Promise<GitHubResult<PullState>> {
    return result(async () => {
      const pr = await this.pull(pullNumber)
      const reviews = await this.http.list(
        `${this.http.repo}/pulls/${pullNumber}/reviews`,
        reviewResponse,
        true,
      )
      const latest = new Map<string, z.infer<typeof reviewResponse>>()
      for (const review of reviews) {
        if (review.user && ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state)) {
          latest.set(review.user.login, review)
        }
      }
      const current = await this.pull(pullNumber)
      if (current.head.sha !== pr.head.sha) conflict(pr.head.sha, current.head.sha)
      const decisions = [...latest.values()]
      return {
        headSha: current.head.sha,
        draft: current.draft,
        approvedHeadShas: decisions.some((review) => review.state === "CHANGES_REQUESTED")
          ? []
          : [
              ...new Set(
                decisions
                  .filter((review) => review.state === "APPROVED")
                  .map((review) => review.commit_id),
              ),
            ],
        mergeable: current.mergeable ?? null,
        merged: current.merged ?? false,
      }
    })
  }

  loadBundle(slug: string, sha?: string): Promise<GitHubResult<PostBundle>> {
    return result(async () => {
      slugSchema.parse(slug)
      const head = sha
        ? gitShaSchema.parse(sha)
        : ((await this.ref(`post/${slug}`)) ?? (await this.ref(await this.defaultBranch())))
      if (!head) invalid("The repository has no default-branch head.")
      const prefix = `content/posts/${slug}/`
      const sources: string[] = []
      const paths = { ko: `${prefix}index.md`, en: `${prefix}index.en.md` }
      for (const name of ["index.md", "index.en.md"]) {
        let file: z.infer<typeof contentResponse>
        try {
          file = await this.http.request(
            `${this.http.repo}/contents/${encodePath(prefix + name)}?ref=${head}`,
            contentResponse,
          )
        } catch (error: unknown) {
          if (name !== "index.md" || !(error instanceof GitHubFailure) || error.status !== 404)
            throw error
          paths.ko = `${prefix}index.ko.md`
          file = await this.http.request(
            `${this.http.repo}/contents/${encodePath(paths.ko)}?ref=${head}`,
            contentResponse,
          )
        }
        sources.push(
          new TextDecoder("utf-8", { fatal: true }).decode(
            Uint8Array.from(atob(file.content.replace(/\s/g, "")), (char) => char.charCodeAt(0)),
          ),
        )
      }
      const commit = await this.http.request(
        `${this.http.repo}/git/commits/${head}`,
        commitResponse,
      )
      const tree = await this.http.request(
        `${this.http.repo}/git/trees/${commit.tree.sha}?recursive=1`,
        treeResponse,
      )
      if (tree.truncated) invalid("The Git tree is truncated; cannot load a complete bundle.")
      const images: BundleImage[] = []
      const mime: Readonly<Record<string, string>> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
      }
      for (const entry of tree.tree) {
        if (entry.type !== "blob" || !entry.path.startsWith(prefix)) continue
        const candidate = imagePathSchema.safeParse(entry.path.slice(prefix.length))
        if (!candidate.success) continue
        const path = candidate.data
        const extension = path.split(".").at(-1)?.toLowerCase() ?? ""
        images.push({
          status: "committed",
          path,
          sha: entry.sha,
          mime: mime[extension] ?? "application/octet-stream",
        })
      }
      const parsed = await this.options.codec.parse({
        slug,
        ko: sources[0] ?? "",
        en: sources[1] ?? "",
        images,
        headSha: head,
        paths,
      })
      if (!parsed.ok)
        invalid(
          parsed.issues.map((issue) => issue.message).join("; "),
          parsed.issues.flatMap((issue) =>
            issue.language ? [issue.code, issue.language] : [issue.code],
          ),
        )
      return parsed.bundle
    })
  }

  ensureDraftPR(
    slug: string,
    title: string,
    initialFiles?: readonly BundleFile[],
  ): Promise<GitHubResult<DraftPullRequest>> {
    return result(async () => {
      slugSchema.parse(slug)
      if (!title.trim()) invalid("A draft title is required.", ["title"])
      if (initialFiles) validateFiles(slug, initialFiles)
      const existing = await this.findPull(slug)
      if (existing) return draft(existing)
      const branch = `post/${slug}`
      const base = await this.defaultBranch()
      const baseSha = await this.ref(base)
      if (!baseSha) invalid("The default branch does not exist.")
      if (!newSlugSchema.safeParse(slug).success) {
        const commit = await this.http.request(
          `${this.http.repo}/git/commits/${baseSha}`,
          commitResponse,
        )
        const tree = await this.http.request(
          `${this.http.repo}/git/trees/${commit.tree.sha}?recursive=1`,
          treeResponse,
        )
        const prefix = `content/posts/${slug}/`
        if (
          !tree.tree.some(
            (entry) => entry.path === `${prefix}index.md` || entry.path === `${prefix}index.ko.md`,
          )
        ) {
          invalid("New post slugs must be lowercase.", ["slug"])
        }
      }
      let head = await this.ref(branch)
      if (!head) {
        head = await this.http.reconcile(
          `branch:${branch}`,
          async () =>
            (
              await this.http.request(`${this.http.repo}/git/refs`, refResponse, {
                method: "POST",
                body: { ref: `refs/heads/${branch}`, sha: baseSha },
              })
            ).object.sha,
          async () => (await this.ref(branch)) ?? undefined,
        )
      }
      if (head === baseSha) {
        if (!initialFiles)
          invalid("Provide initialFiles before opening a new draft.", ["initialFiles"])
        try {
          await this.commit(slug, head, initialFiles)
        } catch (error: unknown) {
          if (!(error instanceof GitHubFailure) || error.detail.kind !== "conflict") throw error
          // Another creator won the branch race. Its content must not be overwritten.
          const concurrent = await this.findPull(slug)
          if (concurrent) return draft(concurrent)
          if (!error.detail.actualHeadSha) throw error
        }
      }
      return draft(
        await this.http.reconcile(
          `pull:${branch}`,
          () =>
            this.http.request(`${this.http.repo}/pulls`, pullResponse, {
              method: "POST",
              body: { title, head: branch, base, draft: true },
            }),
          () => this.findPull(slug),
        ),
      )
    })
  }

  commitBundle(
    slug: string,
    expectedHeadSha: string,
    files: readonly BundleFile[],
  ): Promise<GitHubResult<CommitReceipt>> {
    return result(() => this.commit(slug, expectedHeadSha, files))
  }

  getReviewThreads(pullNumber: number): Promise<GitHubResult<readonly ReviewThread[]>> {
    return result(() => this.discussions.list(pullNumber))
  }

  addRangeComment(
    pullNumber: number,
    expectedHeadSha: string,
    anchor: RangeAnchor,
    body: string,
  ): Promise<GitHubResult<ReviewThread>> {
    return result(() => this.discussions.add(pullNumber, expectedHeadSha, anchor, body))
  }

  replyComment(thread: ReviewThread, body: string): Promise<GitHubResult<ReviewComment>> {
    return result(() => this.discussions.reply(thread, body))
  }

  resolveThread(thread: ReviewThread, resolved: boolean): Promise<GitHubResult<ReviewThread>> {
    return result(() => this.discussions.resolve(thread, resolved))
  }

  approve(pullNumber: number, expectedHeadSha: string): Promise<GitHubResult<void>> {
    return result(async () => {
      await this.checkedPull(pullNumber, expectedHeadSha)
      const user = await this.http.request("/user", userResponse)
      const key = `approval:${pullNumber}:${expectedHeadSha}:${user.login}`
      const read = async (): Promise<true | undefined> => {
        const reviews = await this.http.list(
          `${this.http.repo}/pulls/${pullNumber}/reviews`,
          reviewResponse,
          true,
        )
        const latest = reviews
          .filter((review) => review.user?.login === user.login && review.state !== "COMMENTED")
          .at(-1)
        return latest?.commit_id === expectedHeadSha && latest.state === "APPROVED"
          ? true
          : undefined
      }
      if (await read()) {
        await this.checkedPull(pullNumber, expectedHeadSha)
        return
      }
      await this.http.reconcile(
        key,
        async () => {
          await this.http.request(`${this.http.repo}/pulls/${pullNumber}/reviews`, reviewResponse, {
            method: "POST",
            body: { event: "APPROVE", commit_id: expectedHeadSha },
          })
          return true
        },
        read,
      )
      await this.checkedPull(pullNumber, expectedHeadSha)
    })
  }

  markReady(pullNumber: number, expectedHeadSha: string): Promise<GitHubResult<DraftPullRequest>> {
    return result(async () => {
      const pr = await this.checkedPull(pullNumber, expectedHeadSha)
      if (!pr.draft) return draft(pr)
      await this.http.reconcile(
        `ready:${pr.node_id}`,
        async () => {
          await this.http.graph(
            "mutation($input: MarkPullRequestReadyForReviewInput!) { markPullRequestReadyForReview(input: $input) { pullRequest { id isDraft } } }",
            { input: { pullRequestId: pr.node_id } },
            z.object({
              markPullRequestReadyForReview: z.object({
                pullRequest: z.object({ id: z.string(), isDraft: z.literal(false) }),
              }),
            }),
            true,
          )
          return true
        },
        async () => ((await this.pull(pullNumber)).draft ? undefined : true),
      )
      return draft(await this.checkedPull(pullNumber, expectedHeadSha))
    })
  }

  squashMerge(pullNumber: number, expectedHeadSha: string): Promise<GitHubResult<CommitReceipt>> {
    return result(async () => {
      const pr = await this.checkedPull(pullNumber, expectedHeadSha, true)
      if (pr.merged && pr.merge_commit_sha) return { headSha: pr.merge_commit_sha }
      if (pr.state !== "open" || pr.draft) invalid("The pull request is not ready to publish.")
      const reviews = await this.http.list(
        `${this.http.repo}/pulls/${pullNumber}/reviews`,
        reviewResponse,
        true,
      )
      const latest = new Map<string, z.infer<typeof reviewResponse>>()
      for (const review of reviews) {
        if (review.user && ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state)) {
          latest.set(review.user.login, review)
        }
      }
      if (
        ![...latest.values()].some(
          (review) => review.state === "APPROVED" && review.commit_id === expectedHeadSha,
        ) ||
        [...latest.values()].some((review) => review.state === "CHANGES_REQUESTED")
      ) {
        invalid("The current head requires approval without outstanding changes requested.")
      }
      return this.http.reconcile(
        `merge:${pullNumber}:${expectedHeadSha}`,
        async () => {
          const merged = await this.http.request(
            `${this.http.repo}/pulls/${pullNumber}/merge`,
            z.object({ sha: gitShaSchema, merged: z.boolean(), message: z.string() }),
            { method: "PUT", body: { sha: expectedHeadSha, merge_method: "squash" } },
          )
          if (!merged.merged) invalid(merged.message)
          return { headSha: merged.sha }
        },
        async () => {
          const current = await this.pull(pullNumber)
          if (current.head.sha !== expectedHeadSha) conflict(expectedHeadSha, current.head.sha)
          return current.merged && current.merge_commit_sha
            ? { headSha: current.merge_commit_sha }
            : undefined
        },
      )
    })
  }

  private async defaultBranch(): Promise<string> {
    return (await this.http.request(this.http.repo, repositoryResponse)).default_branch
  }

  private async ref(branch: string): Promise<string | null> {
    try {
      return (
        await this.http.request(
          `${this.http.repo}/git/ref/heads/${encodePath(branch)}`,
          refResponse,
          { fresh: true },
        )
      ).object.sha
    } catch (error: unknown) {
      if (error instanceof GitHubFailure && error.status === 404) return null
      throw error
    }
  }

  private async openPulls(slug?: string): Promise<z.infer<typeof pullResponse>[]> {
    const head = slug ? `&head=${encodeURIComponent(`${this.options.owner}:post/${slug}`)}` : ""
    const pulls = await this.http.list(
      `${this.http.repo}/pulls?state=open${head}`,
      pullResponse,
      true,
    )
    return pulls.filter(
      (pr) =>
        pr.head.ref.startsWith("post/") &&
        slugSchema.safeParse(pr.head.ref.slice(5)).success &&
        (!pr.head.repo ||
          pr.head.repo.full_name.toLowerCase() ===
            `${this.options.owner}/${this.options.repository}`.toLowerCase()),
    )
  }

  private async findPull(slug: string): Promise<z.infer<typeof pullResponse> | undefined> {
    return (await this.openPulls(slug)).find((pr) => pr.head.ref === `post/${slug}`)
  }

  private pull(number: number): Promise<z.infer<typeof pullResponse>> {
    z.number().int().positive().parse(number)
    return this.http.request(`${this.http.repo}/pulls/${number}`, pullResponse, { fresh: true })
  }

  private async checkedPull(
    number: number,
    sha: string,
    allowClosed = false,
  ): Promise<z.infer<typeof pullResponse>> {
    gitShaSchema.parse(sha)
    const pr = await this.pull(number)
    if (pr.head.sha !== sha) conflict(sha, pr.head.sha)
    if (!allowClosed && pr.state !== "open") invalid("The pull request is closed.")
    return pr
  }

  private async commit(
    slug: string,
    expected: string,
    files: readonly BundleFile[],
  ): Promise<CommitReceipt> {
    validateFiles(slug, files)
    gitShaSchema.parse(expected)
    const key = JSON.stringify([slug, expected, files])
    const pending = this.pendingCommits.get(key)
    let current: string | null
    try {
      current = await this.ref(`post/${slug}`)
    } catch (error: unknown) {
      if (pending && error instanceof GitHubFailure && error.detail.kind === "network")
        unknownOutcome()
      throw error
    }
    if (pending) {
      if (current === pending) {
        this.pendingCommits.delete(key)
        return { headSha: pending }
      }
      if (current !== expected) conflict(expected, current)
      unknownOutcome()
    }
    if (current !== expected) conflict(expected, current)
    const parent = await this.http.request(
      `${this.http.repo}/git/commits/${expected}`,
      commitResponse,
    )
    const treeAtHead = await this.http.request(
      `${this.http.repo}/git/trees/${parent.tree.sha}?recursive=1`,
      treeResponse,
    )
    const prefix = `content/posts/${slug}/`
    const existingPaths = new Set(treeAtHead.tree.map((entry) => entry.path))
    if (
      files.some(
        (file) =>
          (file.path === `${prefix}index.md` && existingPaths.has(`${prefix}index.ko.md`)) ||
          (file.path === `${prefix}index.ko.md` && existingPaths.has(`${prefix}index.md`)),
      )
    )
      invalid("Keep the existing Korean Markdown filename.", ["path"])
    const entries: { path: string; mode: "100644"; type: "blob"; sha: string | null }[] = []
    for (const file of files) {
      const sha =
        file.encoding === "delete"
          ? null
          : (
              await this.http.request(`${this.http.repo}/git/blobs`, shaResponse, {
                method: "POST",
                body: { content: file.content, encoding: file.encoding },
                mutation: false,
              })
            ).sha
      entries.push({ path: file.path, mode: "100644", type: "blob", sha })
    }
    const tree = await this.http.request(`${this.http.repo}/git/trees`, shaResponse, {
      method: "POST",
      body: { base_tree: parent.tree.sha, tree: entries },
      mutation: false,
    })
    const commit = await this.http.request(`${this.http.repo}/git/commits`, shaResponse, {
      method: "POST",
      body: { message: `Save post/${slug}`, tree: tree.sha, parents: [expected] },
      mutation: false,
    })
    // A sibling commit cannot fast-forward over another sibling. Never force this ref.
    const latest = await this.ref(`post/${slug}`)
    if (latest !== expected) conflict(expected, latest)
    try {
      await this.http.request(`${this.http.repo}/git/refs/heads/post/${slug}`, refResponse, {
        method: "PATCH",
        body: { sha: commit.sha, force: false },
      })
    } catch (error: unknown) {
      if (!(error instanceof GitHubFailure)) throw error
      const ambiguous = error.detail.kind === "network" && error.detail.outcomeUnknown
      if (ambiguous) this.pendingCommits.set(key, commit.sha)
      let actual: string | null
      try {
        actual = await this.ref(`post/${slug}`)
      } catch (readError: unknown) {
        if (!(readError instanceof GitHubFailure)) throw readError
        if (ambiguous) unknownOutcome()
        throw error
      }
      if (actual !== commit.sha) {
        if (actual !== expected) conflict(expected, actual)
        throw error
      }
      this.pendingCommits.delete(key)
    }
    return { headSha: commit.sha }
  }
}

export function createGitHubAdapter(options: GitHubAdapterOptions): FetchGitHubAdapter {
  return new FetchGitHubAdapter(options)
}
