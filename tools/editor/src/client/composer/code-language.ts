import type { Editor } from "@tiptap/core"
import { CODE_LANGUAGES } from "../blocks/code-highlight"
import { h } from "./dom"

export interface CodeLanguagePicker {
  readonly element: HTMLElement
  refresh(): void
  destroy(): void
}

/** The language of the code block holding the caret, picked at its top-right corner. */
export function createCodeLanguagePicker(current: () => Editor | undefined): CodeLanguagePicker {
  const select = h(
    "select",
    { "aria-label": "코드 언어", title: "코드 언어" },
    ...CODE_LANGUAGES.map((entry) => h("option", { value: entry.id }, entry.label)),
  )
  const element = h(
    "div",
    { class: "composer-code-language", "data-onsite-ui": "", hidden: true },
    select,
  )
  select.addEventListener("change", () => {
    current()
      ?.chain()
      .focus()
      .updateAttributes("codeBlock", { language: select.value || null })
      .run()
  })

  function refresh(): void {
    const editor = current()
    const focused = editor && (editor.view.hasFocus() || element.contains(document.activeElement))
    if (!editor || !focused || !editor.isEditable || !editor.isActive("codeBlock")) {
      element.hidden = true
      return
    }
    const { $from } = editor.state.selection
    const dom = editor.view.nodeDOM($from.before($from.depth))
    if (!(dom instanceof HTMLElement)) {
      element.hidden = true
      return
    }
    const language: unknown = editor.getAttributes("codeBlock")["language"]
    select.value = typeof language === "string" ? language : ""
    element.hidden = false
    const rect = dom.getBoundingClientRect()
    element.style.top = `${Math.round(rect.top + 6)}px`
    element.style.left = `${Math.round(rect.right - element.offsetWidth - 6)}px`
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
