import { z } from "zod"

export const languageSchema = z.enum(["ko", "en"])
export type Language = z.infer<typeof languageSchema>
export const newSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const slugSchema = z.string().regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/)
export const blockIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
export const gitShaSchema = z.string().regex(/^[a-f0-9]{40}$/)
export const snapshotHashSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const markdownPathSchema = z
  .string()
  .regex(/^content\/posts\/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\/index(?:\.ko|\.en)?\.md$/)
export const imagePathSchema = z
  .string()
  .regex(/^(?:images\/(?:[A-Za-z0-9_-]+\/)*)?[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|webp|svg)$/i)

// Keep unknown Hugo fields; rawFrontMatter preserves comments and YAML formatting.
export const frontMatterSchema = z
  .object({
    title: z.string(),
    date: z.string().optional(),
    draft: z.boolean(),
    authors: z.array(z.string()),
    categories: z.array(z.string()),
    tags: z.array(z.string()).optional(),
  })
  .catchall(z.unknown())
export const postBlockSchema = z.object({
  id: blockIdSchema,
  markdown: z.string(),
})
export const bundleLanguageSchema = z.object({
  language: languageSchema,
  path: markdownPathSchema,
  frontMatter: frontMatterSchema,
  rawFrontMatter: z.string(),
  blocks: z.array(postBlockSchema),
})
export const bundleImageSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("committed"),
    path: imagePathSchema,
    sha: gitShaSchema,
    mime: z.string().min(1),
  }),
  z.object({
    status: z.literal("pending"),
    path: imagePathSchema,
    blob: z.instanceof(Blob),
    mime: z.string().min(1),
  }),
])
export const postBundleSchema = z
  .object({
    slug: slugSchema,
    ko: bundleLanguageSchema,
    en: bundleLanguageSchema,
    images: z.array(bundleImageSchema),
    headSha: gitShaSchema.nullable(),
    snapshotHash: snapshotHashSchema,
  })
  .superRefine((bundle, context) => {
    for (const language of ["ko", "en"] as const) {
      const doc = bundle[language]
      const paths =
        language === "ko"
          ? [`content/posts/${bundle.slug}/index.md`, `content/posts/${bundle.slug}/index.ko.md`]
          : [`content/posts/${bundle.slug}/index.en.md`]
      if (doc.language !== language || !paths.includes(doc.path)) {
        context.addIssue({ code: "custom", path: [language], message: "Language/path mismatch" })
      }
      const ids = doc.blocks.map((block) => block.id)
      if (new Set(ids).size !== ids.length) {
        context.addIssue({ code: "custom", path: [language, "blocks"], message: "Duplicate ID" })
      }
    }
    if (
      bundle.ko.blocks.length !== bundle.en.blocks.length ||
      bundle.ko.blocks.some((block, index) => block.id !== bundle.en.blocks[index]?.id)
    ) {
      context.addIssue({ code: "custom", path: ["en", "blocks"], message: "Unpaired block IDs" })
    }
    if (new Set(bundle.images.map((image) => image.path)).size !== bundle.images.length) {
      context.addIssue({ code: "custom", path: ["images"], message: "Duplicate image path" })
    }
  })

export type FrontMatter = z.infer<typeof frontMatterSchema>
export type PostBlock = z.infer<typeof postBlockSchema>
export type BundleLanguage = z.infer<typeof bundleLanguageSchema>
export type BundleImage = z.infer<typeof bundleImageSchema>
export type PostBundle = z.infer<typeof postBundleSchema>

export const bundleFileSchema = z.discriminatedUnion("encoding", [
  z.object({ path: z.string().min(1), encoding: z.literal("utf-8"), content: z.string() }),
  z.object({ path: z.string().min(1), encoding: z.literal("base64"), content: z.string() }),
  z.object({ path: z.string().min(1), encoding: z.literal("delete") }),
])
export type BundleFile = z.infer<typeof bundleFileSchema>
export interface ParseBundleInput {
  readonly slug: string
  readonly ko: string
  readonly en: string
  readonly images: readonly BundleImage[]
  readonly headSha: string | null
  readonly paths?: Readonly<Record<Language, string>>
}
export interface DocumentIssue {
  readonly code: "frontMatter" | "pairing" | "emptyTranslation" | "image" | "legacy"
  readonly message: string
  readonly language?: Language
  readonly blockId?: string
}
export type ParseBundleResult =
  | { readonly ok: true; readonly bundle: PostBundle; readonly migratedLegacy: boolean }
  | { readonly ok: false; readonly issues: readonly DocumentIssue[] }
export interface SerializedBundle {
  readonly files: readonly BundleFile[]
  readonly snapshotHash: string
}
// Implemented by lane C, not by the shared contract layer.
export interface DocumentCodec {
  parse(input: ParseBundleInput): Promise<ParseBundleResult>
  serialize(bundle: PostBundle): Promise<SerializedBundle>
  validate(bundle: PostBundle, purpose: "save" | "review" | "publish"): readonly DocumentIssue[]
}
