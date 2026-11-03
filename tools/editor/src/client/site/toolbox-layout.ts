import { type ToolboxControl, toolboxControls, toolboxGroups } from "./toolbox-items"
import { ToolboxMore } from "./toolbox-more"
import "./toolbox-layout.css"

/**
 * The toolbox is one horizontal bar above the article. Tools that do not fit the bar's width
 * move, from the end, into a "더보기" menu, so no tool is ever cut off at either edge.
 */
export class ToolboxLayout {
  private readonly controls: readonly ToolboxControl[]
  private readonly more: ToolboxMore
  private readonly observer = new ResizeObserver(() => this.update())
  private signature = ""
  constructor(
    private readonly root: HTMLElement,
    private readonly tools: HTMLElement,
  ) {
    this.controls = toolboxControls([...tools.querySelectorAll<HTMLButtonElement>("button")])
    this.more = new ToolboxMore()
    root.dataset["mode"] = "bar"
    root.setAttribute("aria-orientation", "horizontal")
    this.observer.observe(root)
    this.update()
  }
  destroy(): void {
    this.observer.disconnect()
    this.more.destroy()
  }
  private update(): void {
    const width = Math.round(this.tools.clientWidth)
    const key = `${width}:${this.root.classList.contains("is-collapsed")}`
    if (key === this.signature || width === 0) return
    this.signature = key
    for (const item of this.controls) item.button.removeAttribute("role")
    this.more.setItems([])
    this.tools.replaceChildren(...toolboxGroups(this.controls))
    if (this.tools.scrollWidth <= this.tools.clientWidth) return
    const moreItem: ToolboxControl = { id: "more", group: "더보기", button: this.more.button }
    let primary = [...this.controls]
    while (primary.length > 1) {
      primary = primary.slice(0, -1)
      this.tools.replaceChildren(...toolboxGroups([...primary, moreItem]))
      if (this.tools.scrollWidth <= this.tools.clientWidth) break
    }
    const shown = new Set(primary)
    this.more.setItems(this.controls.filter((item) => !shown.has(item)))
  }
}
