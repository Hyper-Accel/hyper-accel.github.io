import { type Editor, InputRule, Node } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { NodeSelection, Plugin, Selection } from "@tiptap/pm/state"
import type { NodeView } from "@tiptap/pm/view"
import katex from "katex"
import "katex/dist/katex.min.css"
import { attrNullableString, attrString, el, isUiTarget } from "./dom"
import { loadMathfield, MathInput, type MathLeave, mathError } from "./math-input"
import type { MathToken } from "./tokenizers"
import { mathBlockTokenizer, mathInlineTokenizer } from "./tokenizers"

export const MATH_BLOCK_NODE = "mathBlock"
export const MATH_INLINE_NODE = "mathInline"

function renderMath(target: HTMLElement, source: string, displayMode: boolean): void {
  if (source.trim() === "") {
    target.textContent = displayMode ? "수식을 입력하세요" : "수식"
    target.classList.add("is-empty")
    return
  }
  target.classList.remove("is-empty")
  katex.render(source, target, { displayMode, throwOnError: false, output: "htmlAndMathml" })
}

function mathToken(token: { readonly source?: unknown; readonly display?: unknown }): {
  source: string
  display: boolean
} {
  return {
    source: typeof token.source === "string" ? token.source : "",
    display: token.display === true,
  }
}

const mathViews = new WeakMap<Element, MathView>()

/** Keys typed on a selected formula go into its editor instead of replacing the formula. */
function mathTypeAhead(): Plugin {
  return new Plugin({
    props: {
      handleTextInput(view, _from, _to, text) {
        const { selection } = view.state
        if (!(selection instanceof NodeSelection)) return false
        const dom = view.nodeDOM(selection.from)
        const target = dom instanceof Element ? mathViews.get(dom) : undefined
        return target ? target.typeAhead(text) : false
      },
    },
  })
}

class MathView implements NodeView {
  readonly dom: HTMLElement
  private readonly preview: HTMLElement
  private readonly input: MathInput
  private node: PMNode

  constructor(
    node: PMNode,
    private readonly editor: Editor,
    private readonly getPos: () => number | undefined,
    private readonly block: boolean,
  ) {
    this.node = node
    this.preview = el(block ? "div" : "span", { className: "onsite-math__preview" })
    this.input = new MathInput({
      display: block || node.attrs["display"] === true,
      onInput: (source) => this.commit(source),
      onLeave: (where) => this.leave(where),
    })
    this.dom = block
      ? el(
          "div",
          {
            className: "math-block onsite-math",
            "data-onsite-math": true,
            contenteditable: "false",
          },
          [this.preview, this.input.element],
        )
      : el(
          "span",
          { className: "math-inline onsite-math-inline", "data-onsite-math-inline": true },
          [this.preview, this.input.element],
        )
    this.dom.addEventListener("mousedown", (event) => {
      if (isUiTarget(event.target)) return
      const pos = this.getPos()
      if (pos === undefined) return
      event.preventDefault()
      this.editor.view.focus()
      this.editor.commands.setNodeSelection(pos)
    })
    mathViews.set(this.dom, this)
    this.render()
  }

  typeAhead(text: string): boolean {
    if (!this.input.isOpen) return false
    this.input.typeAhead(text)
    return true
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) {
      return false
    }
    this.node = node
    this.render()
    return true
  }

  /** Selecting a formula edits it in place, still rendered (MathLive). */
  selectNode(): void {
    this.dom.classList.add("ProseMirror-selectednode", "is-selected")
    if (!this.editor.isEditable) return
    this.preview.hidden = true
    void this.input.open(this.source(), true)
  }

  deselectNode(): void {
    this.dom.classList.remove("ProseMirror-selectednode", "is-selected")
    this.input.close()
    this.preview.hidden = false
    // An empty formula is never kept: leaving it removes it.
    if (this.source().trim() === "") setTimeout(() => this.removeIfEmpty(), 0)
  }

  stopEvent(event: Event): boolean {
    return isUiTarget(event.target) || event.type === "mousedown" || event.type === "click"
  }

  ignoreMutation(): boolean {
    return true
  }

  destroy(): void {
    this.input.destroy()
  }

  private source(): string {
    return attrString(this.node.attrs, "source")
  }

  private commit(source: string): void {
    const pos = this.getPos()
    if (pos === undefined) {
      return
    }
    const tr = this.editor.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, source })
    tr.setSelection(NodeSelection.create(tr.doc, pos))
    this.editor.view.dispatch(tr)
  }

  /** Esc, or an arrow past the formula's edge, returns the caret to the text around it. */
  private leave(where: MathLeave): void {
    const pos = this.getPos()
    if (pos === undefined) return
    const { state } = this.editor
    const tr = state.tr
    if (this.source().trim() === "") {
      tr.delete(pos, pos + this.node.nodeSize)
      tr.setSelection(Selection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size)), -1))
    } else {
      const at = where === "before" ? pos : pos + this.node.nodeSize
      tr.setSelection(Selection.near(tr.doc.resolve(at), where === "before" ? -1 : 1))
    }
    this.editor.view.focus()
    this.editor.view.dispatch(tr.scrollIntoView())
  }

  private removeIfEmpty(): void {
    const pos = this.getPos()
    if (pos === undefined) return
    const current = this.editor.state.doc.nodeAt(pos)
    if (current?.type !== this.node.type || attrString(current.attrs, "source").trim() !== "")
      return
    const { selection } = this.editor.state
    if (selection instanceof NodeSelection && selection.from === pos) return
    this.editor.view.dispatch(this.editor.state.tr.delete(pos, pos + current.nodeSize))
  }

  private render(): void {
    const source = this.source()
    const display = this.block || this.node.attrs["display"] === true
    renderMath(this.preview, source, display)
    this.preview.classList.toggle("has-error", mathError(source, display) !== null)
    if (this.input.isOpen) this.input.sync(source)
  }
}

