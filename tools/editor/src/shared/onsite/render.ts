import { z } from "zod"
import { type BundleLanguage, blockIdSchema, markdownPathSchema } from "./document"

export const blockSourceEntrySchema = z
  .object({
    blockId: blockIdSchema,
    path: markdownPathSchema,
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    text: z.string(),
  })
  .refine((entry) => entry.startLine <= entry.endLine, "Reversed source range")
export const renderResultSchema = z.object({
  html: z.string(),
  blockSourceMap: z.array(blockSourceEntrySchema),
})
export type BlockSourceEntry = z.infer<typeof blockSourceEntrySchema>
export type RenderResult = z.infer<typeof renderResultSchema>
export interface Renderer {
  render(bundleLang: BundleLanguage): RenderResult
}
export const RENDER_BLOCK_ATTRIBUTE = "data-block-id"
export const REVIEW_IFRAME_SANDBOX = "allow-scripts"
// No allow-same-origin. Never pass session/token data into srcdoc or postMessage.
export const renderSelectionMessageSchema = z.object({
  type: z.literal("onsite:selection"),
  blockIds: z.array(blockIdSchema).min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  quotedText: z.string().min(1),
})
export type RenderSelectionMessage = z.infer<typeof renderSelectionMessageSchema>
