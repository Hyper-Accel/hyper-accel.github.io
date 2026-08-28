import { z } from "zod"

export const postPathSchema = z.string().regex(/^content\/posts\/[^/]+\/index(?:\.[a-z-]+)?\.md$/)

export const postSummarySchema = z.object({
  path: postPathSchema,
  slug: z.string().min(1),
  language: z.string().min(1),
  title: z.string(),
  draft: z.boolean(),
  modifiedAt: z.string(),
})

export const postListSchema = z.object({
  posts: z.array(postSummarySchema),
})

export const postDocumentSchema = z.object({
  path: postPathSchema,
  slug: z.string().min(1),
  language: z.string().min(1),
  title: z.string(),
  draft: z.boolean(),
  body: z.string(),
  revision: z.string().min(1),
})

export const savePostRequestSchema = z.object({
  path: postPathSchema,
  title: z.string().trim().min(1).max(240),
  body: z.string(),
  revision: z.string().min(1),
})

export const savePostResponseSchema = z.object({
  revision: z.string().min(1),
  renderedUrl: z.string().url(),
})

export const imageUploadResponseSchema = z.object({
  markdownPath: z.string().min(1),
  previewUrl: z.string().min(1),
})

export const apiErrorSchema = z.object({
  error: z.string().min(1),
})

export type PostSummary = z.infer<typeof postSummarySchema>
export type PostDocument = z.infer<typeof postDocumentSchema>
export type SavePostRequest = z.infer<typeof savePostRequestSchema>
export type ImageUploadResponse = z.infer<typeof imageUploadResponseSchema>
