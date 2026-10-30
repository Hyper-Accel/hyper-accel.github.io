import { z } from "zod"
import { renderSelectionMessageSchema } from "../../shared/onsite/render"

// Messages crossing the sandboxed srcdoc boundary. The frame has an opaque origin, so
// both sides check `event.source`; the parent additionally validates every shape here.
export const FRAME_MESSAGES = {
  ready: "onsite:frame-ready",
  height: "onsite:frame-height",
  selection: "onsite:selection",
  selectionCleared: "onsite:selection-cleared",
  commentShortcut: "onsite:comment-shortcut",
  threadActivate: "onsite:thread-activate",
  threadRect: "onsite:thread-rect",
  escape: "onsite:escape",
  headingRect: "onsite:heading-rect",
} as const
export const PARENT_MESSAGES = {
  highlights: "onsite:highlights",
  reveal: "onsite:reveal",
  clearSelection: "onsite:clear-selection",
  heading: "onsite:heading",
} as const
export const THREAD_MARK_ATTRIBUTE = "data-onsite-thread"
export const FRAME_CONTENT_ID = "onsite-review-content"
export const PENDING_HIGHLIGHT_ID = "pending"

const rectSchema = z.object({
  top: z.number(),
  left: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
})
export type SelectionRect = z.infer<typeof rectSchema>
export const frameSelectionSchema = renderSelectionMessageSchema.extend({
  rect: rectSchema.optional(),
})
export const frameMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(FRAME_MESSAGES.ready) }),
  z.object({ type: z.literal(FRAME_MESSAGES.height), height: z.number().nonnegative() }),
  frameSelectionSchema,
  z.object({ type: z.literal(FRAME_MESSAGES.selectionCleared) }),
  z.object({ type: z.literal(FRAME_MESSAGES.commentShortcut) }),
  z.object({ type: z.literal(FRAME_MESSAGES.threadActivate), threadId: z.string().min(1) }),
  z.object({
    type: z.literal(FRAME_MESSAGES.threadRect),
    threadId: z.string().min(1),
    top: z.number(),
    height: z.number().nonnegative(),
  }),
  z.object({ type: z.literal(FRAME_MESSAGES.escape) }),
  z.object({ type: z.literal(FRAME_MESSAGES.headingRect), top: z.number() }),
])
export type FrameMessage = z.infer<typeof frameMessageSchema>
export type FrameSelection = z.infer<typeof frameSelectionSchema>

export type HighlightState = "open" | "resolved" | "pending"
export interface HighlightItem {
  readonly id: string
  readonly blockIds: readonly string[]
  readonly startOffset: number
  readonly endOffset: number
  readonly state: HighlightState
  readonly active: boolean
}
export type ParentMessage =
  | { readonly type: typeof PARENT_MESSAGES.highlights; readonly items: readonly HighlightItem[] }
  | { readonly type: typeof PARENT_MESSAGES.reveal; readonly threadId: string }
  | { readonly type: typeof PARENT_MESSAGES.clearSelection }
  | { readonly type: typeof PARENT_MESSAGES.heading; readonly index: number }
