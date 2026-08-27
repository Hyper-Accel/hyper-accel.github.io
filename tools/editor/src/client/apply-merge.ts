import type { Editor } from "@tiptap/core"
import type { PostDocument } from "../shared/contracts"
import { prepareMarkdown } from "./markdown"

export function applyMergedContent(
  document: PostDocument,
  editor: Editor,
  titleElement: HTMLTextAreaElement,
  nextTitle: string,
  body: string,
): {
  readonly document: PostDocument
  readonly shortcodes: ReadonlyMap<string, string>
} {
  const prepared = prepareMarkdown(body, document.path)
  editor.commands.setContent(prepared.markdown, { contentType: "markdown" })
  titleElement.value = nextTitle
  return {
    document: { ...document, title: nextTitle, body },
    shortcodes: prepared.shortcodes,
  }
}
