import type { Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import type { NodeView, ViewMutationRecord } from "@tiptap/pm/view"
import { ALERT_TYPES } from "../../shared/onsite/blocks"
import { ALERT_LABELS } from "../shortcode"
import { alertIcon, alertType } from "./alert-visual"
import { attrNullableString, el, isUiTarget, UI_ATTRIBUTE } from "./dom"
import "./alert-tools.css"

/**
 * The callout renders the published markup and is edited in place: the type label opens a
 * small list of types under it, and the title is typed straight into the title line. Nothing
 * is added inside the box, so it always looks like the published callout.
 */
export class AlertView implements NodeView {
  readonly dom: HTMLElement
  readonly contentDOM: HTMLElement
  private node: PMNode
  private icon: SVGElement
  private readonly typeLabel: HTMLElement
  private readonly heading: HTMLElement
  private readonly menu: HTMLElement
  private headingBefore = ""
  private readonly onSelection = (): void => this.sync()
  // Wait a frame on blur so focus has landed (the title or the type list may have taken it).
  private readonly onBlur = (): void => {
    requestAnimationFrame(() => this.sync())
  }
  private readonly onPosition = (): void => this.position()
  private readonly onOutside = (event: MouseEvent): void => {
    const target = event.target
    if (target instanceof Node && !this.menu.contains(target) && !this.typeLabel.contains(target))
      this.closeMenu()
  }

  constructor(
    node: PMNode,
    private readonly editor: Editor,
    private readonly getPos: () => number | undefined,
  ) {
    this.node = node
    this.icon = alertIcon(alertType(node.attrs))
    this.typeLabel = el("span", {
      className: "alert-type onsite-alert__type",
      role: "button",
      tabindex: "0",
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
      [UI_ATTRIBUTE]: true,
    })
    this.heading = el("span", {
      className: "alert-heading onsite-alert__heading",
      role: "textbox",
      "aria-label": "콜아웃 제목",
      "data-placeholder": "제목 (선택)",
      spellcheck: "false",
      [UI_ATTRIBUTE]: true,
    })
    this.menu = el("div", {
      className: "onsite-tools onsite-alert-types",
      role: "listbox",
      "aria-label": "콜아웃 종류",
      hidden: true,
      [UI_ATTRIBUTE]: true,
    })
    for (const type of ALERT_TYPES) {
      const option = el("button", {
        type: "button",
        role: "option",
        className: `onsite-alert-types__option alert-${type.toLowerCase()}`,
        "data-type": type,
        [UI_ATTRIBUTE]: true,
      })
      option.append(alertIcon(type), el("span", { textContent: ALERT_LABELS[type] }))
      option.addEventListener("mousedown", (event) => event.preventDefault())
      option.addEventListener("click", () => this.chooseType(type))
      this.menu.append(option)
    }
    this.contentDOM = el("div", { className: "alert-body" })
    const title = el("p", { className: "alert-title", contenteditable: "false" })
    title.append(this.icon, this.typeLabel, this.heading)
    // Clicking the icon or empty title space puts the caret at the start of the body.
    title.addEventListener("mousedown", (event) => {
      if (isUiTarget(event.target)) return
      const pos = getPos()
      if (pos === undefined) return
      event.preventDefault()
      editor
        .chain()
        .focus()
        .setTextSelection(pos + 2)
        .run()
    })
    this.typeLabel.addEventListener("mousedown", (event) => event.preventDefault())
    this.typeLabel.addEventListener("click", () => this.toggleMenu())
    this.typeLabel.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault()
        this.toggleMenu(true)
      }
    })
    this.menu.addEventListener("keydown", (event) => this.menuKey(event))
    // Focus the title ourselves: the editor's blur would otherwise hide an empty title first.
    this.heading.addEventListener("mousedown", (event) => {
      if (!this.editor.isEditable) return
      event.preventDefault()
      this.dom.classList.add("is-editing")
      this.heading.focus()
      const range = document.createRange()
      range.selectNodeContents(this.heading)
      range.collapse(false)
      const selection = document.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    })
    this.heading.addEventListener("focus", () => {
      this.headingBefore = this.heading.textContent ?? ""
      this.dom.classList.add("is-editing")
    })
    this.heading.addEventListener("keydown", (event) => {
      // Select-all stays inside the title; it must never select the whole post.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault()
        const all = document.createRange()
        all.selectNodeContents(this.heading)
        document.getSelection()?.removeAllRanges()
        document.getSelection()?.addRange(all)
        return
      }
      if (event.key === "Enter") {
        event.preventDefault()
        this.commitHeading()
        this.focusBody()
      } else if (event.key === "Escape") {
        event.preventDefault()
        this.heading.textContent = this.headingBefore
        this.focusBody()
      }
    })
    this.heading.addEventListener("blur", () => {
      this.commitHeading()
      this.sync()
    })
    // Plain text only, on one line.
    this.heading.addEventListener("paste", (event) => {
      event.preventDefault()
      const text = event.clipboardData?.getData("text/plain").replace(/\s+/g, " ") ?? ""
      document.execCommand("insertText", false, text)
    })
    this.dom = el("blockquote", { role: "note", "data-onsite-alert": true }, [
      title,
      this.contentDOM,
    ])
    document.body.append(this.menu)
    editor.on("selectionUpdate", this.onSelection)
    editor.on("focus", this.onSelection)
    editor.on("blur", this.onBlur)
    document.addEventListener("mousedown", this.onOutside, true)
    window.addEventListener("scroll", this.onPosition, { passive: true })
    window.addEventListener("resize", this.onPosition)
    this.render()
  }
  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
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
    this.editor.off("focus", this.onSelection)
    this.editor.off("blur", this.onBlur)
    document.removeEventListener("mousedown", this.onOutside, true)
    window.removeEventListener("scroll", this.onPosition)
    window.removeEventListener("resize", this.onPosition)
    this.menu.remove()
  }
  private commit(patch: Record<string, unknown>): void {
    const pos = this.getPos()
    if (pos !== undefined)
      this.editor.view.dispatch(
        this.editor.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...patch }),
      )
  }
  private commitHeading(): void {
    const text = (this.heading.textContent ?? "").replace(/\s+/g, " ").trim()
    const next = text === "" ? null : text
    if (next !== attrNullableString(this.node.attrs, "title")) this.commit({ title: next })
  }
  private focusBody(): void {
    const pos = this.getPos()
    this.heading.blur()
    if (pos !== undefined)
      this.editor
        .chain()
        .focus()
        .setTextSelection(pos + 2)
        .run()
  }
  private chooseType(type: string): void {
    this.closeMenu()
    this.commit({ type })
    this.editor.commands.focus()
  }
  private toggleMenu(focusFirst = false): void {
    if (!this.menu.hidden) {
      this.closeMenu()
      return
    }
    this.menu.hidden = false
    this.typeLabel.setAttribute("aria-expanded", "true")
    this.position()
    const current = this.menu.querySelector<HTMLButtonElement>(
      `[data-type="${alertType(this.node.attrs)}"]`,
    )
    if (focusFirst) current?.focus()
  }
  private closeMenu(): void {
    this.menu.hidden = true
    this.typeLabel.setAttribute("aria-expanded", "false")
  }
  private menuKey(event: KeyboardEvent): void {
    const options = [...this.menu.querySelectorAll<HTMLButtonElement>("button")]
    const index = options.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      options[(index + step + options.length) % options.length]?.focus()
    } else if (event.key === "Escape") {
      event.preventDefault()
      this.closeMenu()
      this.typeLabel.focus()
    }
  }
  private inside(): boolean {
    const pos = this.getPos()
    const from = this.editor.state.selection.from
    return pos !== undefined && from >= pos && from < pos + this.node.nodeSize
  }
  private sync(): void {
    const editing =
      this.editor.isEditable &&
      (document.activeElement === this.heading ||
        this.menu.contains(document.activeElement) ||
        (this.editor.isFocused && this.inside()))
    this.dom.classList.toggle("is-editing", editing)
    this.heading.contentEditable = this.editor.isEditable ? "true" : "false"
    this.typeLabel.setAttribute(
      "aria-label",
      `콜아웃 종류: ${ALERT_LABELS[alertType(this.node.attrs)]} (바꾸기)`,
    )
    if (!editing && !this.menu.contains(document.activeElement)) this.closeMenu()
  }
  private position(): void {
    if (this.menu.hidden) return
    const box = this.typeLabel.getBoundingClientRect()
    this.menu.style.top = `${Math.min(box.bottom + 6, innerHeight - this.menu.offsetHeight - 8)}px`
    this.menu.style.left = `${Math.max(8, Math.min(box.left - 8, innerWidth - this.menu.offsetWidth - 8))}px`
  }
  private render(): void {
    const type = alertType(this.node.attrs)
    const title = attrNullableString(this.node.attrs, "title")
    this.dom.className = `alert alert-${type.toLowerCase()} onsite-alert`
    this.dom.dataset["type"] = type
    if (this.icon.dataset["type"] !== type) {
      const icon = alertIcon(type)
      this.icon.replaceWith(icon)
      this.icon = icon
    }
    this.typeLabel.textContent = ALERT_LABELS[type]
    if (document.activeElement !== this.heading) this.heading.textContent = title ?? ""
    for (const option of this.menu.querySelectorAll<HTMLElement>("button"))
      option.setAttribute("aria-selected", String(option.dataset["type"] === type))
    this.sync()
    this.position()
  }
}
