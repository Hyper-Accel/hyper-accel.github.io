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
// An adapter instance is scoped to one owner/repository. Branch is post/<slug>.
// Every mutation must reconcile ambiguous network outcomes before any retry.
export interface GitHubAdapter {
  getAccess(): Promise<GitHubResult<AuthSession>>
  listDrafts(): Promise<GitHubResult<readonly DraftPullRequest[]>>
  // Optional for existing injected adapters; production B implements this.
  getPullState?(pullNumber: number): Promise<GitHubResult<PullState>>
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
    anchor: RangeAnchor,
    body: string,
  ): Promise<GitHubResult<ReviewThread>>
  replyComment(thread: ReviewThread, body: string): Promise<GitHubResult<ReviewComment>>
  resolveThread(thread: ReviewThread, resolved: boolean): Promise<GitHubResult<ReviewThread>>
  approve(pullNumber: number, expectedHeadSha: string): Promise<GitHubResult<void>>
  markReady(pullNumber: number, expectedHeadSha: string): Promise<GitHubResult<DraftPullRequest>>
  squashMerge(pullNumber: number, expectedHeadSha: string): Promise<GitHubResult<CommitReceipt>>
}
