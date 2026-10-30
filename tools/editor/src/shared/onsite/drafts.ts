import { z } from "zod"
import { blockIdSchema, languageSchema, postBundleSchema, slugSchema } from "./document"

export const draftKeySchema = z.object({
  owner: z.string().min(1),
  repository: z.string().min(1),
  userId: z.number().int().positive(),
  slug: slugSchema,
})
export const cursorSchema = z.object({
  language: languageSchema,
  anchor: z.object({ blockId: blockIdSchema, offset: z.number().int().nonnegative() }),
  focus: z.object({ blockId: blockIdSchema, offset: z.number().int().nonnegative() }),
  scrollTop: z.number().nonnegative(),
})
export const draftSnapshotSchema = z.object({
  version: z.literal(1),
  key: draftKeySchema,
  bundle: postBundleSchema,
  cursor: cursorSchema.nullable(),
  savedAt: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
})
export type DraftKey = z.infer<typeof draftKeySchema>
export type DraftCursor = z.infer<typeof cursorSchema>
export type DraftSnapshot = z.infer<typeof draftSnapshotSchema>
export type DraftRestore =
  | { readonly status: "missing" }
  | { readonly status: "restored"; readonly snapshot: DraftSnapshot }
  | {
      readonly status: "conflict"
      readonly snapshot: DraftSnapshot
      readonly remoteHeadSha: string | null
    }
// One transaction persists body, metadata, cursor and pending Blob images.
// save resolves only on transaction completion; older sequences cannot replace newer ones.
// logout/re-login must NOT clear this store. flush precedes login navigation.
export interface DraftStore {
  save(snapshot: DraftSnapshot): Promise<void>
  load(key: DraftKey): Promise<DraftSnapshot | null>
  restore(key: DraftKey, remoteHeadSha: string | null): Promise<DraftRestore>
  list(scope: Omit<DraftKey, "slug">): Promise<readonly DraftSnapshot[]>
  remove(key: DraftKey): Promise<void>
  flush(): Promise<void>
  close(): void
}
