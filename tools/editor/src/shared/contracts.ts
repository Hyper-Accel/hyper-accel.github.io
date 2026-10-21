import { z } from "zod"

export const postPathSchema = z.string().regex(/^content\/posts\/[^/]+\/index(?:\.[a-z-]+)?\.md$/)

// Windows treats device names as reserved even when followed by an extension.
const reservedDeviceName = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i
const authorNameSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (name) =>
      !/[<>:"/\\|?*\p{Cc}]/u.test(name) &&
      name !== "." &&
      name !== ".." &&
      !name.endsWith(".") &&
      !reservedDeviceName.test(name),
    "작성자 이름은 안전한 단일 디렉터리 이름이어야 합니다.",
  )
const optionalProfileUrlSchema = z
  .union([
    z.literal(""),
    z
      .string()
      .url()
      .regex(/^https?:\/\//i),
  ])
  .optional()

export const createPostRequestSchema = z.object({
  directory: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .refine((name) => !reservedDeviceName.test(name), "예약된 디렉터리 이름입니다."),
  title: z.string().trim().min(1).max(240),
  author: authorNameSchema,
  profile: z
    .object({
      bioKo: z.string().trim().min(1).max(1000),
      bioEn: z.string().trim().min(1).max(1000),
      image: optionalProfileUrlSchema,
      github: optionalProfileUrlSchema,
      linkedin: optionalProfileUrlSchema,
    })
    .optional(),
})

export const registerAuthorRequestSchema = createPostRequestSchema
  .pick({ author: true, profile: true })
  .required({ profile: true })
export const registerAuthorResponseSchema = z.object({ author: z.string() })
export type RegisterAuthorRequest = z.infer<typeof registerAuthorRequestSchema>

export const authorListSchema = z.object({ authors: z.array(z.string()) })
export const createPostResponseSchema = z.object({ path: postPathSchema })
export type CreatePostRequest = z.infer<typeof createPostRequestSchema>

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
