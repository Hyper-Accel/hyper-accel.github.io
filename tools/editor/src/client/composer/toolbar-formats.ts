import type { Editor } from "@tiptap/core"
import { MATH_INLINE_NODE } from "../blocks/math"
import { INLINE_FORMATS } from "../blocks/text-formats"
import { h } from "./dom"

export interface FormatControl {
  readonly label: string
  readonly glyph?: string | Node
  readonly id?: string
  readonly mark?: string
  readonly action: (editor: Editor) => void
}

type Sample = Node | string

/** A menu entry shows what it does: its name, then a short sample with the effect applied. */
function preview(label: string, ...sample: readonly Sample[]): HTMLElement {
  return h(
    "span",
    { class: "composer-format-preview" },
    h("span", {}, label),
    h("span", { class: "composer-format-sample", "aria-hidden": "true" }, ...sample),
  )
}

const SAMPLES: Readonly<Record<string, () => readonly Sample[]>> = {
  code: () => [h("code", {}, "code")],
  superscript: () => ["x", h("sup", {}, "2")],
  subscript: () => ["H", h("sub", {}, "2"), "O"],
  keyboard: () => [h("kbd", {}, "Ctrl")],
  small: () => [h("small", {}, "작은 글씨")],
}

export function fillFormatMenu(
  menu: HTMLElement,
  control: (item: FormatControl) => HTMLButtonElement,
): void {
  // 밑줄·취소선 sit in the toolbar row itself, beside 굵게·기울임 (as in Naver's drag toolbar).
  const formats = [
    { label: "인라인 코드", name: "code" },
    ...INLINE_FORMATS.filter((f) => f.name !== "highlight"),
  ]
  for (const format of formats)
    menu.append(
      control({
        label: format.label,
        glyph: preview(format.label, ...(SAMPLES[format.name]?.() ?? [])),
        mark: format.name,
        action: (e) => e.chain().focus().toggleMark(format.name).run(),
      }),
    )
  menu.append(
    h("span", { class: "composer-bubble__caption" }, "바꾸기"),
    control({
      label: "글머리 목록",
      glyph: preview("글머리 목록", "• 항목"),
      id: "bullet-list",
      action: (e) => {
        e.chain().focus().toggleBulletList().run()
        menu.hidden = true
      },
    }),
    control({
      label: "번호 목록",
      glyph: preview("번호 목록", "1. 항목"),
      id: "ordered-list",
      action: (e) => {
        e.chain().focus().toggleOrderedList().run()
        menu.hidden = true
      },
    }),
    control({
      label: "인용",
      glyph: preview("인용", h("span", { class: "is-quote" }, "인용문")),
      id: "quote",
      action: (e) => {
        e.chain().focus().toggleBlockquote().run()
        menu.hidden = true
      },
    }),
    control({
      label: "콜아웃",
      glyph: preview("콜아웃", h("span", { class: "is-callout" }, "ⓘ 참고")),
      action: (e) => {
        e.chain().focus().wrapIn("alert", { type: "NOTE" }).run()
        menu.hidden = true
      },
    }),
    control({
      label: "수식",
      glyph: preview("수식", h("i", { class: "is-math" }, "E = mc²")),
      id: "to-math",
      action: (e) => {
        // The selected text becomes an inline formula (its text as LaTeX), opened for editing.
        const { from, to, $from, $to, empty } = e.state.selection
        if (empty || !$from.sameParent($to)) return
        const source = e.state.doc.textBetween(from, to).trim()
        // No focus() here: its deferred refocus would pull the caret out of the formula editor.
        e.chain()
          .insertContentAt({ from, to }, { type: MATH_INLINE_NODE, attrs: { source } })
          .setNodeSelection(from)
          .run()
        menu.hidden = true
      },
    }),
    control({
      label: "서식 지우기",
      id: "clear",
      action: (e) => {
        e.chain()
          .focus()
          .unsetAllMarks()
          .clearNodes()
          .updateAttributes("paragraph", { lead: false })
          .run()
        menu.hidden = true
      },
    }),
  )
}
