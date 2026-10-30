import type { Editor } from "@tiptap/core"
import { h } from "../composer/dom"
import { clearFormatIcon, highlightGlyph, linkIcon, underlineGlyph } from "../composer/icons"
import { shortcutHint } from "../composer/shortcuts"
import { createStyleControls, type StyleControls } from "../composer/style-controls"
import type { EditorRegistry } from "./editor-registry"

/**
 * Symbols writers reach for most (Naver's 특수문자 panel, trimmed to what a tech post uses), grouped
 * as in the panel: Greek letters for formulas in running text come first.
 */
const SYMBOL_GROUPS: readonly { readonly label: string; readonly symbols: readonly string[] }[] = [
  {
    label: "그리스 문자",
    symbols: [..."αβγδεζηθικλμνξπρστυφχψω", ..."ΓΔΘΛΞΠΣΦΨΩ"],
  },
  {
    label: "수학",
    symbols: [..."±×÷·≈≠≡≤≥≪≫∝∞√∑∏∫∂∇", ..."∈∉⊂⊆∪∩∀∃¬∧∨⊕⊗ℝℕℤℏ°′″‰"],
  },
  { label: "화살표", symbols: [..."→←↑↓↔⇒⇐⇔↦"] },
  { label: "기호", symbols: [..."※•…—©®™§「」『』“”‘’①②③④"] },
]

type BlockType = "paragraph" | "lead" | "1" | "2" | "3" | "quote"

interface Toggle {
  readonly id: string
  readonly label: string
  readonly glyph: string | Node
  readonly active?: (editor: Editor) => boolean
  readonly run: (editor: Editor) => void
}

/**
 * The second row of the 도구상자, like Naver SmartEditor's 속성 도구 막대: paragraph type and the
 * text formats of the current selection, always in reach (the drag toolbar shows them too).
 */
export class PropertyBar {
  readonly element: HTMLElement
  private readonly blockType: HTMLSelectElement
  private readonly toggles: { readonly button: HTMLButtonElement; readonly item: Toggle }[] = []
  private readonly styles: StyleControls

  constructor(
    private readonly registry: EditorRegistry,
    private readonly openMenu: (button: HTMLButtonElement, menu: HTMLElement) => void,
    private readonly closeMenu: () => void,
  ) {
    this.blockType = h(
      "select",
      { class: "composer-props__type", "aria-label": "글 유형", title: "글 유형" },
      h("option", { value: "paragraph" }, "본문"),
      h("option", { value: "lead" }, "리드 문단"),
      h("option", { value: "1" }, "제목 1"),
      h("option", { value: "2" }, "제목 2"),
      h("option", { value: "3" }, "제목 3"),
      h("option", { value: "quote" }, "인용"),
    )
    this.blockType.addEventListener("change", () => {
      const editor = this.registry.active()
      if (editor) setBlockType(editor, this.blockType.value as BlockType)
    })
    this.styles = createStyleControls(() => this.registry.active(), "composer-props")
    const group = (...items: Toggle[]): HTMLElement =>
      h("div", { class: "composer-props__group" }, ...items.map((item) => this.toggle(item)))
    const symbols = h(
      "button",
      {
        type: "button",
        class: "composer-props__button",
        "aria-label": "특수문자",
        title: "특수문자",
        "aria-haspopup": "true",
        "aria-expanded": "false",
      },
      "Ω",
    )
    symbols.addEventListener("click", () => this.openMenu(symbols, this.symbolMenu()))
    this.element = h(
      "div",
      { class: "composer-props", role: "group", "aria-label": "글 서식" },
      this.blockType,
      h("div", { class: "composer-props__group" }, this.styles.font, this.styles.size),
      group(
        mark("bold", "굵게", "B"),
        mark("italic", "기울임", "I"),
        mark("underline", "밑줄", underlineGlyph()),
        mark("strike", "취소선", "S"),
      ),
      h(
        "div",
        { class: "composer-props__group" },
        this.styles.color,
        this.styles.background,
        this.toggle(mark("highlight", "형광펜", highlightGlyph())),
      ),
      h("div", { class: "composer-props__group" }, ...this.styles.align),
      group(
        mark("superscript", "위첨자", "x²"),
        mark("subscript", "아래첨자", "x₂"),
        mark("code", "인라인 코드", "</>"),
      ),
      h("div", { class: "composer-props__group" }, symbols),
      group(
        {
          id: "link",
          label: "링크",
          glyph: linkIcon(),
          active: (editor) => editor.isActive("link"),
          run: (editor) =>
            editor.view.dom.dispatchEvent(
              new CustomEvent("onsite-editor-tool", { bubbles: true, detail: "link" }),
            ),
        },
        {
          id: "clear",
          label: "서식 지우기",
          glyph: clearFormatIcon(),
          run: (editor) =>
            editor
              .chain()
              .focus()
              .unsetAllMarks()
              .clearNodes()
              .updateAttributes("paragraph", { lead: false })
              .run(),
        },
      ),
    )
    this.registry.changes.addEventListener("change", this.refresh)
    this.refresh()
  }

