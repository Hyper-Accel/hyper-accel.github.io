import { z } from "zod"
import { blockIdSchema, gitShaSchema, markdownPathSchema, snapshotHashSchema } from "./document"

export const markdownRangeSchema = z
  .object({
    path: markdownPathSchema,
    start_line: z.number().int().positive(),
    line: z.number().int().positive(),
    side: z.literal("RIGHT"),
    start_side: z.literal("RIGHT"),
  })
  .refine((range) => range.start_line <= range.line, "Reversed Markdown line range")
export const rangeAnchorSchema = z
  .object({
    version: z.literal(1),
    blockIds: z.array(blockIdSchema).min(1),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    quotedText: z.string().min(1),
    markdown: markdownRangeSchema,
    snapshotHash: snapshotHashSchema,
  })
  .refine(
    (anchor) => anchor.blockIds.length > 1 || anchor.startOffset < anchor.endOffset,
    "Empty or reversed selection",
  )
  .refine((anchor) => new Set(anchor.blockIds).size === anchor.blockIds.length, "Duplicate blocks")
export type RangeAnchor = z.infer<typeof rangeAnchorSchema>
export type MarkdownRange = z.infer<typeof markdownRangeSchema>
export const reviewCommentSchema = z.object({
  id: z.number().int().positive(),
  author: z.string().min(1),
  body: z.string(),
  createdAt: z.string(),
})
export const reviewThreadSchema = z.object({
  id: z.string().min(1),
  pullNumber: z.number().int().positive(),
  storage: z.enum(["review", "issue"]),
  rootCommentId: z.number().int().positive(),
  anchor: rangeAnchorSchema,
  commitSha: gitShaSchema,
  resolved: z.boolean(),
  outdated: z.boolean(),
  comments: z.array(reviewCommentSchema).min(1),
})
export type ReviewComment = z.infer<typeof reviewCommentSchema>
export type ReviewThread = z.infer<typeof reviewThreadSchema>
export const RANGE_METADATA_PREFIX = "<!-- onsite-range:v1 "
export const RANGE_METADATA_SUFFIX = " -->"
