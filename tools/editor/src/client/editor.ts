import { Editor } from "@tiptap/core"
import Image from "@tiptap/extension-image"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import { Markdown } from "@tiptap/markdown"
import StarterKit from "@tiptap/starter-kit"
import { createHugoShortcode } from "./shortcode"

type EditorCallbacks = {
  readonly mediaUrl: (source: string) => string
  readonly onChange: () => void
  readonly onImage: (file: File, position: number) => Promise<void>
}

function firstClipboardImage(event: ClipboardEvent): File | undefined {
  return Array.from(event.clipboardData?.files ?? []).find((file) => file.type.startsWith("image/"))
}

export function createBlogEditor(element: HTMLElement, callbacks: EditorCallbacks): Editor {
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ allowBase64: false, inline: false }),
      Placeholder.configure({
        placeholder: "본문을 입력하거나 이미지를 붙여넣으세요.",
      }),
      Markdown.configure({ markedOptions: { gfm: true } }),
      createHugoShortcode(callbacks.mediaUrl),
    ],
    content: "",
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: "post-content",
        "aria-label": "블로그 본문",
      },
      handlePaste(view, event) {
        const image = firstClipboardImage(event)
        if (!image) {
          return false
        }
        event.preventDefault()
        void callbacks.onImage(image, view.state.selection.from)
        return true
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) {
          return false
        }
        const image = Array.from(event.dataTransfer?.files ?? []).find((file) =>
          file.type.startsWith("image/"),
        )
        if (!image) {
          return false
        }
        event.preventDefault()
        const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY })
        void callbacks.onImage(image, coordinates?.pos ?? view.state.selection.from)
        return true
      },
    },
    onUpdate: callbacks.onChange,
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
