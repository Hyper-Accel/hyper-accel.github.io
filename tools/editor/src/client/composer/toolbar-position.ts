import type { Editor } from "@tiptap/core"

export function placeToolbar(editor: Editor, element: HTMLElement, menu: HTMLElement): void {
  if (element.hidden) return
  const { from, to } = editor.state.selection
  const start = editor.view.coordsAtPos(from)
  const end = editor.view.coordsAtPos(to, -1)
  // The selection toolbar stays below everything pinned to the top: the site header and the
  // 도구상자 (its thin row), never over them.
  const header =
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--composer-sticky-top"),
    ) || 0
  const toolbox = document.querySelector<HTMLElement>(".composer-toolbox:not([hidden])")
  const sticky = Math.max(header, toolbox ? toolbox.getBoundingClientRect().bottom : 0)
  // Scrolled under the pinned bars or off the screen: the selection is out of sight, and so is its
  // toolbar until the selection comes back.
  const outOfSight = end.bottom < sticky + 4 || start.top > innerHeight
  element.style.visibility = outOfSight ? "hidden" : ""
  const height = element.offsetHeight
  const above = start.top - height - 8
  const top =
    !matchMedia("(pointer: coarse)").matches && above >= sticky + 8 ? above : end.bottom + 8
  element.style.top = `${Math.max(sticky + 8, Math.min(top, innerHeight - height - 8))}px`
  element.style.left = `${Math.max(8, Math.min(start.left, innerWidth - element.offsetWidth - 8))}px`
  if (!menu.hidden) {
    const box = element.getBoundingClientRect()
    const below = innerHeight - box.bottom - 12
    const aboveSpace = box.top - sticky - 12
    const upwards = below < menu.scrollHeight && aboveSpace > below
    menu.style.maxHeight = `${Math.max(44, upwards ? aboveSpace : below)}px`
    menu.style.top = upwards ? "auto" : "calc(100% + 4px)"
    menu.style.bottom = upwards ? "calc(100% + 4px)" : "auto"
  }
}
