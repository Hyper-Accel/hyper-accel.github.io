import { h } from "../composer/dom"

export interface ToolboxControl {
  readonly button: HTMLButtonElement
  readonly id: string
  readonly group: string
}
const GROUPS = [
  { label: "실행", ids: ["undo", "redo"] },
  { label: "첨부", ids: ["image", "youtube"] },
  { label: "본문", ids: ["bullet-list", "ordered-list", "quote"] },
  { label: "블록", ids: ["alert", "table", "code"] },
  { label: "추가", ids: ["steps", "tabs", "math", "divider", "footnote"] },
  { label: "안내", ids: ["help"] },
]
export function toolboxControls(buttons: readonly HTMLButtonElement[]): ToolboxControl[] {
  const controls = buttons.map((button) => {
    const id = button.dataset["tool"] ?? "panel"
    const group = GROUPS.find((item) => item.ids.includes(id))?.label ?? "패널"
    return { button, id, group }
  })
  return GROUPS.flatMap((group) => controls.filter((item) => item.group === group.label)).concat(
    controls.filter((item) => item.group === "패널"),
  )
}
export function toolboxGroups(controls: readonly ToolboxControl[]): HTMLElement[] {
  const groups = new Map<string, HTMLButtonElement[]>()
  for (const item of controls) {
    const buttons = groups.get(item.group) ?? []
    buttons.push(item.button)
    groups.set(item.group, buttons)
  }
  const result: HTMLElement[] = []
  for (const [label, buttons] of groups) {
    if (result.length)
      result.push(h("span", { class: "composer-toolbox__separator", role: "separator" }))
    result.push(
      h(
        "div",
        { class: "composer-toolbox__group", role: "group", "aria-label": label },
        ...buttons,
      ),
    )
  }
  return result
}
