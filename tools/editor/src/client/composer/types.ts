import type { AnyExtension, Editor } from "@tiptap/core"
import type { UnpairedBundle } from "../../document/repair"
import type { DocumentIssue, PostBundle } from "../../shared/onsite/document"
import type { DraftCursor } from "../../shared/onsite/drafts"
import type { NewAuthorProfile } from "./author-profile"

export interface ImageChoice {
  readonly src: string
  readonly alt?: string
}

export interface BlockExtensionContext {
  /** Resolves a Markdown image source (pending or committed) to a displayable URL. */
  readonly mediaUrl: (source: string) => string
  /** Opens a file picker, stores the WebP as a pending bundle image and returns its path. */
  readonly requestImage: () => Promise<ImageChoice | null>
  /** The same picker allowing several files (the 사진 tool); an empty list when cancelled. */
  readonly requestImages: () => Promise<ImageChoice[]>
  /** Adds files from the computer to the post's pictures (the library's 사진 추가). */
  readonly addImages: () => Promise<ImageChoice[]>
  /** Adds picture files already in hand (pasted from the clipboard) to the post's pictures. */
  readonly addImageFiles: (files: readonly File[]) => Promise<ImageChoice[]>
}

export type BlockExtensionsOption =
  | readonly AnyExtension[]
  | ((context: BlockExtensionContext) => readonly AnyExtension[])

export interface ComposerChange {
  readonly bundle: PostBundle
  readonly cursor: DraftCursor | null
  readonly sequence: number
}

export interface ComposerDeps {
  /** Hosted save controls are placed beside the language selector, below the article title. */
  readonly saveControls?: HTMLElement
  /** null opens the new-post form; a bundle opens paired editing. */
  readonly bundle: PostBundle | null
  /** From `parseForEditing(...).kind === "repair"`: opens pairing-repair mode when `bundle` is null. */
  readonly unpaired?: UnpairedBundle | null
  readonly cursor?: DraftCursor | null
  /** Directory names under content/authors. */
  readonly authors: readonly string[]
  /** Author names with their GitHub handles (`github:` in each author profile). */
  readonly people?: readonly { readonly name: string; readonly handle: string }[]
  /** Existing tags and series across the blog, offered in the metadata dropdowns. */
  readonly tags?: readonly string[]
  readonly series?: readonly string[]
  /** Signed-in GitHub login: picks the writer as the new post's author. */
  readonly currentLogin?: string
  /** A new author was added in the metadata form; the host saves their profile with the post. */
  readonly onNewAuthor?: (profile: NewAuthorProfile) => void
  /** Set when the writer may not edit this post: the post is shown read-only with this notice. */
  readonly readOnly?: string
  /** The writer may edit but is not an author, so they cannot change who else may edit. */
  readonly lockEditors?: boolean
  readonly categories?: readonly string[]
  /**
   * Block node extensions from lane D2, registered after the base Tiptap kit. Pass a factory
   * to receive the composer's media resolver, e.g. `(ctx) => createBlockExtensions(ctx)`.
   * Extensions named `image`/`hugoShortcode` replace the composer's fallback nodes.
   */
  readonly blockExtensions?: BlockExtensionsOption
  /** Fired after every edit with a bundle whose snapshotHash is already refreshed. */
  readonly onChange: (change: ComposerChange) => void | Promise<void>
  readonly onRequestReview?: (bundle: PostBundle) => void | Promise<void>
  /** Adds "댓글" to the selection toolbar; receives the editor holding the selection. */
  readonly onComment?: (editor: Editor) => void
  /** Preview URL for a committed image path such as images/a.webp. */
  readonly resolveImage?: (path: string) => string | undefined
  readonly now?: () => Date
}

export interface ComposerHandle {
  dispose(): void
  /** null while pairing repair is unresolved; review/publish stay blocked until then. */
  getBundle(): PostBundle | null
  getUnpaired(): UnpairedBundle | null
  setBundle(bundle: PostBundle): void
  getCursor(): DraftCursor | null
  setCursor(cursor: DraftCursor | null): void
  getIssues(): readonly DocumentIssue[]
}
