import "../../../../../../../assets/css/core/theme-vars.css"
import "../../../../../../../assets/css/extended/design-c.css"
import "../../../../../../../assets/css/extended/figures.css"
import "./harness.css"
import { Editor } from "@tiptap/core"
import { Markdown } from "@tiptap/markdown"
import StarterKit from "@tiptap/starter-kit"
import imageLayouts from "../../../../shared/onsite/fixtures/image-layouts/index.md?raw"
import interactiveBlocks from "../../../../shared/onsite/fixtures/interactive-blocks/index.md?raw"
import mathAndLegacy from "../../../../shared/onsite/fixtures/math-and-legacy/index.md?raw"
import { createBlockExtensions } from "../../index"
import { ArticleParagraph, textFormatExtensions } from "../../text-formats"
import "../../../../../../../assets/css/extended/text-presets.css"

declare global {
  interface Window {
    harness: {
      readonly editor: Editor
      readonly source: string
      readonly fixture: string
    }
  }
}

const fixtures: Readonly<Record<string, string>> = {
  "image-layouts": imageLayouts,
  "interactive-blocks": interactiveBlocks,
  "math-and-legacy": mathAndLegacy,
}

function bodyOf(markdown: string): string {
  return markdown
    .replace(/^---\n[\s\S]*?\n---\n+/, "")
    .replace(/^<!-- b:[A-Za-z0-9_-]+ -->\n/gm, "")
    .replace(/\n+$/, "")
}

const params = new URLSearchParams(window.location.search)
const fixture = params.get("fixture") ?? "image-layouts"
const theme = params.get("theme")
if (theme === "light" || theme === "dark") {
  document.documentElement.dataset["theme"] = theme
}
const source = bodyOf(fixtures[fixture] ?? "")
const element = document.querySelector<HTMLElement>("#editor")
if (!element) {
  throw new Error("Harness requires #editor")
}

const editor = new Editor({
  element,
  extensions: [
    StarterKit.configure({
      link: false,
      paragraph: false,
      trailingNode: { notAfter: ["footnoteSection"] },
    }),
    ArticleParagraph,
    ...textFormatExtensions(),
    Markdown.configure({ markedOptions: { gfm: true } }),
    ...createBlockExtensions({
      mediaUrl: (src) => (/^(?:https?:)?\//.test(src) ? src : `/fixtures/${fixture}/${src}`),
    }),
  ],
  content: source,
  contentType: "markdown",
  editorProps: {
    attributes: { class: "post-content", "aria-label": "블로그 본문" },
  },
})

window.harness = { editor, source, fixture }
document.body.dataset["ready"] = "1"
