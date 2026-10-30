import { h } from "../composer/dom"
import { type ToolboxControl, toolboxGroups } from "./toolbox-items"

export class ToolboxMore {
  readonly button = h(
    "button",
    {
      type: "button",
      class: "composer-toolbox__button",
      "aria-label": "더보기 도구",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "aria-controls": "composer-toolbox-more",
      "data-tooltip": "더보기",
    },
    h("span", { class: "composer-toolbox__icon", "aria-hidden": "true" }, "⋯"),
    h("span", { class: "composer-toolbox__label" }, "더보기 ▾"),
  )
  private readonly menu = h("div", {
    id: "composer-toolbox-more",
    class: "composer-toolbox__more",
    role: "menu",
    "aria-label": "더보기 도구",
    hidden: true,
  })
  constructor() {
    this.button.addEventListener("mousedown", (event) => event.preventDefault())
    this.button.addEventListener("click", (event) => {
      if (!this.menu.hidden) {
        this.close()
        return
      }
      // The menu lives outside the toolbox: the toolbox's backdrop-filter would make it the
      // containing block of this fixed menu and push the menu down by the toolbox's offset.
      const host = this.button.closest(".site-editor") ?? document.body
      if (this.menu.parentElement !== host) host.append(this.menu)
      this.menu.hidden = false
      this.button.setAttribute("aria-expanded", "true")
      this.position()
      // Only a keyboard opening moves focus into the menu; a mouse opening leaves the caret in
      // the post so a picked tool acts there and typing continues there.
      if (event.detail === 0)
        this.menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus()
    })
    this.menu.addEventListener("mousedown", (event) => {
      if (event.target instanceof Element && event.target.closest("button")) event.preventDefault()
    })
    // Picking a tool runs it (its own click handler) and closes the menu.
    this.menu.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("button")) this.close()
    })
    this.menu.addEventListener("keydown", (event) => {
      const buttons = [...this.menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault()
          buttons[(current + 1) % buttons.length]?.focus()
          break
        case "ArrowUp":
          event.preventDefault()
          buttons[(current - 1 + buttons.length) % buttons.length]?.focus()
          break
        case "Home":
          event.preventDefault()
          buttons[0]?.focus()
          break
        case "End":
          event.preventDefault()
          buttons.at(-1)?.focus()
          break
        case "Escape":
          event.preventDefault()
          this.close()
          this.button.focus()
          break
      }
    })
    document.addEventListener("mousedown", this.onOutside, true)
    window.addEventListener("resize", this.onPosition)
    window.addEventListener("scroll", this.onPosition, { passive: true })
  }
  setItems(items: readonly ToolboxControl[]): void {
    this.close()
    for (const item of items) item.button.setAttribute("role", "menuitem")
    this.menu.replaceChildren(...toolboxGroups(items))
  }
  close(): void {
    this.menu.hidden = true
    this.button.setAttribute("aria-expanded", "false")
  }
  destroy(): void {
    this.close()
    document.removeEventListener("mousedown", this.onOutside, true)
    window.removeEventListener("resize", this.onPosition)
    window.removeEventListener("scroll", this.onPosition)
    this.menu.remove()
  }
  private readonly onOutside = (event: MouseEvent): void => {
    if (
      event.target instanceof Node &&
      !this.menu.contains(event.target) &&
      !this.button.contains(event.target)
    )
      this.close()
  }
  private readonly onPosition = (): void => this.position()
  private position(): void {
    if (this.menu.hidden) return
    const box = this.button.getBoundingClientRect()
    const header = document.querySelector(".tr-header")?.getBoundingClientRect().bottom ?? 0
    const top = Math.max(header + 8, box.bottom + 6)
    // The menu opens under its button and scrolls inside the space left below it.
    // Stop above the bottom save bar and inside the visible viewport (phones).
    // The dock is pinned to the bottom and may still be sliding in, so use its height, not its rect.
    const dockElement = document.querySelector<HTMLElement>(".composer-dock")
    const dock =
      dockElement && !dockElement.hidden ? innerHeight - dockElement.offsetHeight : innerHeight
    const bottom = Math.min(innerHeight, window.visualViewport?.height ?? innerHeight, dock)
    this.menu.style.maxHeight = `${Math.max(120, bottom - top - 12)}px`
    this.menu.style.left = `${Math.max(8, Math.min(box.right - this.menu.offsetWidth, innerWidth - this.menu.offsetWidth - 8))}px`
    this.menu.style.top = `${top}px`
  }
}
