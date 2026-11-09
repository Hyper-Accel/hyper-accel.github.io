import { z } from "zod"
import type { AuthSession } from "./auth"
import { type BundleFile, gitShaSchema, type PostBundle, slugSchema } from "./document"
import type { RangeAnchor, ReviewComment, ReviewThread } from "./review"

export const githubErrorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unauthorized"), message: z.string() }),
  z.object({ kind: z.literal("forbidden"), message: z.string() }),
  z.object({
    kind: z.literal("conflict"),
    message: z.string(),
    expectedHeadSha: gitShaSchema,
    actualHeadSha: gitShaSchema.nullable(),
  }),
  z.object({
    kind: z.literal("rateLimited"),
    message: z.string(),
    retryAt: z.number().int().nonnegative(),
  }),
  z.object({ kind: z.literal("validation"), message: z.string(), fields: z.array(z.string()) }),
  z.object({
    kind: z.literal("network"),
    message: z.string(),
    outcomeUnknown: z.boolean(),
  }),
])
export type GitHubError = z.infer<typeof githubErrorSchema>
export type GitHubResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: GitHubError }
export const draftPullRequestSchema = z.object({
  number: z.number().int().positive(),
  nodeId: z.string().min(1),
  slug: slugSchema,
  branch: z.string().startsWith("post/"),
  headSha: gitShaSchema,
  draft: z.boolean(),
  state: z.enum(["open", "closed", "merged"]),
})
export type DraftPullRequest = z.infer<typeof draftPullRequestSchema>
export interface CommitReceipt {
  readonly headSha: string
}
export const pullStateSchema = z.object({
  headSha: gitShaSchema,
  draft: z.boolean(),
  approvedHeadShas: z.array(gitShaSchema),
  mergeable: z.boolean().nullable(),
  merged: z.boolean(),
})
export type PullState = z.infer<typeof pullStateSchema>
/** A GitHub account: the login may be renamed, the numeric ID never changes. */
export interface GitHubUser {
  readonly login: string
  readonly id: number
}
export interface CheckAnnotation {
  readonly path: string
  readonly line: number
  readonly level: "notice" | "warning" | "failure"
  readonly message: string
}
export interface CommitCheck {
  readonly id: string
  readonly name: string
  readonly state:
    | "queued"
    | "running"
    | "success"
    | "failure"
    | "cancelled"
    | "neutral"
    | "skipped"
    | "unknown"
  readonly title: string
  readonly summary: string
  readonly text: string
  /** How long a finished check run took, when GitHub reports both times. */
  readonly durationMs: number | null
  readonly detailsUrl: string | null
  readonly annotations: readonly CheckAnnotation[]
}
// An adapter instance is scoped to one owner/repository. Branch is post/<slug>.
// Every mutation must reconcile ambiguous network outcomes before any retry.
export interface GitHubAdapter {
  getAccess(): Promise<GitHubResult<AuthSession>>
  /** The account currently using this login, or null when no such account exists. */
  getUser(login: string): Promise<GitHubResult<GitHubUser | null>>
  /** The account with this user ID under its current login, or null when it no longer exists. */
  getUserById(id: number): Promise<GitHubResult<GitHubUser | null>>
  listDrafts(): Promise<GitHubResult<readonly DraftPullRequest[]>>
  // Optional for existing injected adapters; production B implements this.
  getPullState?(pullNumber: number): Promise<GitHubResult<PullState>>
  getCommitChecks(headSha: string): Promise<GitHubResult<readonly CommitCheck[]>>
  loadBundle(slug: string): Promise<GitHubResult<PostBundle>>
  ensureDraftPR(
    slug: string,
    title: string,
    initialFiles?: readonly BundleFile[],
  ): Promise<GitHubResult<DraftPullRequest>>
  commitBundle(
    slug: string,
    expectedHeadSha: string,
    files: readonly BundleFile[],
  ): Promise<GitHubResult<CommitReceipt>>
  getReviewThreads(pullNumber: number): Promise<GitHubResult<readonly ReviewThread[]>>
  addRangeComment(
    pullNumber: number,
    expectedHeadSha: string,
    anchor: RangeAnchor | null,
    body: string,
  ): Promise<GitHubResult<ReviewThread>>
  replyComment(thread: ReviewThread, body: string): Promise<GitHubResult<ReviewComment>>
  resolveThread(thread: ReviewThread, resolved: boolean): Promise<GitHubResult<ReviewThread>>
  approve(pullNumber: number, expectedHeadSha: string): Promise<GitHubResult<void>>
  markReady(pullNumber: number, expectedHeadSha: string): Promise<GitHubResult<DraftPullRequest>>
  /** Takes a pull request back from review to draft (the author wants to keep writing). */
  markDraft(pullNumber: number, expectedHeadSha: string): Promise<GitHubResult<DraftPullRequest>>
  squashMerge(pullNumber: number, expectedHeadSha: string): Promise<GitHubResult<CommitReceipt>>
}
