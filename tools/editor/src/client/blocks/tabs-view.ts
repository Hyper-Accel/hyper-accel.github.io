import type { Editor } from "@tiptap/core"
import { closeHistory } from "@tiptap/pm/history"
import type { Node as PMNode } from "@tiptap/pm/model"
import { TextSelection, type Transaction } from "@tiptap/pm/state"
import type { NodeView, ViewMutationRecord } from "@tiptap/pm/view"
import { setParam } from "../shortcode"
import { attrJson, toParams } from "./attrs"
import { el, isUiTarget, toggleHidden, UI_ATTRIBUTE } from "./dom"
import { TabControls } from "./tab-controls"
import { TAB_NODE, tabName, tabParams } from "./tabs"

export class TabsView implements NodeView {
  readonly dom: HTMLElement
  readonly contentDOM: HTMLElement
  private readonly controls: TabControls
  private node: PMNode
  private active = 0
  private readonly onSelection = (): void => this.syncSelection()
  private readonly onBlur = ({ event }: { readonly event: FocusEvent }): void => {
    if (event.relatedTarget instanceof globalThis.Node && this.dom.contains(event.relatedTarget))
      return
    this.dom.classList.remove("is-focused")
    this.render()
  }

  constructor(
    node: PMNode,
    private readonly editor: Editor,
    private readonly getPos: () => number | undefined,
  ) {
    this.node = node
    const list = el("div", {
      className: "tabs-list",
      role: "tablist",
      "aria-label": "탭",
      [UI_ATTRIBUTE]: true,
      contenteditable: "false",
    })
    this.contentDOM = el("div", { className: "tabs-panels" })
    this.dom = el("div", { className: "tabs is-ready onsite-tabs", "data-onsite-tabs": true }, [
      list,
      this.contentDOM,
    ])
    this.controls = new TabControls(list, {
      select: (index) => this.select(index),
      rename: (index, name) => this.rename(index, name),
      move: (from, to) => this.move(from, to),
      remove: (index) => this.remove(index),
      add: () => this.add(),
    })
    this.dom.addEventListener("focusin", () => {
      this.dom.classList.add("is-focused")
    })
    editor.on("selectionUpdate", this.onSelection)
    editor.on("blur", this.onBlur)
    this.render()
    queueMicrotask(() => this.applyPanels())
  }
  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.active = Math.min(this.active, node.childCount - 1)
    this.render()
    queueMicrotask(() => this.applyPanels())
    return true
  }
  stopEvent(event: Event): boolean {
    return isUiTarget(event.target)
  }
  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return mutation.type !== "selection" && !this.contentDOM.contains(mutation.target)
  }
  destroy(): void {
    this.editor.off("selectionUpdate", this.onSelection)
    this.editor.off("blur", this.onBlur)
  }
  private entries() {
    const pos = this.getPos()
    const entries: { readonly node: PMNode; readonly pos: number; readonly index: number }[] = []
    if (pos !== undefined)
      this.node.forEach((node, offset, index) => {
        entries.push({ node, pos: pos + 1 + offset, index })
      })
    return entries
  }
  private select(index: number): void {
    this.active = index
    const entry = this.entries()[index]
    if (!entry) return
    this.editor.view.dispatch(
      this.editor.state.tr.setSelection(
        TextSelection.near(this.editor.state.doc.resolve(entry.pos + 1)),
      ),
    )
    this.editor.view.focus()
    this.dom.classList.add("is-focused")
    this.render()
    this.applyPanels()
  }
  private syncSelection(): void {
    const pos = this.getPos()
    if (pos === undefined) return
    const { from } = this.editor.state.selection
    const inside = from > pos && from < pos + this.node.nodeSize
    this.dom.classList.toggle("is-focused", inside)
    const entry = this.entries().find(
      (candidate) => from >= candidate.pos && from < candidate.pos + candidate.node.nodeSize,
    )
    if (entry) this.active = entry.index
    this.render()
    this.applyPanels()
  }
  private dispatch(tr: Transaction): void {
    this.editor.view.dispatch(closeHistory(tr))
  }
  private rename(index: number, name: string): void {
    const entry = this.entries()[index]
    if (!entry) return
    this.dispatch(
      this.editor.state.tr.setNodeMarkup(entry.pos, undefined, {
        ...entry.node.attrs,
        params: setParam(toParams(attrJson(entry.node.attrs, "params")), "name", name),
      }),
    )
  }
  private add(): void {
    const pos = this.getPos()
    if (pos === undefined) return
    const at = pos + this.node.nodeSize - 1
    this.active = this.node.childCount
    const tr = this.editor.state.tr.insert(
      at,
      this.editor.schema.node(
        TAB_NODE,
        { params: tabParams(`탭 ${this.active + 1}`) },
        this.editor.schema.node("paragraph"),
      ),
    )
    this.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)))
    this.editor.view.focus()
  }
  private remove(index: number): void {
    const entry = this.entries()[index]
    if (!entry) return
    if (this.node.childCount === 1) {
      const pos = this.getPos()
      if (pos === undefined) return
      const tr = this.editor.state.tr.replaceWith(
        pos,
        pos + this.node.nodeSize,
        this.editor.schema.node("paragraph", this.node.attrs),
      )
      this.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 1)))
      this.editor.view.focus()
      return
    }
    this.active = Math.min(index, this.node.childCount - 2)
    const tr = this.editor.state.tr.delete(entry.pos, entry.pos + entry.node.nodeSize)
    this.dispatch(
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(entry.pos, tr.doc.content.size)))),
    )
    this.editor.view.focus()
  }
  private move(from: number, to: number): void {
    const entries = this.entries()
    const entry = entries[from]
    const target = entries[to]
    if (!entry || !target || from === to) return
    const at = from < to ? target.pos + target.node.nodeSize - entry.node.nodeSize : target.pos
    this.active = to
    const tr = this.editor.state.tr
      .delete(entry.pos, entry.pos + entry.node.nodeSize)
      .insert(at, entry.node)
    this.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1))))
    this.controls.focus(to)
  }
  private render(): void {
    const names = this.entries().map((entry) =>
      tabName(toParams(attrJson(entry.node.attrs, "params")), entry.index),
    )
    this.controls.render(
      names,
      this.active,
      this.dom.classList.contains("is-focused") && this.editor.isEditable,
    )
  }
  private applyPanels(): void {
    Array.from(this.contentDOM.children).forEach((panel, index) => {
      if (panel instanceof HTMLElement) toggleHidden(panel, index !== this.active)
    })
  }
}
