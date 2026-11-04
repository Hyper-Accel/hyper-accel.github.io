import Heading from "@tiptap/extension-heading"
import { headingAnchor, headingTokens } from "../../document/heading-anchor"

export const ArticleHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: { default: null, parseHTML: (element) => element.getAttribute("id") },
    }
  },
  parseMarkdown(token, helpers) {
    const heading = headingAnchor(token.text ?? "")
    return helpers.createNode(
      "heading",
      { level: token.depth || 1, id: heading.id },
      helpers.parseInline(heading.id ? headingTokens(token.tokens ?? []) : (token.tokens ?? [])),
    )
  },
  renderMarkdown(node, helpers) {
    const level = typeof node.attrs?.["level"] === "number" ? node.attrs["level"] : 1
    const id = node.attrs?.["id"]
    return `${"#".repeat(level)} ${helpers.renderChildren(node.content ?? [])}${typeof id === "string" && id ? ` {#${id}}` : ""}`
  },
})
