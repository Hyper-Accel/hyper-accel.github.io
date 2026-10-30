import type { Editor, JSONContent } from "@tiptap/core"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { el } from "./dom"
import { requestSlashItem, type SlashMenuItem, tableContent } from "./slash-items"
import { slashOption } from "./slash-option"
import { type SlashState, slashMenuKey } from "./slash-state"

const GRID_ROWS = 8
const GRID_COLUMNS = 10

function matches(item: SlashMenuItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === "") {
    return true
  }
  return (
    item.label.toLowerCase().includes(needle) ||
    (item.description ?? "").toLowerCase().includes(needle) ||
    item.keywords.some((keyword) => keyword.toLowerCase().includes(needle))
  )
}

export class SlashMenu {
  private readonly menu: HTMLElement
  private readonly list: HTMLElement
  private items: SlashMenuItem[] = []
  private index = 0
  private query = ""
  private grid: { readonly item: SlashMenuItem; rows: number; columns: number } | null = null

  constructor(
    private readonly editor: Editor,
    private readonly view: EditorView,
    allItems: readonly SlashMenuItem[],
  ) {
    // Only offer what this editor's schema can hold (e.g. tables need the table extension).
    this.allItems = allItems.filter((item) => {
      const type = item.content().type
      return type !== undefined && editor.schema.nodes[type] !== undefined
    })
    this.list = el("div", { role: "listbox", "aria-label": "블록 삽입" })
    this.menu = el("div", { className: "onsite-slash", hidden: true, "data-onsite-ui": true }, [
      this.list,
    ])
    this.menu.addEventListener("mousedown", (event) => event.preventDefault())
    document.body.append(this.menu)
  }

  private readonly allItems: readonly SlashMenuItem[]

  get open(): boolean {
    return !this.menu.hidden
  }

  update(state: SlashState | null): void {
    if (!state) {
      this.hide()
      return
    }
    const { selection, doc } = this.view.state
    const head = selection.head
    if (
      !selection.empty ||
      head <= state.from ||
      doc.textBetween(state.from, state.from + 1) !== "/"
    ) {
      this.close()
      return
    }
    const query = doc.textBetween(state.from + 1, head)
    if (/\s/.test(query)) {
      this.close()
      return
    }
    if (this.grid) {
      this.position(state.from)
      return
    }
    if (query !== this.query || this.menu.hidden) {
      this.query = query
      this.items = this.allItems.filter((item) => matches(item, query))
      this.index = 0
      if (this.items.length === 0) {
        this.close()
        return
      }
      this.renderItems()
    }
    this.position(state.from)
    this.menu.hidden = false
  }

  handleKey(event: KeyboardEvent): boolean {
    if (!this.open) {
      return false
    }
    if (this.grid) {
      const grid = this.grid
      const step: Record<string, readonly [number, number]> = {
        ArrowDown: [1, 0],
        ArrowUp: [-1, 0],
        ArrowRight: [0, 1],
        ArrowLeft: [0, -1],
      }
      const delta = step[event.key]
      if (delta) {
        grid.rows = Math.max(1, Math.min(GRID_ROWS, grid.rows + delta[0]))
        grid.columns = Math.max(1, Math.min(GRID_COLUMNS, grid.columns + delta[1]))
        this.renderGrid()
        return true
      }
      if (event.key === "Enter" || event.key === "Tab") {
        this.choose(grid.item, tableContent(grid.rows, grid.columns))
        return true
      }
      if (event.key === "Escape") {
        this.close()
        return true
      }
      return false
    }
    switch (event.key) {
      case "ArrowDown":
        this.index = (this.index + 1) % this.items.length
        this.renderItems()
        return true
      case "ArrowUp":
        this.index = (this.index - 1 + this.items.length) % this.items.length
        this.renderItems()
        return true
      case "Enter":
      case "Tab":
        this.choose(this.items[this.index])
        return true
      case "Escape":
        this.close()
        return true
      default:
        return false
    }
  }

