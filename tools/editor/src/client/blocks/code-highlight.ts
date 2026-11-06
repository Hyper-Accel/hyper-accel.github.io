import CodeBlock from "@tiptap/extension-code-block"
import type { Node } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { chromaTokens } from "./chroma-runtime"
import "./code-highlight.css"

/** Languages with syntax colours in the editor (the published post colours them with Chroma). */
export const CODE_LANGUAGES: readonly { readonly id: string; readonly label: string }[] = [
  { id: "", label: "일반 텍스트" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "python", label: "Python" },
  { id: "bash", label: "Bash" },
  { id: "go", label: "Go" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML" },
  { id: "toml", label: "TOML" },
  { id: "fsharp", label: "F#" },
]

let tokenize: typeof chromaTokens | undefined
const key = new PluginKey<DecorationSet>("chroma")

function decorations(doc: Node): DecorationSet {
  const spans: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== "codeBlock" || !tokenize) return
    const result = tokenize(node.attrs["language"] ?? "", node.textContent)
    if (result.highlighted)
      spans.push(Decoration.node(pos, pos + node.nodeSize, { class: "chroma" }))
    let from = pos + 1
    const end = from + node.textContent.length
    for (const token of result.tokens) {
      const to = Math.min(end, from + token.text.length)
      if (token.class && from < to) spans.push(Decoration.inline(from, to, { class: token.class }))
      from = to
    }
  })
  return DecorationSet.create(doc, spans)
}

/** Hugo's Chroma lexer and the site's existing .chroma palette, including language aliases. */
export const HighlightedCodeBlock = CodeBlock.extend({
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => decorations(state.doc),
          apply: (tr, previous) =>
            tr.docChanged || tr.getMeta(key)
              ? decorations(tr.doc)
              : previous.map(tr.mapping, tr.doc),
        },
        props: { decorations: (state) => key.getState(state) },
        view(view) {
          let destroyed = false
          let requested = false
          // Chroma (a 1.9MB WebAssembly lexer) loads only once the post has a code block.
          const load = (doc: Node): void => {
            if (requested) return
            let found = false
            doc.descendants((node) => {
              if (node.type.name === "codeBlock") found = true
              return !found
            })
            if (!found) return
            requested = true
            void import("./chroma-runtime").then((module) => {
              tokenize = module.chromaTokens
              if (!destroyed) view.dispatch(view.state.tr.setMeta(key, true))
            })
          }
          load(view.state.doc)
          return {
            update: (next, previous) => {
              if (next.state.doc !== previous.doc) load(next.state.doc)
            },
            destroy: () => {
              destroyed = true
            },
          }
        },
      }),
    ]
  },
}).configure({
  defaultLanguage: null,
})
