import type { Editor, JSONContent } from "@tiptap/core"
import { EMPTY_IMAGE } from "../blocks/attrs"
import { insertFootnote } from "../blocks/footnotes"
import { chooseInsertKind } from "../blocks/group-chooser"
import { pictureNodes } from "../blocks/image-groups"
import { MATH_INLINE_NODE } from "../blocks/math"
import { type SlashMenuItem, slashMenuItems } from "../blocks/slash-menu"
import { h } from "../composer/dom"
import type { BlockExtensionContext } from "../composer/types"
import "./toolbox.css"
import "./toolbox-card.css"
import { shortcutHint } from "../composer/shortcuts"
import { type EditorRegistry, insertBlock } from "./editor-registry"
import { PropertyBar } from "./property-bar"
import { ToolboxDialogs } from "./toolbox-dialogs"
import { ToolboxLayout } from "./toolbox-layout"
import { alertMenu, tableMenu } from "./toolbox-menus"

export { EditorRegistry, insertBlock } from "./editor-registry"

/** Editors of both languages; the visible one receives toolbox inserts. */
const TOOLS: readonly { readonly id: string; readonly label: string }[] = [
  { id: "undo", label: "실행 취소" },
  { id: "redo", label: "다시 실행" },
  { id: "bullet-list", label: "글머리 목록" },
  { id: "ordered-list", label: "번호 목록" },
  { id: "image", label: "사진" },
  { id: "steps", label: "단계" },
  { id: "tabs", label: "탭" },
  { id: "alert", label: "콜아웃" },
  { id: "table", label: "표" },
  { id: "code", label: "코드" },
  { id: "math", label: "수식" },
  { id: "quote", label: "인용" },
  { id: "divider", label: "구분선" },
  { id: "footnote", label: "각주" },
  { id: "youtube", label: "동영상" },
  { id: "compare", label: "전후 비교" },
  { id: "help", label: "단축키 안내" },
]

export interface ToolboxOptions {
  readonly registry: EditorRegistry
  /** Set once the composer builds its block extensions. */
  readonly context: () => BlockExtensionContext | null
  /** Panel toggles placed at the end of the bar (라이브러리, 모바일 미리보기). */
  readonly panels: readonly HTMLButtonElement[]
}

/** Naver-style 도구상자: one always-visible row of insert buttons with icons and names. */
const COLLAPSED_KEY = "onsite:toolbox-collapsed"

export class SiteToolbox {
  readonly element: HTMLElement
  private readonly items = new Map(slashMenuItems().map((item) => [item.id, item]))
  private open: { readonly button: HTMLButtonElement; readonly menu: HTMLElement } | null = null
  private readonly dialogs = new ToolboxDialogs(() => this.editor())
  private readonly layout: ToolboxLayout
  private readonly props: PropertyBar

