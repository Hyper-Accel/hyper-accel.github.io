import { type Editor, Extension, type JSONContent, Node } from "@tiptap/core"
import { Plugin, TextSelection } from "@tiptap/pm/state"
import { scanFootnote } from "../../document/footnotes"
import { attrString } from "./dom"
import { footnoteLinks } from "./footnote-links"
import { normalizeFootnotes } from "./footnote-order"

export const FootnoteReference = Node.create({
  name: "footnoteReference",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { label: { default: "1" }, number: { default: 1, rendered: false } }
  },
  parseHTML: () => [{ tag: "sup[data-footnote]" }],
  renderHTML({ node }) {
    const label = attrString(node.attrs, "label")
    return [
      "sup",
      { "data-footnote": label, id: `fnref:${label}` },
      [
        "a",
        { href: `#fn:${label}`, class: "footnote-ref", role: "doc-noteref" },
        String(node.attrs["number"]),
      ],
    ]
  },
  markdownTokenizer: {
    name: "footnoteReference",
    level: "inline",
    start: (source) => source.indexOf("[^"),
    tokenize(source) {
      const match = /^\[\^([^\]\s]+)\]/.exec(source)
      return match ? { type: "footnoteReference", raw: match[0], label: match[1] } : undefined
    },
  },
  parseMarkdown: (token) => ({ type: "footnoteReference", attrs: { label: token["label"] } }),
  renderMarkdown: (node) => `[^${attrString(node.attrs ?? {}, "label")}]`,
})

export const FootnoteDefinition = Node.create({
  name: "footnoteDefinition",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { label: { default: "1" } }
  },
  parseHTML: () => [{ tag: "li[data-footnote-definition]" }],
  renderHTML({ node }) {
    const label = attrString(node.attrs, "label")
    return ["li", { id: `fn:${label}`, "data-footnote-definition": label }, 0]
  },
  markdownTokenizer: {
    name: "footnoteDefinition",
    level: "block",
    start: (source) => /^ {0,3}\[\^[^\]\s]+\]:/m.exec(source)?.index ?? -1,
    tokenize(source, _tokens, lexer) {
      const footnote = scanFootnote(source)
      if (!footnote) return undefined
      return {
        type: "footnoteDefinition",
        raw: footnote.raw,
        label: footnote.label,
        tokens: lexer.blockTokens(footnote.body),
      }
    },
  },
  parseMarkdown: (token, helpers) => ({
    type: "footnoteDefinition",
    attrs: { label: token["label"] },
    content: token.tokens?.length ? helpers.parseChildren(token.tokens) : [{ type: "paragraph" }],
  }),
  renderMarkdown: (node, helpers) =>
    `[^${attrString(node.attrs ?? {}, "label")}]: ${helpers.renderChildren(node.content ?? [], "\n\n").replace(/\n/g, "\n    ")}`,
})

export const FootnoteSection = Node.create({
  name: "footnoteSection",
  group: "block",
  content: "footnoteDefinition+",
  parseHTML: () => [{ tag: "div.footnotes" }],
  renderHTML: () => ["div", { class: "footnotes", role: "doc-endnotes" }, ["hr"], ["ol", 0]],
  renderMarkdown: (node, helpers) => helpers.renderChildren(node.content ?? [], "\n\n"),
})

export const FootnoteOrder = Extension.create({
  name: "footnoteOrder",
  addProseMirrorPlugins() {
    return [footnoteLinks(), footnoteOrderPlugin()]
  },
})

export function footnoteOrderPlugin(): Plugin {
  return new Plugin({
    appendTransaction(transactions, _previous, state) {
      if (!transactions.some((tr) => tr.docChanged)) return null
      const doc = normalizeFootnotes(state.doc)
      return doc.eq(state.doc) ? null : state.tr.replaceWith(0, state.doc.content.size, doc.content)
    },
  })
}

/** Reference at the current selection, editable definition at the document end. */
export function insertFootnote(editor: Editor, text: string): void {
  const labels = new Set<string>()
  editor.state.doc.descendants((node) => {
    if (node.type.name === "footnoteReference" || node.type.name === "footnoteDefinition")
      labels.add(attrString(node.attrs, "label"))
  })
  let number = 1
  while (labels.has(String(number))) number++
  const label = String(number)
  const definition: JSONContent = {
    type: "footnoteDefinition",
    attrs: { label },
    content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
  }
  editor
    .chain()
    .focus()
    .insertContent({ type: "footnoteReference", attrs: { label } })
    .command(({ tr, state }) => {
      const section = tr.doc.lastChild
      const at = tr.doc.content.size
      const node = state.schema.nodeFromJSON(definition)
      if (section?.type.name === "footnoteSection") tr.insert(at - 1, node)
      else tr.insert(at, state.schema.node("footnoteSection", null, [node]))
      let position = 0
      tr.doc.descendants((child, pos) => {
        if (child.type.name === "footnoteDefinition" && child.attrs["label"] === label)
          position = pos + 2
      })
      tr.setSelection(TextSelection.near(tr.doc.resolve(position))).scrollIntoView()
      return true
    })
    .run()
}
