import { z } from "zod"
import { gitShaSchema } from "../../shared/onsite/document"

export const shaResponse = z.object({ sha: gitShaSchema })
export const refResponse = z.object({ object: shaResponse })
export const commitResponse = z.object({ sha: gitShaSchema, tree: shaResponse })
export const repositoryResponse = z.object({
  default_branch: z.string(),
  permissions: z.object({ push: z.boolean() }).optional(),
})
export const userResponse = z.object({ login: z.string(), id: z.number().int().positive() })
export const pullResponse = z.object({
  number: z.number().int().positive(),
  node_id: z.string(),
  head: z.object({
    ref: z.string(),
    sha: gitShaSchema,
    repo: z.object({ full_name: z.string() }).nullable().optional(),
  }),
  draft: z.boolean(),
  state: z.enum(["open", "closed"]),
  merged: z.boolean().optional(),
  mergeable: z.boolean().nullable().optional(),
  merge_commit_sha: gitShaSchema.nullable().optional(),
})
export const commentResponse = z.object({
  id: z.number().int().positive(),
  body: z.string(),
  user: z.object({ login: z.string() }).nullable(),
  created_at: z.string(),
  commit_id: gitShaSchema.optional(),
  in_reply_to_id: z.number().int().positive().optional(),
})
export type WireComment = z.infer<typeof commentResponse>
export const reviewResponse = z.object({
  id: z.number().int().positive(),
  user: z.object({ login: z.string() }).nullable(),
  commit_id: gitShaSchema,
  state: z.string(),
  body: z.string().nullable(),
})
export const pageInfo = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() })
export const threadResponse = z.object({
  id: z.string(),
  isResolved: z.boolean(),
  isOutdated: z.boolean(),
  comments: z.object({ nodes: z.array(z.object({ databaseId: z.number().int().positive() })) }),
})
export const threadsResponse = z.object({
  repository: z.object({
    pullRequest: z.object({
      reviewThreads: z.object({ nodes: z.array(threadResponse), pageInfo }),
    }),
  }),
})