  constructor(private readonly options: ToolboxOptions) {
    // One thin row stays on top (history, text formats, ＋ 넣기); the insert tools live in a card at
    // the top right: open beside the article on wide screens, a popup under ＋ 넣기 otherwise.
    const history = TOOLS.filter((tool) => tool.id === "undo" || tool.id === "redo").map((tool) =>
      this.button(tool.id, tool.label),
    )
    const buttons = TOOLS.filter((tool) => tool.id !== "undo" && tool.id !== "redo").map((tool) =>
      this.button(tool.id, tool.label),
    )
    const collapse = h(
      "button",
      {
        type: "button",
        class: "composer-toolbox__collapse composer-toolbox__insert",
        "aria-controls": "composer-toolbox-tools",
      },
      h("span", { "aria-hidden": "true" }, "＋"),
      " 넣기",
    )
    const tools = h(
      "div",
      { class: "composer-toolbox__tools", id: "composer-toolbox-tools" },
      ...buttons,
    )
    const close = h(
      "button",
      { type: "button", class: "composer-toolbox__card-close", "aria-label": "넣기 도구 닫기" },
      "✕",
    )
    // 라이브러리 · 모바일 open panels beside the post, so they stay in the thin row, not in the card
    // (a panel on the right would otherwise cover the card).
    const bar = h(
      "div",
      { class: "composer-toolbox__bar" },
      ...history,
      collapse,
      ...options.panels,
    )
    this.element = h(
      "div",
      {
        class: "composer-toolbox",
        role: "toolbar",
        "aria-label": "도구상자",
        "data-onsite-ui": "",
        "data-layout": "card",
      },
      bar,
      h(
        "div",
        { class: "composer-toolbox__row" },
        h(
          "div",
          { class: "composer-toolbox__card-head" },
          h("span", { class: "composer-toolbox__card-title" }, "넣기"),
          close,
        ),
        tools,
      ),
    )
    // The text formats (Naver's 속성 도구 막대) fill the thin row between history and ＋ 넣기.
    this.props = new PropertyBar(
      options.registry,
      (button, menu) => this.toggle(button, menu),
      () => this.close(),
    )
    bar.insertBefore(this.props.element, collapse)
    const wide = window.matchMedia("(min-width: 1300px)")
    const setCollapsed = (collapsed: boolean): void => {
      this.element.toggleAttribute("data-collapsed", collapsed)
      this.element.classList.toggle("is-collapsed", collapsed)
      tools.hidden = collapsed
      collapse.setAttribute("aria-expanded", String(!collapsed))
      collapse.title = collapsed ? "넣기 도구 열기" : "넣기 도구 닫기"
      if (collapsed) this.close()
    }
    const remember = (collapsed: boolean): void => {
      localStorage.setItem(COLLAPSED_KEY, String(collapsed))
      setCollapsed(collapsed)
    }
    // Beside the article there is room for the card; on a narrow screen it would cover the text,
    // so there it opens only when asked.
    setCollapsed(!wide.matches || localStorage.getItem(COLLAPSED_KEY) === "true")
    wide.addEventListener("change", () =>
      setCollapsed(!wide.matches || localStorage.getItem(COLLAPSED_KEY) === "true"),
    )
    this.layout = new ToolboxLayout(this.element, tools)
    collapse.addEventListener("click", () => remember(!this.element.hasAttribute("data-collapsed")))
    close.addEventListener("click", () => remember(true))
    // As a popup (narrow screens) the card closes once a tool is picked; menus keep it open.
    tools.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("button") : null
      if (!wide.matches && button && !button.hasAttribute("aria-haspopup")) setCollapsed(true)
    })
    // Keep the caret in the article while clicking tools.
    this.element.addEventListener("mousedown", (event) => {
      // Fields (address inputs, the 글 유형 · 글꼴 · 크기 lists) must take the click to open or type;
      // every other control keeps the caret and selection in the article.
      if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement))
        event.preventDefault()
    })
    document.addEventListener("mousedown", this.onOutside, true)
    document.addEventListener("keydown", this.onKey)
    document.addEventListener("onsite-editor-tool", this.onTool)
    options.registry.changes.addEventListener("change", this.refreshHistory)
    document.addEventListener("click", this.refreshHistory)
    this.refreshHistory()
  }

  private icon(id: string): string {
    const icons: Readonly<Record<string, string>> = {
      undo: "↶",
      redo: "↷",
      footnote: "¹",
      youtube: "▷",
      help: "?",
    }
    if (icons[id]) return icons[id]
    if (id === "alert") return "!"
    return this.items.get(id)?.icon ?? "+"
  }

  private button(id: string, label: string): HTMLButtonElement {
    const menu = id === "alert" || id === "table"
    const button = h(
      "button",
      {
        type: "button",
        class: "composer-toolbox__button",
        "data-tool": id,
        title: `${label}${id !== "code" && shortcutHint(id) ? ` (${shortcutHint(id)})` : ""}`,
        ...(menu ? { "aria-haspopup": "true", "aria-expanded": "false" } : {}),
      },
      h("span", { class: "composer-toolbox__icon", "aria-hidden": "true" }, this.icon(id)),
      h("span", { class: "composer-toolbox__label" }, label),
    )
    button.addEventListener("click", () => {
      const editor = this.editor()
      if (id === "undo") editor?.chain().focus().undo().run()
      else if (id === "redo") editor?.chain().focus().redo().run()
      else if (id === "bullet-list") editor?.chain().focus().toggleBulletList().run()
      else if (id === "ordered-list") editor?.chain().focus().toggleOrderedList().run()
      else if (id === "youtube") this.insertVideo()
      else if (id === "footnote") this.insertNote()
      else if (id === "math") this.insertMath()
      else if (id === "help") this.dialogs.show()
      else if (id === "alert") this.toggle(button, this.alertMenu())
      else if (id === "table") this.toggle(button, this.tableMenu())
      else if (id === "image") void this.insertImage()
      else this.insertItem(this.items.get(id))
      // A tool picked by keyboard from the "더보기" menu must not keep focus on its (now hidden)
      // button: typing would be lost and Space would run the tool again.
      if (!menu && id !== "help" && id !== "image" && document.activeElement === button)
        this.editor()?.view.focus()
    })
    return button
  }

  private editor(): Editor | null {
    return this.options.registry.active()
  }

  private insertItem(item: SlashMenuItem | undefined, content?: JSONContent): void {
    const editor = this.editor()
    if (!item || !editor) return
    const node = content ?? item.content()
    if (!node.type || !editor.schema.nodes[node.type]) return
    this.close()
    insertBlock(editor, node, item.caret)
  }

  /**
   * In a line of text the formula goes in at the caret (inline, the selected text as its LaTeX); on
   * an empty line it is a display formula of its own.
   */
  private insertMath(): void {
    const editor = this.editor()
    if (!editor) return
    const { from, to, $from, $to } = editor.state.selection
    if (!$from.parent.isTextblock || $from.parent.content.size === 0 || !$from.sameParent($to)) {
      this.insertItem(this.items.get("math"))
      return
    }
    this.close()
    const source = editor.state.doc.textBetween(from, to).trim()
    editor
      .chain()
      .insertContentAt({ from, to }, { type: MATH_INLINE_NODE, attrs: { source } })
      .setNodeSelection(from)
      .run()
  }

  /** An empty video box in place; its address field takes the YouTube link (no dialog). */
  private insertVideo(): void {
    const editor = this.editor()
    if (editor) insertBlock(editor, { type: "youtube", attrs: { videoId: "" } }, null)
  }

  /** The number goes in at the caret and the caret moves to the note at the end of the post. */
  private insertNote(): void {
    const editor = this.editor()
    if (editor) insertFootnote(editor, "")
  }

  /**
   * 사진: one or several files. Several ask how they go in (Naver's 개별 사진 · 나란히 · 슬라이드), from
   * a small menu under the 사진 button.
   */
  private async insertImage(): Promise<void> {
    const editor = this.editor()
    const context = this.options.context()
    if (!editor || !context) return
    // Remember where to put the pictures while the file picker is open.
    const { from } = editor.state.selection
    const choices = await context.requestImages()
    if (choices.length === 0 || editor.isDestroyed) return
    const images = choices.map((choice) => ({
      ...EMPTY_IMAGE,
      src: choice.src,
      alt: choice.alt ?? "",
    }))
    const button = this.element.querySelector<HTMLElement>('[data-tool="image"]')
    const rect = button?.getBoundingClientRect()
    const kind =
      images.length > 1
        ? await chooseInsertKind(
            rect && rect.width > 0
              ? { x: rect.left + rect.width / 2, y: rect.bottom }
              : { x: innerWidth / 2, y: 120 },
            images.length,
          )
        : "single"
    if (editor.isDestroyed) return
    editor.commands.setTextSelection(Math.min(from, editor.state.doc.content.size))
    for (const node of pictureNodes(editor.schema, kind, images))
      insertBlock(editor, node.toJSON(), null)
  }

  private alertMenu(): HTMLElement {
    return alertMenu(this.items.values(), (item) => this.insertItem(item))
  }

  private tableMenu(): HTMLElement {
    return tableMenu((content) => this.insertItem(this.items.get("table"), content))
  }

  private toggle(button: HTMLButtonElement, menu: HTMLElement): void {
    const same = this.open?.button === button
    this.close()
    if (same) return
    button.setAttribute("aria-expanded", "true")
    document.body.append(menu)
    const rect = button.getBoundingClientRect()
    const width = menu.offsetWidth
    menu.style.top = `${Math.round(rect.bottom + 6)}px`
    menu.style.left = `${Math.round(Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)))}px`
    this.open = { button, menu }
    // The preselected choice (the table menu's 3 × 3) takes focus, not the first button.
    ;(
      menu.querySelector<HTMLButtonElement>("[data-autofocus]") ??
      menu.querySelector<HTMLButtonElement>("button")
    )?.focus({ preventScroll: true })
  }

  close(): void {
    if (!this.open) return
    this.open.button.setAttribute("aria-expanded", "false")
    this.open.menu.remove()
    this.open = null
  }

  private readonly onOutside = (event: MouseEvent): void => {
    // As a popup (narrow screens) the insert card closes when the writer taps elsewhere.
    if (
      event.target instanceof Node &&
      !window.matchMedia("(min-width: 1300px)").matches &&
      !this.element.hasAttribute("data-collapsed") &&
      !this.element.contains(event.target) &&
      !this.open?.menu.contains(event.target)
    )
      this.element.querySelector<HTMLButtonElement>(".composer-toolbox__insert")?.click()
    if (!this.open || !(event.target instanceof Node)) return
    if (this.open.menu.contains(event.target) || this.open.button.contains(event.target)) return
    this.close()
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.open) {
      const { button } = this.open
      this.close()
      button.focus({ preventScroll: true })
    }
    if (event.defaultPrevented || event.altKey || !(event.metaKey || event.ctrlKey)) return
    if (event.key.toLowerCase() === "s" && this.editor()?.isEditable) {
      event.preventDefault()
      document.querySelector<HTMLButtonElement>("[data-site-save]:not(:disabled)")?.click()
    }
    if (event.key === "/" && this.editor()?.isEditable) {
      event.preventDefault()
      this.dialogs.show()
    }
  }

  private readonly onTool = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return
    const id: unknown = event.detail
    if (id === "youtube") this.insertVideo()
    else if (id === "footnote") this.insertNote()
    else if (id === "help") this.dialogs.show()
    else if (id === "image") void this.insertImage()
  }

  private readonly refreshHistory = (): void => {
    const editor = this.editor()
    const undo = this.element.querySelector<HTMLButtonElement>('[data-tool="undo"]')
    const redo = this.element.querySelector<HTMLButtonElement>('[data-tool="redo"]')
    if (undo) undo.disabled = !editor?.isEditable || !editor.can().undo()
    if (redo) redo.disabled = !editor?.isEditable || !editor.can().redo()
  }

  dispose(): void {
    this.layout.destroy()
    this.props.destroy()
    this.close()
    this.dialogs.close()
    document.removeEventListener("mousedown", this.onOutside, true)
    document.removeEventListener("keydown", this.onKey)
    document.removeEventListener("onsite-editor-tool", this.onTool)
    this.options.registry.changes.removeEventListener("change", this.refreshHistory)
    document.removeEventListener("click", this.refreshHistory)
    this.element.remove()
  }
}