export function createMathBlockNode() {
  return Node.create({
    name: MATH_BLOCK_NODE,
    group: "block",
    atom: true,
    draggable: true,

    addAttributes() {
      return {
        source: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-source") ?? "",
          renderHTML: (attributes) => ({ "data-source": attrString(attributes, "source") }),
        },
        raw: { default: null, rendered: false },
      }
    },

    parseHTML() {
      return [{ tag: "div[data-onsite-math]" }]
    },

    renderHTML({ node, HTMLAttributes }) {
      return [
        "div",
        { ...HTMLAttributes, class: "math-block", "data-onsite-math": "" },
        `$$${attrString(node.attrs, "source")}$$`,
      ]
    },

    onCreate() {
      if (typeof requestIdleCallback === "function")
        requestIdleCallback(() => void loadMathfield().catch(reportError))
    },

    markdownTokenizer: mathBlockTokenizer,

    parseMarkdown: (token) => ({
      type: MATH_BLOCK_NODE,
      attrs: {
        source: mathToken(token as MathToken).source,
        raw: typeof token.raw === "string" ? token.raw : null,
      },
    }),

    renderMarkdown: (node) => {
      const attrs = node.attrs ?? {}
      // An empty formula is never written out (it would publish as a stray "$$ $$").
      if (attrString(attrs, "source").trim() === "") return ""
      return attrNullableString(attrs, "raw") ?? `$$\n${attrString(attrs, "source")}\n$$`
    },

    addNodeView() {
      return ({ node, editor, getPos }) => new MathView(node, editor, getPos, true)
    },

    addProseMirrorPlugins() {
      return [mathTypeAhead()]
    },
  })
}

export function createMathInlineNode() {
  return Node.create({
    name: MATH_INLINE_NODE,
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,

    addAttributes() {
      return {
        source: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-source") ?? "",
          renderHTML: (attributes) => ({ "data-source": attrString(attributes, "source") }),
        },
        display: {
          default: false,
          parseHTML: (element) => element.getAttribute("data-display") === "true",
          renderHTML: (attributes) =>
            attributes["display"] === true ? { "data-display": "true" } : {},
        },
        raw: { default: null, rendered: false },
      }
    },

    parseHTML() {
      return [{ tag: "span[data-onsite-math-inline]" }]
    },

    renderHTML({ node, HTMLAttributes }) {
      const source = attrString(node.attrs, "source")
      const display = node.attrs["display"] === true
      return [
        "span",
        { ...HTMLAttributes, class: "math-inline", "data-onsite-math-inline": "" },
        display ? `$$${source}$$` : `$${source}$`,
      ]
    },

    // Typing $E=mc^2$ in a line turns it into an inline formula (as in the published Markdown).
    addInputRules() {
      return [
        new InputRule({
          find: /(?<![\w$\\])\$([^$\s](?:[^$]*[^$\s])?)\$$/,
          handler: ({ state, range, match }) => {
            const source = match[1]
            if (!source) return null
            state.tr.replaceWith(range.from, range.to, this.type.create({ source }))
          },
        }),
      ]
    },

    markdownTokenizer: mathInlineTokenizer,

    parseMarkdown: (token) => {
      const { source, display } = mathToken(token as MathToken)
      return {
        type: MATH_INLINE_NODE,
        attrs: { source, display, raw: typeof token.raw === "string" ? token.raw : null },
      }
    },

    renderMarkdown: (node) => {
      const attrs = node.attrs ?? {}
      const source = attrString(attrs, "source")
      if (source.trim() === "") return ""
      const raw = attrNullableString(attrs, "raw")
      if (raw !== null) {
        return raw
      }
      return attrs["display"] === true ? `$$${source}$$` : `$${source}$`
    },

    addNodeView() {
      return ({ node, editor, getPos }) => new MathView(node, editor, getPos, false)
    },

    addProseMirrorPlugins() {
      return [mathTypeAhead()]
    },
  })
}
