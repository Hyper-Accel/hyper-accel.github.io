import { type Editor, type JSONContent, Node } from "@tiptap/core"
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"
import { serializeContainerBlock } from "../shortcode"
import { attrJson, toDelimiter } from "./attrs"
import { attrNullableString, el } from "./dom"
import { SHORTCODE_TOKEN, shortcodeBlockKind } from "./tokenizers"

export const STEPS_NODE = "steps"

export function blockContent(nodes: JSONContent[]): JSONContent[] {
  return nodes.length > 0 ? nodes : [{ type: "paragraph" }]
}

/**
 * Steps are a numbered list (the published style numbers only `<ol>` items). Anything else inside
 * becomes a step of its own, so the editor and the published post show the same numbered steps.
 */
function stepsContent(children: JSONContent[]): JSONContent[] {
  const only = children[0]
  if (children.length === 1 && only?.type === "orderedList") return children
  const items: JSONContent[] = []
  for (const child of children) {
    if (child.type === "orderedList" || child.type === "bulletList")
      items.push(...(child.content ?? []))
    else items.push({ type: "listItem", content: [child] })
  }
  if (items.length === 0) items.push({ type: "listItem", content: [{ type: "paragraph" }] })
  return [{ type: "orderedList", attrs: { start: 1 }, content: items }]
}

/** The step (list item) holding the caret, with the steps block around it. */
function currentStep(
  $from: ResolvedPos,
): { readonly depth: number; readonly steps: PMNode } | null {
  for (let depth = $from.depth; depth >= 2; depth--) {
    if (
      $from.node(depth).type.name === "listItem" &&
      $from.node(depth - 1).type.name === "orderedList" &&
      $from.node(depth - 2).type.name === STEPS_NODE
    )
      return { depth, steps: $from.node(depth - 2) }
  }
  return null
}

/** Enter on an empty last step leaves the steps for a new paragraph below (as lists do). */
function leaveSteps(editor: Editor): boolean {
  const { state } = editor
  const { $from, empty } = state.selection
  const step = empty ? currentStep($from) : null
  if (!step) return false
  const item = $from.node(step.depth)
  const list = $from.node(step.depth - 1)
  if (
    item.textContent !== "" ||
    item.childCount !== 1 ||
    $from.index(step.depth - 1) !== list.childCount - 1
  )
    return false
  const paragraph = state.schema.nodes["paragraph"]?.create()
  if (!paragraph) return false
  const stepsFrom = $from.before(step.depth - 2)
  const stepsTo = $from.after(step.depth - 2)
  const tr = state.tr
  if (list.childCount === 1) {
    tr.replaceWith(stepsFrom, stepsTo, paragraph)
    tr.setSelection(TextSelection.create(tr.doc, stepsFrom + 1))
  } else {
    tr.insert(stepsTo, paragraph)
    tr.delete($from.before(step.depth), $from.after(step.depth))
    tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(stepsTo, -1) + 1))
  }
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/** Backspace in the only, empty step removes the whole steps block. */
function removeEmptySteps(editor: Editor): boolean {
  const { state } = editor
  const { $from, empty } = state.selection
  const step = empty && $from.parentOffset === 0 ? currentStep($from) : null
  if (!step) return false
  if (step.steps.textContent !== "" || step.steps.firstChild?.childCount !== 1) return false
  const paragraph = state.schema.nodes["paragraph"]?.create()
  if (!paragraph) return false
  const from = $from.before(step.depth - 2)
  const tr = state.tr.replaceWith(from, $from.after(step.depth - 2), paragraph)
  tr.setSelection(TextSelection.create(tr.doc, from + 1))
  editor.view.dispatch(tr)
  return true
}

export function createStepsNode() {
  return Node.create({
    name: STEPS_NODE,
    group: "block",
    content: "orderedList",
    defining: true,
    markdownTokenName: SHORTCODE_TOKEN,

    addAttributes() {
      return {
        delimiter: { default: "<", rendered: false },
        raw: { default: null, rendered: false },
      }
    },

    parseHTML() {
      return [{ tag: "div[data-onsite-steps]" }]
    },

    renderHTML() {
      return ["div", { class: "steps", "data-onsite-steps": "" }, 0]
    },

    parseMarkdown: (token, helpers) => {
      if (shortcodeBlockKind(token) !== STEPS_NODE) {
        return []
      }
      const children = blockContent(helpers.parseChildren(token.tokens ?? []))
      const content = stepsContent(children)
      return {
        type: STEPS_NODE,
        attrs: {
          delimiter: toDelimiter(token["delimiter"]),
          // Steps that were not a numbered list are rewritten as one when saved.
          raw: typeof token.raw === "string" && content === children ? token.raw : null,
        },
        content,
      }
    },

    renderMarkdown: (node, helpers) => {
      const attrs = node.attrs ?? {}
      return (
        attrNullableString(attrs, "raw") ??
        serializeContainerBlock(
          STEPS_NODE,
          [],
          helpers.renderChildren(node.content ?? [], "\n\n"),
          toDelimiter(attrJson(attrs, "delimiter")),
        )
      )
    },

    addKeyboardShortcuts() {
      return {
        Enter: ({ editor }) => leaveSteps(editor),
        Backspace: ({ editor }) => removeEmptySteps(editor),
      }
    },

    addNodeView() {
      return () => {
        const dom = el("div", { className: "steps onsite-steps", "data-onsite-steps": true })
        return { dom, contentDOM: dom }
      }
    },
  })
}
