import { Node } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { type ImageModel, serializeImageBlock } from "../shortcode"
import { attrJson, parseJsonAttribute, toDelimiter, toImageList } from "./attrs"
import { attrNullableString, leaveSelectedNode } from "./dom"
import { PictureGroupView } from "./group-view"
import { SLIDES_NODE } from "./image-groups"
import type { ResolvedBlockOptions } from "./options"
import { SHORTCODE_TOKEN, type ShortcodeToken, shortcodeBlockKind } from "./tokenizers"

export { SLIDES_NODE }

function figureSpec(image: ImageModel) {
  const figure = { class: "figure figure-body" }
  const img = { src: image.src, alt: image.alt, loading: "lazy" }
  return image.title
    ? (["figure", figure, ["img", img], ["figcaption", {}, image.title]] as const)
    : (["figure", figure, ["img", img]] as const)
}

/** Naver's "슬라이드": pictures shown one at a time (`{{< slides >}}`). */
export function createSlidesNode(options: ResolvedBlockOptions) {
  return Node.create({
    name: SLIDES_NODE,
    group: "block",
    atom: true,
    draggable: true,
    markdownTokenName: SHORTCODE_TOKEN,

    addAttributes() {
      return {
        images: { default: [], rendered: false },
        delimiter: { default: "<", rendered: false },
        raw: { default: null, rendered: false },
      }
    },

    parseHTML() {
      return [
        {
          tag: "figure[data-onsite-slides]",
          getAttrs: (element) => ({
            images: toImageList(parseJsonAttribute(element, "data-onsite-slides")),
          }),
        },
      ]
    },

    renderHTML({ node }: { node: PMNode }) {
      const images = toImageList(attrJson(node.attrs, "images"))
      return [
        "figure",
        { class: "figure figure-slides", "data-onsite-slides": JSON.stringify(images) },
        ...images.map(figureSpec),
      ]
    },

    parseMarkdown: (token) => {
      if (shortcodeBlockKind(token) !== SLIDES_NODE) return []
      const block = token as ShortcodeToken
      return {
        type: SLIDES_NODE,
        attrs: {
          images: toImageList(block.images),
          delimiter: toDelimiter(block.delimiter),
          raw: typeof token.raw === "string" ? token.raw : null,
        },
      }
    },

    renderMarkdown: (node) => {
      const attrs = node.attrs ?? {}
      return (
        attrNullableString(attrs, "raw") ??
        serializeImageBlock(
          SLIDES_NODE,
          [],
          toImageList(attrJson(attrs, "images")),
          toDelimiter(attrJson(attrs, "delimiter")),
        )
      )
    },

    addKeyboardShortcuts() {
      return { Escape: () => leaveSelectedNode(this.editor, this.name) }
    },

    addNodeView() {
      return ({ node, editor, getPos }) =>
        new PictureGroupView(node, editor, getPos, options, SLIDES_NODE)
    },
  })
}