  destroy(): void {
    this.menu.remove()
  }

  private hide(): void {
    this.menu.hidden = true
    this.query = ""
    this.grid = null
    this.menu.classList.remove("onsite-slash--grid")
  }

  private close(): void {
    this.hide()
    if (slashMenuKey.getState(this.view.state)) {
      this.view.dispatch(this.view.state.tr.setMeta(slashMenuKey, null))
    }
  }

  private position(from: number): void {
    const coords = this.view.coordsAtPos(from)
    const width = this.grid
      ? Math.min(256, window.innerWidth - 16)
      : Math.min(340, window.innerWidth - 16)
    const left = Math.max(8, Math.min(coords.left, window.innerWidth - width - 8))
    this.menu.style.width = `${width}px`
    this.menu.style.left = `${left}px`
    const below = coords.bottom + 4
    const estimatedHeight = Math.min(this.items.length, 8) * 44 + 8
    if (below + estimatedHeight > window.innerHeight && coords.top - estimatedHeight > 0) {
      this.menu.style.top = `${coords.top - estimatedHeight - 4}px`
    } else {
      this.menu.style.top = `${below}px`
    }
  }

  private renderItems(): void {
    this.list.replaceChildren(
      ...this.items.map((item, index) =>
        slashOption(item, index === this.index, () => this.choose(item)),
      ),
    )
    this.list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" })
  }

  /** Table size picker, like Confluence's insert-table grid. */
  private renderGrid(): void {
    const grid = this.grid
    if (!grid) return
    const cells: HTMLElement[] = []
    for (let row = 1; row <= GRID_ROWS; row += 1) {
      for (let column = 1; column <= GRID_COLUMNS; column += 1) {
        const cell = el("button", {
          type: "button",
          className: "onsite-slash__cell",
          "aria-label": `${row} × ${column} 표`,
          "data-active": row <= grid.rows && column <= grid.columns ? "true" : null,
        })
        cell.addEventListener("mouseenter", () => {
          grid.rows = row
          grid.columns = column
          this.renderGrid()
        })
        cell.addEventListener("click", () => this.choose(grid.item, tableContent(row, column)))
        cells.push(cell)
      }
    }
    this.list.replaceChildren(
      el("div", { className: "onsite-slash__grid", role: "group", "aria-label": "표 크기" }, cells),
      el("p", {
        className: "onsite-slash__size",
        role: "status",
        textContent: `${grid.rows} × ${grid.columns}`,
      }),
    )
  }

  private choose(item: SlashMenuItem | undefined, override?: JSONContent): void {
    const state = slashMenuKey.getState(this.view.state)
    if (!item || !state) {
      this.close()
      return
    }
    if (item.sizeGrid && !override) {
      this.grid = { item, rows: 3, columns: 3 }
      this.menu.classList.add("onsite-slash--grid")
      this.renderGrid()
      return
    }
    const from = state.from
    const to = this.view.state.selection.head
    this.hide()
    if (requestSlashItem(this.editor, item, { from, to })) return
    const content = override ?? item.content()
    this.editor
      .chain()
      .focus()
      .command(({ tr, state: current }) => {
        tr.setMeta(slashMenuKey, null)
        const node = current.schema.nodeFromJSON(content)
        const $from = tr.doc.resolve(from)
        const query = tr.doc.textBetween(from, to)
        let insertAt = from
        if ($from.parent.isTextblock && $from.parent.textContent === query) {
          insertAt = $from.before()
          tr.replaceWith(insertAt, $from.after(), node)
        } else {
          tr.delete(from, to)
          tr.insert(insertAt, node)
        }
        if (item.caret === null) {
          const inserted = tr.doc.nodeAt(insertAt)
          if (inserted && NodeSelection.isSelectable(inserted)) {
            tr.setSelection(NodeSelection.create(tr.doc, insertAt))
          }
        } else {
          tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + item.caret)))
        }
        return true
      })
      .run()
  }
}
