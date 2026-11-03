import type { Editor } from "@tiptap/core"
import { h } from "./dom"

interface TableTool {
  readonly label: string
  readonly glyph: string
  readonly run: (editor: Editor) => void
  readonly danger?: boolean
}

const TOOLS: readonly TableTool[] = [
  { label: "위에 행 추가", glyph: "↑ 행", run: (e) => e.chain().focus().addRowBefore().run() },
  { label: "아래에 행 추가", glyph: "↓ 행", run: (e) => e.chain().focus().addRowAfter().run() },
  { label: "왼쪽에 열 추가", glyph: "← 열", run: (e) => e.chain().focus().addColumnBefore().run() },
  {
    label: "오른쪽에 열 추가",
    glyph: "→ 열",
    run: (e) => e.chain().focus().addColumnAfter().run(),
  },
  { label: "행 삭제", glyph: "행 삭제", run: (e) => e.chain().focus().deleteRow().run() },
  { label: "열 삭제", glyph: "열 삭제", run: (e) => e.chain().focus().deleteColumn().run() },
  {
    label: "머리글 행 켜기/끄기",
    glyph: "머리글",
    run: (e) => e.chain().focus().toggleHeaderRow().run(),
  },
  {
    label: "표 삭제",
    glyph: "표 삭제",
    run: (e) => e.chain().focus().deleteTable().run(),
    danger: true,
  },
]

export interface TableToolbar {
  readonly element: HTMLElement
  refresh(): void
  destroy(): void
}

/**
 * Row and column tools for the table holding the caret, floating just above it (as in Naver's and
 * Notion's editors), so a table grows and shrinks where it is written.
 */
export function createTableToolbar(current: () => Editor | undefined): TableToolbar {
  const element = h("div", {
    class: "composer-table-tools",
    role: "toolbar",
    "aria-label": "표 도구",
    "data-onsite-ui": "",
    hidden: true,
  })
  for (const tool of TOOLS) {
    const button = h(
      "button",
      {
        type: "button",
        class: tool.danger ? "is-danger" : "",
        "aria-label": tool.label,
        title: tool.label,
      },
      tool.glyph,
    )
    button.addEventListener("mousedown", (event) => event.preventDefault())
    button.addEventListener("click", () => {
      const editor = current()
      if (!editor) return
      tool.run(editor)
      refresh()
    })
    element.append(button)
  }

  function tableElement(editor: Editor): HTMLElement | null {
    const { $from } = editor.state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type.name !== "table") continue
      const dom = editor.view.nodeDOM($from.before(depth))
      return dom instanceof HTMLElement ? dom : null
    }
    return null
  }

  function refresh(): void {
    const editor = current()
    const focused = editor && (editor.view.hasFocus() || element.contains(document.activeElement))
    const table = editor && focused && editor.isEditable ? tableElement(editor) : null
    if (!table) {
      element.hidden = true
      return
    }
    element.hidden = false
    const rect = table.getBoundingClientRect()
    const height = element.offsetHeight
    const width = element.offsetWidth
    // Above the table; below it when the top is under the sticky header and toolbox.
    const above = rect.top - height - 8
    const top = above >= 140 ? above : rect.bottom + 8
    element.style.top = `${Math.round(top)}px`
    element.style.left = `${Math.round(Math.max(8, Math.min(rect.left, innerWidth - width - 8)))}px`
  }

  window.addEventListener("scroll", refresh, { passive: true })
  window.addEventListener("resize", refresh)
  return {
    element,
    refresh,
    destroy() {
      window.removeEventListener("scroll", refresh)
      window.removeEventListener("resize", refresh)
      element.remove()
    },
  }
}
