import { Extension } from "@tiptap/core"
import { Fragment, type Node as PMNode } from "@tiptap/pm/model"
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { slashMenuKey } from "../blocks/slash-menu"
import { h } from "./dom"

/**
 * Confluence-style block handles: hovering a top-level block shows "+" (insert through the "/"
 * menu) and a drag handle that moves the block or, when clicked, opens a small block menu.
 */
interface Hovered {
  readonly pos: number
  readonly node: PMNode
  readonly dom: HTMLElement
}

const handlesKey = new PluginKey("composerBlockHandles")

function topLevelAt(view: EditorView, x: number, y: number): Hovered | null {
  const bounds = view.dom.getBoundingClientRect()
  const found = view.posAtCoords({
    left: Math.max(bounds.left + 4, Math.min(x, bounds.right - 4)),
    top: y,
  })
  if (!found) return null
  const $pos = view.state.doc.resolve(found.inside >= 0 ? found.inside : found.pos)
  const pos = $pos.depth === 0 ? found.inside : $pos.before(1)
  if (pos < 0) return null
  const node = view.state.doc.nodeAt(pos)
  const dom = view.nodeDOM(pos)
  return node && dom instanceof HTMLElement ? { pos, node, dom } : null
}

class BlockHandles {
  private readonly root: HTMLElement
  private readonly insert: HTMLButtonElement
  private readonly grip: HTMLButtonElement
  private readonly menu: HTMLElement
  private hovered: Hovered | null = null
  private hideTimer = 0

