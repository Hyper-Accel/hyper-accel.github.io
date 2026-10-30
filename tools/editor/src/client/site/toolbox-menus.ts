import type { JSONContent } from "@tiptap/core"
import { type SlashMenuItem, tableContent } from "../blocks/slash-menu"
import { h } from "../composer/dom"

export function alertMenu(
  items: Iterable<SlashMenuItem>,
  insert: (item: SlashMenuItem) => void,
): HTMLElement {
  return h(
    "div",
    { class: "composer-toolbox__menu", role: "menu", "aria-label": "콜아웃 종류" },
    ...[...items]
      .filter((item) => item.id.startsWith("alert-"))
      .map((item) => {
        const button = h(
          "button",
          { type: "button", role: "menuitem", "data-item": item.id },
          item.label.replace("콜아웃 · ", ""),
        )
        button.addEventListener("click", () => insert(item))
        return button
      }),
  )
}

export function tableMenu(insert: (content: JSONContent) => void): HTMLElement {
  const size = h("p", { class: "composer-toolbox__size", role: "status" }, "3 × 3")
  const cells: HTMLButtonElement[] = []
  const paint = (rows: number, columns: number): void => {
    size.textContent = `${rows} × ${columns}`
    for (const cell of cells)
      cell.toggleAttribute(
        "data-active",
        Number(cell.dataset["row"]) <= rows && Number(cell.dataset["column"]) <= columns,
      )
  }
  for (let row = 1; row <= 6; row++) {
    for (let column = 1; column <= 8; column++) {
      const cell = h("button", {
        type: "button",
        class: "composer-toolbox__cell",
        "data-row": String(row),
        "data-column": String(column),
        "aria-label": `${row} × ${column} 표`,
        ...(row === 3 && column === 3 ? { "data-autofocus": "" } : {}),
      })
      cell.addEventListener("mouseenter", () => paint(row, column))
      cell.addEventListener("focus", () => paint(row, column))
      cell.addEventListener("click", () => insert(tableContent(row, column)))
      cells.push(cell)
    }
  }
  const grid = h(
    "div",
    { class: "composer-toolbox__grid", role: "group", "aria-label": "표 크기" },
    ...cells,
  )
  paint(3, 3)
  return h("div", { class: "composer-toolbox__menu composer-toolbox__menu--grid" }, grid, size)
}
