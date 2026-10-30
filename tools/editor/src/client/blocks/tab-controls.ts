import { el, UI_ATTRIBUTE } from "./dom"

export interface TabActions {
  select(index: number): void
  rename(index: number, name: string): void
  move(from: number, to: number): void
  remove(index: number): void
  add(): void
}

/** Tab labels own their editing gestures; no detached property bar or layout slots. */
export class TabControls {
  private signature = ""
  private drag: {
    readonly index: number
    readonly pointer: number
    readonly x: number
    target: number
    moved: boolean
  } | null = null
  private renaming: HTMLElement | null = null
  private suppressClick = false
  constructor(
    private readonly list: HTMLElement,
    private readonly actions: TabActions,
  ) {}

  render(names: readonly string[], active: number, editing: boolean): void {
    const signature = JSON.stringify([names, active, editing])
    if (signature === this.signature) return
    this.signature = signature
    this.renaming = null
    const buttons = names.map((name, index) => {
      const button = el("button", {
        type: "button",
        className: "tabs-tab",
        role: "tab",
        "aria-selected": String(index === active),
        "aria-label": name,
        tabindex: index === active ? "0" : "-1",
        "data-tab-index": String(index),
        [UI_ATTRIBUTE]: true,
        textContent: name,
      })
      button.addEventListener("click", (event) => {
        if (event.detail === 0) this.suppressClick = false
        if (this.suppressClick) {
          this.suppressClick = false
          return
        }
        if (editing && active === index) this.edit(button, index, name)
        else this.actions.select(index)
      })
      button.addEventListener("keydown", (event) => {
        this.suppressClick = false
        if (event.target !== button) return
        if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
          event.preventDefault()
          event.stopPropagation()
          const next = index + (event.key === "ArrowLeft" ? -1 : 1)
          if (next >= 0 && next < names.length) {
            this.actions.move(index, next)
            this.focus(next)
          }
        } else if (!event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
          event.preventDefault()
          const next = (index + (event.key === "ArrowLeft" ? -1 : 1) + names.length) % names.length
          this.actions.select(next)
          this.focus(next)
        }
      })
      button.addEventListener("pointerdown", (event) => {
        this.suppressClick = false
        if (event.button !== 0 || this.renaming) return
        this.drag = {
          index,
          pointer: event.pointerId,
          x: event.clientX,
          target: index,
          moved: false,
        }
        button.setPointerCapture(event.pointerId)
      })
      button.addEventListener("pointermove", (event) => {
        const drag = this.drag
        if (!drag || drag.pointer !== event.pointerId || Math.abs(event.clientX - drag.x) < 6)
          return
        drag.moved = true
        event.preventDefault()
        const target = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>("[data-tab-index]")
        if (target && this.list.contains(target)) drag.target = Number(target.dataset["tabIndex"])
        button.toggleAttribute("data-dragging", true)
      })
      const finish = (event: PointerEvent): void => {
        const drag = this.drag
        this.drag = null
        button.removeAttribute("data-dragging")
        if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId)
        if (!drag?.moved || event.type === "pointercancel") return
        this.suppressClick = true
        if (drag.target !== drag.index) this.actions.move(drag.index, drag.target)
      }
      button.addEventListener("pointerup", finish)
      button.addEventListener("pointercancel", finish)
      if (!editing || index !== active) return button
      const remove = el("button", {
        type: "button",
        className: "onsite-tab-remove",
        "aria-label": `${name} 탭 삭제`,
        title: "탭 삭제 (실행 취소 가능)",
        [UI_ATTRIBUTE]: true,
        textContent: "×",
      })
      remove.addEventListener("mousedown", (event) => event.preventDefault())
      remove.addEventListener("click", () => this.actions.remove(index))
      return el("span", { className: "onsite-tab-slot", [UI_ATTRIBUTE]: true }, [button, remove])
    })
    const add = el("button", {
      type: "button",
      className: "tabs-tab onsite-tabs__add",
      [UI_ATTRIBUTE]: true,
      textContent: "+ 탭",
      hidden: !editing,
    })
    add.addEventListener("mousedown", (event) => event.preventDefault())
    add.addEventListener("click", () => this.actions.add())
    this.list.replaceChildren(...buttons, add)
  }

  focus(index: number): void {
    const tab = this.list.querySelector<HTMLButtonElement>(`[data-tab-index="${index}"]`)
    tab?.focus({ preventScroll: true })
    tab?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }

  private edit(button: HTMLButtonElement, index: number, original: string): void {
    if (this.renaming) return
    const label = el("span", {
      className: "onsite-tab-label",
      contenteditable: "plaintext-only",
      role: "textbox",
      "aria-label": "탭 이름",
      [UI_ATTRIBUTE]: true,
      textContent: original,
    })
    button.style.width = `${button.getBoundingClientRect().width}px`
    button.replaceChildren(label)
    this.renaming = label
    const finish = (commit: boolean): void => {
      if (this.renaming !== label) return
      this.renaming = null
      const name = commit ? label.textContent?.trim() || original : original
      button.textContent = name
      button.setAttribute("aria-label", name)
      button.style.width = ""
      if (commit && name !== original) this.actions.rename(index, name)
    }
    label.addEventListener("input", () =>
      button.setAttribute("aria-label", label.textContent ?? ""),
    )
    label.addEventListener("click", (event) => event.stopPropagation())
    label.addEventListener("keydown", (event) => {
      event.stopPropagation()
      // Select-all stays inside the name; it must never select (and let typing replace) the post.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault()
        const all = document.createRange()
        all.selectNodeContents(label)
        document.getSelection()?.removeAllRanges()
        document.getSelection()?.addRange(all)
        return
      }
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault()
        finish(event.key === "Enter")
        this.focus(index)
      }
    })
    label.addEventListener("blur", () => finish(true))
    label.focus()
    const range = document.createRange()
    range.selectNodeContents(label)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
}
