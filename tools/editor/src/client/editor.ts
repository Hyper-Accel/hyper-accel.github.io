import { type AnyExtension, Editor } from "@tiptap/core"
import Image from "@tiptap/extension-image"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import { TableKit } from "@tiptap/extension-table"
import { Markdown } from "@tiptap/markdown"
import { NodeSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import StarterKit from "@tiptap/starter-kit"
import { HighlightedCodeBlock } from "./blocks/code-highlight"
import {
  markPictureSpot,
  PAIR_NODE,
  type PictureSpot,
  pictureList,
  pictureSpotAt,
} from "./blocks/image-groups"
import { ArticleParagraph, textFormatExtensions } from "./blocks/text-formats"
import { createHugoShortcode } from "./shortcode"
import "../../../../assets/css/extended/text-presets.css"
import { EditorShortcuts, TabSpace } from "./composer/shortcut-extension"

/** Pictures dropped or pasted beside a picture join it in a row (Naver's "나란히 놓기"). */
export type ImageBeside = PictureSpot

export interface BlockEditorOptions {
  readonly mediaUrl: (source: string) => string
  readonly onChange: () => void
  readonly onImage: (file: File, position: number, beside?: ImageBeside) => Promise<void>
  /**
   * Several pictures (or any beside a picture) at once; `point` is where to ask how they go in.
   * Without it each file goes through onImage.
   */
  readonly onImages?: (
    files: readonly File[],
    position: number,
    beside: ImageBeside | undefined,
    point: { readonly x: number; readonly y: number },
  ) => Promise<void>
  readonly editable?: boolean
  readonly content?: string
  readonly placeholder?: string | (() => string)
  readonly ariaLabel?: string
  readonly extensions?: readonly AnyExtension[]
  readonly onFocus?: () => void
  readonly onBlur?: (event: FocusEvent) => void
  readonly onSelectionUpdate?: () => void
}

type EditorCallbacks = Pick<BlockEditorOptions, "mediaUrl" | "onChange" | "onImage" | "editable">

function imageFiles(files: FileList | undefined): File[] {
  return Array.from(files ?? []).filter((file) => file.type.startsWith("image/"))
}

/** Pasting onto a selected picture (or row) puts the new ones right after it, in the same row. */
function selectedSpot(view: EditorView): ImageBeside | undefined {
  const { selection } = view.state
  if (!(selection instanceof NodeSelection)) return undefined
  const { node } = selection
  if (node.type.name === "image") return { pos: selection.from, index: 0, before: false }
  if (node.type.name !== PAIR_NODE) return undefined
  const active = view.nodeDOM(selection.from)
  const index =
    active instanceof HTMLElement
      ? Number(active.querySelector<HTMLElement>(".is-active")?.dataset["groupIndex"] ?? Number.NaN)
      : Number.NaN
  return {
    pos: selection.from,
    index: Number.isNaN(index) ? pictureList(node).length - 1 : index,
    before: false,
  }
}

/** Where to show the "how do these go in" menu for pasted pictures: at the caret. */
function caretPoint(view: EditorView): { x: number; y: number } {
  const coords = view.coordsAtPos(view.state.selection.from)
  return { x: coords.left, y: coords.bottom }
}

/** Sends dropped or pasted pictures on: several at once when the editor takes them, else one by one. */
function sendImages(
  options: BlockEditorOptions,
  files: readonly File[],
  position: number,
  beside: ImageBeside | undefined,
  point: { x: number; y: number },
): void {
  if (options.onImages) {
    void options.onImages(files, position, beside, point)
    return
  }
  for (const file of files) void options.onImage(file, position, beside)
}

export function createBlockEditor(element: HTMLElement, options: BlockEditorOptions): Editor {
  const placeholder = options.placeholder ?? ""
  const extra = options.extensions ?? []
  const provided = new Set(extra.map((extension) => extension.name))
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({
        link: false,
        paragraph: false,
        codeBlock: false,
        trailingNode: { notAfter: ["footnoteSection"] },
      }),
      ArticleParagraph,
      HighlightedCodeBlock,
      ...textFormatExtensions(),
      EditorShortcuts,
      TabSpace,
      Link.configure({ openOnClick: false, autolink: true }),
      // GFM tables render and round-trip as tables, as on the published post.
      TableKit.configure({ table: { resizable: false, renderWrapper: false } }),
      ...(provided.has("image") ? [] : [Image.configure({ allowBase64: false, inline: false })]),
      Placeholder.configure({
        placeholder: typeof placeholder === "string" ? placeholder : () => placeholder(),
      }),
      Markdown.configure({ markedOptions: { gfm: true } }),
      ...(provided.has("hugoShortcode") ? [] : [createHugoShortcode(options.mediaUrl)]),
      ...extra,
    ],
    content: options.content ?? "",
    contentType: "markdown",
    editable: options.editable ?? true,
    editorProps: {
      attributes: {
        class: "post-content",
        "aria-label": options.ariaLabel ?? "본문",
      },
      handlePaste(view, event) {
        if (options.editable === false) {
          return false
        }
        const images = imageFiles(event.clipboardData?.files)
        if (images.length === 0) {
          const url = event.clipboardData?.getData("text/plain").trim()
          if (!view.state.selection.empty && url && /^https?:\/\/\S+$/.test(url)) {
            const link = view.state.schema.marks["link"]
            if (link) {
              event.preventDefault()
              view.dispatch(
                view.state.tr.addMark(
                  view.state.selection.from,
                  view.state.selection.to,
                  link.create({ href: url }),
                ),
              )
              return true
            }
          }
          return false
        }
        event.preventDefault()
        // Pasted onto a selected picture: the new ones sit beside it.
        sendImages(options, images, view.state.selection.from, selectedSpot(view), caretPoint(view))
        return true
      },
      handleDOMEvents: {
        dragover(view, event) {
          if (event.dataTransfer?.types.includes("Files"))
            markPictureSpot(view, pictureSpotAt(view, event.clientX, event.clientY, true))
          return false
        },
        dragleave(view, event) {
          if (!(event.relatedTarget instanceof Node && view.dom.contains(event.relatedTarget)))
            markPictureSpot(view, null)
          return false
        },
      },
      handleDrop(view, event, _slice, moved) {
        if (moved || options.editable === false) {
          return false
        }
        const images = imageFiles(event.dataTransfer?.files)
        if (images.length === 0) {
          return false
        }
        event.preventDefault()
        markPictureSpot(view, null)
        const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY })
        // On the edge of a picture they join it (Naver's edge line); elsewhere they go in there.
        const beside = pictureSpotAt(view, event.clientX, event.clientY, true) ?? undefined
        sendImages(options, images, coordinates?.pos ?? view.state.selection.from, beside, {
          x: event.clientX,
          y: event.clientY,
        })
        return true
      },
    },
    onUpdate: options.onChange,
    ...(options.onFocus ? { onFocus: options.onFocus } : {}),
    ...(options.onBlur ? { onBlur: ({ event }) => options.onBlur?.(event) } : {}),
    ...(options.onSelectionUpdate ? { onSelectionUpdate: options.onSelectionUpdate } : {}),
  })
}

export function createBlogEditor(element: HTMLElement, callbacks: EditorCallbacks): Editor {
  return createBlockEditor(element, {
    ...callbacks,
    placeholder: "본문을 입력하거나 이미지를 붙여넣으세요.",
    ariaLabel: "블로그 본문",
  })
}

export function insertImage(
  editor: Editor,
  position: number,
  previewUrl: string,
  alt: string,
): void {
  editor
    .chain()
    .focus()
    .insertContentAt(position, { type: "image", attrs: { src: previewUrl, alt } })
    .run()
}
