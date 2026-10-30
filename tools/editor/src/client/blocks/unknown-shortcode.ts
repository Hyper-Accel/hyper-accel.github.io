import { Node } from "@tiptap/core"
import { figureSource, shortcodeLabel } from "../shortcode"
import { attrString, el } from "./dom"
import type { ResolvedBlockOptions } from "./options"
import { SHORTCODE_TOKEN, shortcodeTokenizer } from "./tokenizers"

export const UNKNOWN_SHORTCODE_NODE = "hugoShortcode"

export function createUnknownShortcodeNode(options: ResolvedBlockOptions) {
  return Node.create({
    name: UNKNOWN_SHORTCODE_NODE,
    group: "block",
    atom: true,
    draggable: true,
    priority: 50,
    markdownTokenName: SHORTCODE_TOKEN,

    addAttributes() {
      return {
        raw: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-raw") ?? "",
          renderHTML: (attributes) => ({ "data-raw": attrString(attributes, "raw") }),
        },
      }
    },

    parseHTML() {
      return [{ tag: "div[data-hugo-shortcode]" }]
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", { "data-hugo-shortcode": "", ...HTMLAttributes }]
    },

    markdownTokenizer: shortcodeTokenizer,

    parseMarkdown: (token) => ({
      type: UNKNOWN_SHORTCODE_NODE,
      attrs: { raw: typeof token.raw === "string" ? token.raw : "" },
    }),

    renderMarkdown: (node) => attrString(node.attrs ?? {}, "raw"),

    addNodeView() {
      return ({ node }) => {
        const raw = attrString(node.attrs, "raw")
        const source = figureSource(raw)
        const dom = el(
          "div",
          { className: "hugo-shortcode", "data-hugo-shortcode": true, contenteditable: "false" },
          [
            source ? el("img", { src: options.mediaUrl(source), alt: "" }) : null,
            el("span", { className: "hugo-shortcode__label", textContent: shortcodeLabel(raw) }),
            el("code", { textContent: raw }),
          ],
        )
        return { dom }
      }
    },
  })
}

export function createHugoShortcode(mediaUrl: (source: string) => string) {
  return createUnknownShortcodeNode({
    mediaUrl,
    requestImage: null,
    slashMenu: false,
    dropZones: false,
  })
}
