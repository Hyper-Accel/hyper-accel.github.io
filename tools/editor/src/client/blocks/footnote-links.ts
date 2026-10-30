import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"

/** The note number a writer jumped from, so ↩ brings them back to that very spot. */
const jumpedFrom = new WeakMap<EditorView, { readonly label: string; readonly pos: number }>()

/** Where a footnote jump landed (number or note), marked for a moment so the eye finds it. */
interface Landing {
  readonly from: number
  readonly to: number
}
const landed = new PluginKey<Landing | null>("footnoteLanded")
const GLOW_MS = 1600

/** Backlinks are view decorations, not editable text or Markdown content. */
export function footnoteLinks(): Plugin {
  return new Plugin({
    key: landed,
    state: {
      init: (): Landing | null => null,
      apply(tr, value: Landing | null): Landing | null {
        const meta: unknown = tr.getMeta(landed)
        if (meta !== undefined) return meta as Landing | null
        if (!value || !tr.docChanged) return value
        return { from: tr.mapping.map(value.from), to: tr.mapping.map(value.to, -1) }
      },
    },
    props: {
      decorations(state) {
        const counts = new Map<string, number>()
        state.doc.descendants((node) => {
          if (node.type.name === "footnoteReference") {
            const label: unknown = node.attrs["label"]
            if (typeof label === "string") counts.set(label, (counts.get(label) ?? 0) + 1)
          }
        })
        const decorations: Decoration[] = []
        state.doc.descendants((node, pos) => {
          if (node.type.name === "footnoteSection") {
            let visible = false
            node.forEach((definition) => {
              visible ||= counts.has(definition.attrs["label"])
            })
            if (!visible)
              decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: "display:none" }))
          }
          if (node.type.name !== "footnoteDefinition") return
          const label: unknown = node.attrs["label"]
          if (typeof label === "string" && !counts.has(label)) {
            decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: "display:none" }))
            return
          }
          if (typeof label !== "string" || !node.lastChild?.isTextblock) return
          decorations.push(
            Decoration.widget(
              pos + node.nodeSize - 2,
              () => {
                const span = document.createElement("span")
                span.contentEditable = "false"
                for (let index = 0; index < (counts.get(label) ?? 0); index++) {
                  span.append("\u00a0")
                  const link = document.createElement("a")
                  link.className = "footnote-backref"
                  link.role = "doc-backlink"
                  link.href = `#fnref${index || ""}:${label}`
                  link.dataset["footnoteBack"] = label
                  link.dataset["footnoteIndex"] = String(index)
                  link.title = "본문으로 돌아가기"
                  link.setAttribute("aria-label", "본문으로 돌아가기")
                  link.textContent = "\u21a9\ufe0e"
                  span.append(link)
                }
                return span
              },
              { side: -1, key: `footnote-back-${label}-${counts.get(label) ?? 0}` },
            ),
          )
        })
        const glow = landed.getState(state)
        if (glow && glow.to > glow.from)
          decorations.push(Decoration.node(glow.from, glow.to, { class: "is-footnote-target" }))
        return DecorationSet.create(state.doc, decorations)
      },
      handleClick(view, _position, event) {
        const target = event.target
        if (!(target instanceof Element)) return false
        const link = target.closest("a.footnote-ref, a.footnote-backref")
        if (!link) return false
        const backward = link.hasAttribute("data-footnote-back")
        const label = backward
          ? link.getAttribute("data-footnote-back")
          : link.closest("sup")?.getAttribute("data-footnote")
        if (typeof label !== "string") return false
        // Back goes to the number the writer came from; otherwise to this backlink's own number.
        const origin = jumpedFrom.get(view)
        const wanted = Number(link.getAttribute("data-footnote-index") ?? "0")
        let destination: number | null = null
        let landing: { from: number; to: number } | null = null
        let seen = 0
        view.state.doc.descendants((node: PMNode, pos) => {
          if (destination !== null) return false
          if (node.attrs["label"] !== label) return true
          if (!backward && node.type.name === "footnoteDefinition") {
            destination = pos + 2
            landing = { from: pos, to: pos + node.nodeSize }
          }
          if (backward && node.type.name === "footnoteReference") {
            if (origin?.label === label ? pos === origin.pos : seen === wanted) {
              destination = pos
              landing = { from: pos, to: pos + node.nodeSize }
            }
            seen += 1
          }
          return true
        })
        if (backward && destination === null && origin?.label === label) {
          view.state.doc.descendants((node: PMNode, pos) => {
            if (
              destination === null &&
              node.type.name === "footnoteReference" &&
              node.attrs["label"] === label
            ) {
              destination = pos
              landing = { from: pos, to: pos + node.nodeSize }
            }
            return destination === null
          })
        }
        if (destination === null || landing === null) return false
        event.preventDefault()
        if (!backward) {
          const sup = link.closest("sup")
          if (sup) jumpedFrom.set(view, { label, pos: view.posAtDOM(sup, 0) })
        } else jumpedFrom.delete(view)
        view.dispatch(
          view.state.tr
            .setSelection(TextSelection.near(view.state.doc.resolve(destination)))
            .setMeta(landed, landing)
            .scrollIntoView(),
        )
        view.focus()
        setTimeout(() => {
          if (!view.isDestroyed && landed.getState(view.state))
            view.dispatch(view.state.tr.setMeta(landed, null).setMeta("addToHistory", false))
        }, GLOW_MS)
        return true
      },
    },
  })
}