  constructor(private readonly view: EditorView) {
    this.insert = h(
      "button",
      {
        type: "button",
        class: "composer-handle",
        "aria-label": "아래에 블록 삽입",
        title: "블록 삽입 (/)",
      },
      "+",
    )
    this.grip = h(
      "button",
      {
        type: "button",
        class: "composer-handle composer-handle--grip",
        draggable: "true",
        "aria-label": "블록 메뉴",
        "aria-haspopup": "menu",
        title: "끌어서 이동, 눌러서 메뉴",
      },
      "⋮⋮",
    )
    this.menu = h("div", { class: "composer-block-menu", role: "menu", hidden: true })
    this.root = h(
      "div",
      { class: "composer-handles", hidden: true, "data-onsite-ui": "" },
      this.insert,
      this.grip,
      this.menu,
    )
    for (const control of [this.insert, this.grip])
      control.addEventListener("mousedown", (event) => event.preventDefault())
    this.insert.addEventListener("click", () => this.insertBelow())
    this.grip.addEventListener("click", () => this.toggleMenu())
    this.grip.addEventListener("dragstart", (event) => this.dragStart(event))
    this.root.addEventListener("mouseenter", () => window.clearTimeout(this.hideTimer))
    this.root.addEventListener("mouseleave", () => this.scheduleHide())
    this.menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.closeMenu(true)
    })
    document.body.append(this.root)
    view.dom.addEventListener("mousemove", this.onMove)
    view.dom.addEventListener("mouseleave", this.onLeave)
    window.addEventListener("scroll", this.onScroll, { passive: true })
  }

  private readonly onMove = (event: MouseEvent): void => {
    if (!this.view.editable || !this.menu.hidden) return
    const hovered = topLevelAt(this.view, event.clientX, event.clientY)
    if (!hovered) return
    window.clearTimeout(this.hideTimer)
    this.hovered = hovered
    this.place()
  }

  private readonly onLeave = (): void => this.scheduleHide()
  private readonly onScroll = (): void => {
    if (!this.root.hidden) this.place()
  }

  /** Touch screens have no hover: follow the block holding the caret. */
  follow(): void {
    if (!window.matchMedia("(pointer: coarse)").matches || !this.view.hasFocus()) return
    const { $from } = this.view.state.selection
    if ($from.depth < 1) return
    const pos = $from.before(1)
    const node = this.view.state.doc.nodeAt(pos)
    const dom = this.view.nodeDOM(pos)
    if (!node || !(dom instanceof HTMLElement)) return
    this.hovered = { pos, node, dom }
    this.place()
  }

  private scheduleHide(): void {
    window.clearTimeout(this.hideTimer)
    this.hideTimer = window.setTimeout(() => {
      if (this.menu.hidden) this.root.hidden = true
    }, 250)
  }

  private place(): void {
    const target = this.hovered
    if (!target?.dom.isConnected) {
      this.root.hidden = true
      return
    }
    const rect = target.dom.getBoundingClientRect()
    const style = getComputedStyle(target.dom)
    const line = Number.parseFloat(style.lineHeight) || 24
    const marginTop = Number.parseFloat(style.paddingTop) || 0
    this.root.hidden = false
    const width = this.root.offsetWidth
    // Narrow screens have no gutter; covering the first words would block taps, so stay hidden.
    if (rect.left - width - 6 < 0) {
      this.root.hidden = true
      return
    }
    const left = rect.left - width - 6
    const top = rect.top + marginTop + Math.max(0, (Math.min(line, rect.height) - 28) / 2)
    this.root.style.left = `${Math.round(left)}px`
    this.root.style.top = `${Math.round(top)}px`
  }

  private current(): Hovered | null {
    const target = this.hovered
    if (!target) return null
    const node = this.view.state.doc.nodeAt(target.pos)
    return node ? { ...target, node } : null
  }

  private insertBelow(): void {
    const target = this.current()
    if (!target) return
    const { state } = this.view
    const paragraph = state.schema.nodes["paragraph"]
    if (!paragraph) return
    let tr = state.tr
    let at: number
    if (target.node.type === paragraph && target.node.content.size === 0) {
      at = target.pos + 1
    } else {
      const end = target.pos + target.node.nodeSize
      tr = tr.insert(end, paragraph.create())
      at = end + 1
    }
    tr = tr
      .setSelection(TextSelection.create(tr.doc, at))
      .insertText("/", at)
      .setMeta(slashMenuKey, { from: at })
    this.view.dispatch(tr.scrollIntoView())
    this.view.focus()
  }

  private toggleMenu(): void {
    if (!this.menu.hidden) {
      this.closeMenu(true)
      return
    }
    const target = this.current()
    if (!target) return
    this.view.dispatch(
      this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, target.pos)),
    )
    const { doc } = this.view.state
    const $pos = doc.resolve(target.pos)
    const index = $pos.index(0)
    const item = (label: string, enabled: boolean, run: () => void): HTMLButtonElement => {
      const control = h("button", { type: "button", role: "menuitem", disabled: !enabled }, label)
      control.addEventListener("click", () => {
        run()
        this.closeMenu(true)
      })
      return control
    }
    this.menu.replaceChildren(
      item("위로 이동", index > 0, () => this.move(-1)),
      item("아래로 이동", index < doc.childCount - 1, () => this.move(1)),
      item("복제", true, () => this.duplicate()),
      item("삭제", true, () => this.remove()),
    )
    this.menu.hidden = false
    this.grip.setAttribute("aria-expanded", "true")
    this.menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus()
  }

  private closeMenu(refocus = false): void {
    this.menu.hidden = true
    this.grip.setAttribute("aria-expanded", "false")
    if (refocus) this.view.focus()
  }

  private move(direction: -1 | 1): void {
    const target = this.current()
    if (!target) return
    const { doc } = this.view.state
    const index = doc.resolve(target.pos).index(0)
    const neighbourIndex = index + direction
    if (neighbourIndex < 0 || neighbourIndex >= doc.childCount) return
    const neighbour = doc.child(neighbourIndex)
    const tr = this.view.state.tr.delete(target.pos, target.pos + target.node.nodeSize)
    const insertAt =
      direction < 0 ? target.pos - neighbour.nodeSize : target.pos + neighbour.nodeSize
    tr.insert(insertAt, target.node)
    if (NodeSelection.isSelectable(target.node))
      tr.setSelection(NodeSelection.create(tr.doc, insertAt))
    else tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)))
    this.view.dispatch(tr.scrollIntoView())
    this.hovered = { ...target, pos: insertAt }
  }

  private duplicate(): void {
    const target = this.current()
    if (!target) return
    const end = target.pos + target.node.nodeSize
    this.view.dispatch(
      this.view.state.tr
        .insert(end, Fragment.from(target.node.copy(target.node.content)))
        .scrollIntoView(),
    )
  }

  private remove(): void {
    const target = this.current()
    if (!target) return
    this.view.dispatch(this.view.state.tr.delete(target.pos, target.pos + target.node.nodeSize))
    this.root.hidden = true
  }

  private dragStart(event: DragEvent): void {
    const target = this.current()
    if (!target || !event.dataTransfer) return
    const selection = NodeSelection.create(this.view.state.doc, target.pos)
    this.view.dispatch(this.view.state.tr.setSelection(selection))
    const slice = selection.content()
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", target.node.textContent)
    event.dataTransfer.setDragImage(target.dom, 0, 0)
    // ProseMirror's own drop handling moves `view.dragging` content and deletes the source.
    this.view.dragging = { slice, move: true }
  }

  destroy(): void {
    window.clearTimeout(this.hideTimer)
    this.view.dom.removeEventListener("mousemove", this.onMove)
    this.view.dom.removeEventListener("mouseleave", this.onLeave)
    window.removeEventListener("scroll", this.onScroll)
    this.root.remove()
  }
}

export const BlockHandlesExtension = Extension.create({
  name: "composerBlockHandles",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: handlesKey,
        view(view) {
          const handles = new BlockHandles(view)
          return { update: () => handles.follow(), destroy: () => handles.destroy() }
        },
      }),
    ]
  },
})