  destroy(): void {
    this.registry.changes.removeEventListener("change", this.refresh)
    this.styles.destroy()
  }

  private toggle(item: Toggle): HTMLButtonElement {
    const hint = shortcutHint(item.id)
    const button = h(
      "button",
      {
        type: "button",
        class: "composer-props__button",
        "data-format": item.id,
        "aria-label": item.label,
        title: `${item.label}${hint ? ` (${hint})` : ""}`,
      },
      item.glyph,
    )
    button.addEventListener("click", () => {
      const editor = this.registry.active()
      if (!editor) return
      item.run(editor)
      this.refresh()
    })
    if (item.active) this.toggles.push({ button, item })
    return button
  }

  private symbolMenu(): HTMLElement {
    const menu = h("div", {
      class: "composer-toolbox__menu composer-props__symbols",
      role: "menu",
      "aria-label": "특수문자",
    })
    for (const group of SYMBOL_GROUPS) {
      menu.append(
        h("span", { class: "composer-props__symbols-caption", role: "presentation" }, group.label),
      )
      for (const symbol of group.symbols) {
        const button = h("button", { type: "button", role: "menuitem", title: symbol }, symbol)
        button.addEventListener("click", () => {
          this.closeMenu()
          this.registry.active()?.chain().focus().insertContent(symbol).run()
        })
        menu.append(button)
      }
    }
    return menu
  }

  private readonly refresh = (): void => {
    const editor = this.registry.active()
    const editable = editor?.isEditable ?? false
    for (const control of this.element.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(
      "button, select",
    ))
      control.disabled = !editable
    if (!editor) return
    this.styles.sync(editor)
    for (const { button, item } of this.toggles)
      button.setAttribute("aria-pressed", String(item.active?.(editor) ?? false))
    const level: unknown = editor.getAttributes("heading")["level"]
    this.blockType.value =
      typeof level === "number"
        ? String(level)
        : editor.isActive("blockquote")
          ? "quote"
          : editor.getAttributes("paragraph")["lead"]
            ? "lead"
            : "paragraph"
  }
}

function mark(name: string, label: string, glyph: string | Node): Toggle {
  return {
    id: name,
    label,
    glyph,
    active: (editor) => editor.isActive(name),
    run: (editor) => editor.chain().focus().toggleMark(name).run(),
  }
}

function setBlockType(editor: Editor, type: BlockType): void {
  const chain = editor.chain().focus()
  if (type === "quote") {
    if (!editor.isActive("blockquote")) chain.setParagraph().wrapIn("blockquote").run()
    return
  }
  if (editor.isActive("blockquote")) chain.lift("blockquote")
  if (type === "1" || type === "2" || type === "3") {
    chain.setHeading({ level: Number(type) as 1 | 2 | 3 }).run()
    return
  }
  chain
    .setParagraph()
    .updateAttributes("paragraph", { lead: type === "lead" })
    .run()
}
