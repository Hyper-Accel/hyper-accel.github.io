import type { Editor } from "@tiptap/core"
import { ALIGNMENTS, type Alignment } from "../blocks/text-formats"
import {
  applyTextStyle,
  currentStyle,
  FONT_SIZES,
  FONTS,
  type StyleKey,
  TEXT_COLORS,
} from "../blocks/text-style"
import { h } from "./dom"

/**
 * Naver-style 글꼴·크기·글자색·배경색·정렬 controls, shared by the toolbox's second row and the
 * drag toolbar. Each control acts on the editor `current()` returns.
 */
export interface StyleControls {
  readonly font: HTMLSelectElement
  readonly size: HTMLSelectElement
  readonly color: HTMLButtonElement
  readonly background: HTMLButtonElement
  readonly align: readonly HTMLButtonElement[]
  /** Shows the selection's current values. */
  sync(editor: Editor): void
  destroy(): void
}

const ALIGN_LABEL: Record<Alignment, string> = {
  left: "왼쪽 정렬",
  center: "가운데 정렬",
  right: "오른쪽 정렬",
  justify: "양끝 정렬",
}
const ALIGN_GLYPH: Record<Alignment, string> = { left: "⇤", center: "↔", right: "⇥", justify: "☰" }

export function createStyleControls(
  current: () => Editor | null,
  className: string,
): StyleControls {
  let popover: HTMLElement | null = null
  const closePopover = (): void => {
    popover?.remove()
    popover = null
    for (const button of [color, background]) button.setAttribute("aria-expanded", "false")
  }
  const font = h(
    "select",
    { class: `${className}__font`, "aria-label": "글꼴", title: "글꼴" },
    h("option", { value: "" }, "기본 글꼴"),
    ...FONTS.map((entry) =>
      h("option", { value: entry.family, style: `font-family: ${entry.family}` }, entry.label),
    ),
  )
  font.addEventListener("change", () => apply("fontFamily", font.value || null))
  const size = h(
    "select",
    { class: `${className}__size`, "aria-label": "글자 크기", title: "글자 크기" },
    h("option", { value: "" }, "기본"),
    ...FONT_SIZES.map((px) => h("option", { value: `${px}px` }, String(px))),
  )
  size.addEventListener("change", () => apply("fontSize", size.value || null))
  const colorButton = (key: "color" | "backgroundColor", label: string, glyph: string) => {
    const swatch = h("span", { class: `${className}__swatch`, "aria-hidden": "true" })
    const button = h(
      "button",
      {
        type: "button",
        class: `${className}__button ${className}__color`,
        "data-style": key,
        "aria-label": label,
        title: label,
        "aria-haspopup": "true",
        "aria-expanded": "false",
      },
      h("span", { "aria-hidden": "true" }, glyph),
      swatch,
    )
    button.addEventListener("mousedown", (event) => event.preventDefault())
    button.addEventListener("click", () => {
      const open = popover?.dataset["for"] === key
      closePopover()
      if (!open) openPalette(button, key, label)
    })
    return button
  }
  const color = colorButton("color", "글자색", "A")
  const background = colorButton("backgroundColor", "글자 배경색", "▨")
  const align = ALIGNMENTS.map((value) => {
    const button = h(
      "button",
      {
        type: "button",
        class: `${className}__button`,
        "data-align": value,
        "aria-label": ALIGN_LABEL[value],
        title: ALIGN_LABEL[value],
      },
      ALIGN_GLYPH[value],
    )
    button.addEventListener("mousedown", (event) => event.preventDefault())
    button.addEventListener("click", () => {
      const editor = current()
      if (!editor) return
      editor
        .chain()
        .focus()
        .updateAttributes("paragraph", { align: value === "left" ? null : value })
        .run()
      sync(editor)
    })
    return button
  })

  function apply(key: StyleKey, value: string | null): void {
    const editor = current()
    if (!editor) return
    applyTextStyle(editor, key, value)
    sync(editor)
  }

  function openPalette(anchor: HTMLButtonElement, key: "color" | "backgroundColor", label: string) {
    const pick = (value: string | null): void => {
      closePopover()
      apply(key, value)
    }
    const swatches = TEXT_COLORS.map((value) => {
      const swatch = h("button", {
        type: "button",
        class: "composer-palette__swatch",
        style: `background: ${value}`,
        "aria-label": value,
        title: value,
      })
      swatch.addEventListener("mousedown", (event) => event.preventDefault())
      swatch.addEventListener("click", () => pick(value))
      return swatch
    })
    const reset = h("button", { type: "button", class: "composer-palette__reset" }, "기본")
    reset.addEventListener("mousedown", (event) => event.preventDefault())
    reset.addEventListener("click", () => pick(null))
    const custom = h("input", {
      type: "color",
      class: "composer-palette__custom",
      "aria-label": `${label} 직접 고르기`,
      value: (() => {
        const editor = current()
        return (editor && currentStyle(editor, key)) || "#ffffff"
      })(),
    })
    custom.addEventListener("change", () => pick(custom.value))
    popover = h(
      "div",
      { class: "composer-palette", role: "dialog", "aria-label": label, "data-onsite-ui": "" },
      h("div", { class: "composer-palette__grid" }, ...swatches),
      h("div", { class: "composer-palette__row" }, reset, h("label", {}, "직접 ", custom)),
    )
    popover.dataset["for"] = key
    document.body.append(popover)
    const rect = anchor.getBoundingClientRect()
    const width = popover.offsetWidth
    popover.style.top = `${Math.round(rect.bottom + 6)}px`
    popover.style.left = `${Math.round(Math.max(8, Math.min(rect.left, innerWidth - width - 8)))}px`
    anchor.setAttribute("aria-expanded", "true")
  }

  const onOutside = (event: MouseEvent): void => {
    if (!popover || !(event.target instanceof Node)) return
    if (
      popover.contains(event.target) ||
      color.contains(event.target) ||
      background.contains(event.target)
    )
      return
    closePopover()
  }
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && popover) closePopover()
  }
  document.addEventListener("mousedown", onOutside, true)
  document.addEventListener("keydown", onKey)

  function sync(editor: Editor): void {
    font.value = currentStyle(editor, "fontFamily") ?? ""
    size.value = currentStyle(editor, "fontSize") ?? ""
    color.style.setProperty("--swatch", currentStyle(editor, "color") ?? "currentColor")
    background.style.setProperty(
      "--swatch",
      currentStyle(editor, "backgroundColor") ?? "transparent",
    )
    const value: unknown = editor.getAttributes("paragraph")["align"]
    const active = typeof value === "string" ? value : "left"
    for (const button of align)
      button.setAttribute("aria-pressed", String(button.dataset["align"] === active))
  }

  return {
    font,
    size,
    color,
    background,
    align,
    sync,
    destroy() {
      closePopover()
      document.removeEventListener("mousedown", onOutside, true)
      document.removeEventListener("keydown", onKey)
    },
  }
}
