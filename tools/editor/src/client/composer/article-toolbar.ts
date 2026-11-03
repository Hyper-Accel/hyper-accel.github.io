import type { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { h } from "./dom"
import { commentIcon, highlightGlyph, linkIcon, underlineGlyph } from "./icons"
import { createLinkControls } from "./link-controls"
import { shortcutHint } from "./shortcuts"
import { createStyleControls } from "./style-controls"
import { type FormatControl, fillFormatMenu } from "./toolbar-formats"
import { placeToolbar } from "./toolbar-position"

export interface ArticleToolbarOptions {
  readonly onComment?: (editor: Editor) => void
}
export interface ArticleToolbar {
  readonly element: HTMLElement
  refresh(): void
  destroy(): void
}

export function createArticleToolbar(
  current: () => Editor | undefined,
  options: ArticleToolbarOptions = {},
): ArticleToolbar {
  const element = h("div", {
    class: "composer-bubble",
    role: "toolbar",
    "aria-label": "선택 서식",
    hidden: true,
  })
  const row = h("div", { class: "composer-bubble__row" })
  const menu = h("div", {
    class: "composer-bubble__more",
    role: "menu",
    "aria-label": "서식 더보기",
    hidden: true,
  })
  const toggles: { readonly button: HTMLButtonElement; readonly mark: string }[] = []
  let editingLink = false
  const close = (): void => {
    editingLink = false
    links.hide()
    menu.hidden = true
    more.setAttribute("aria-expanded", "false")
    current()?.commands.focus()
    refresh()
  }
  const links = createLinkControls(current, close, () => {
    editingLink = true
    row.hidden = true
  })
  const control = (item: FormatControl): HTMLButtonElement => {
    const hint = shortcutHint(item.id ?? item.mark ?? "")
    const button = h(
      "button",
      {
        type: "button",
        "aria-label": item.label,
        title: `${item.label}${hint ? ` (${hint})` : ""}`,
      },
      item.glyph ?? item.label,
    )
    button.addEventListener("mousedown", (event) => event.preventDefault())
    button.addEventListener("click", () => {
      const editor = current()
      if (editor) item.action(editor)
      // A pick from "서식 더보기" closes that menu, like any menu.
      if (menu.contains(button)) {
        menu.hidden = true
        more.setAttribute("aria-expanded", "false")
      }
      refresh()
    })
    if (item.mark) toggles.push({ button, mark: item.mark })
    return button
  }
  const heading = h(
    "select",
    {
      "aria-label": "문단 스타일",
      title: `문단 스타일 (${shortcutHint("paragraph")}, ${shortcutHint("lead")})`,
    },
    h("option", { value: "paragraph" }, "본문"),
    h("option", { value: "lead" }, "리드 문단"),
    ...[1, 2, 3].map((level) => h("option", { value: String(level) }, `제목 ${level}`)),
  )
  heading.addEventListener("change", () => {
    const chain = current()?.chain().focus()
    if (!chain) return
    switch (heading.value) {
      case "1":
        chain.setHeading({ level: 1 }).run()
        break
      case "2":
        chain.setHeading({ level: 2 }).run()
        break
      case "3":
        chain.setHeading({ level: 3 }).run()
        break
      default:
        chain
          .setParagraph()
          .updateAttributes("paragraph", { lead: heading.value === "lead" })
          .run()
    }
  })
  const showLink = (): void => {
    editingLink = true
    menu.hidden = true
    row.hidden = true
    element.hidden = false
    links.showForm()
    place()
  }
  const more = control({
    label: "서식 더보기",
    glyph: "⋯",
    action: () => {
      menu.hidden = !menu.hidden
      more.setAttribute("aria-expanded", String(!menu.hidden))
      place()
      if (!menu.hidden) menu.querySelector("button")?.focus()
    },
  })
  more.setAttribute("aria-haspopup", "menu")
  more.setAttribute("aria-expanded", "false")
  const styles = createStyleControls(() => current() ?? null, "composer-bubble")
  row.append(
    heading,
    styles.font,
    styles.size,
    control({
      label: "굵게",
      glyph: "B",
      mark: "bold",
      action: (e) => e.chain().focus().toggleBold().run(),
    }),
    control({
      label: "기울임",
      glyph: "I",
      mark: "italic",
      action: (e) => e.chain().focus().toggleItalic().run(),
    }),
    control({
      label: "밑줄",
      glyph: underlineGlyph(),
      mark: "underline",
      action: (e) => e.chain().focus().toggleUnderline().run(),
    }),
    control({
      label: "취소선",
      glyph: "S",
      mark: "strike",
      action: (e) => e.chain().focus().toggleStrike().run(),
    }),
    control({
      label: "형광펜",
      glyph: highlightGlyph(),
      mark: "highlight",
      action: (e) => e.chain().focus().toggleMark("highlight").run(),
    }),
    styles.color,
    styles.background,
    control({ label: "링크", glyph: linkIcon(), id: "link", action: showLink }),
    more,
  )
  if (options.onComment) {
    const onComment = options.onComment
    row.append(control({ label: "댓글", glyph: commentIcon(), id: "comment", action: onComment }))
  }
  fillFormatMenu(menu, control)
  // In the menu each alignment carries its name beside the arrow (왼쪽, 가운데, …).
  for (const button of styles.align)
    button.append(" ", (button.getAttribute("aria-label") ?? "").replace(" 정렬", ""))
  menu.append(h("span", { class: "composer-bubble__caption" }, "정렬"), ...styles.align)
  element.append(row, links.form, links.summary, menu)

  function place(): void {
    const editor = current()
    if (editor) placeToolbar(editor, element, menu)
  }
  function refresh(): void {
    const editor = current()
    const selection = editor?.state.selection
    const focused = editor && (editor.view.hasFocus() || element.contains(document.activeElement))
    // A read-only post (someone reviewing it) cannot take focus; a selection there offers only 댓글.
    const readOnly = editor !== null && editor !== undefined && !editor.isEditable
    if (
      !editor ||
      !(focused || readOnly) ||
      !(selection instanceof TextSelection) ||
      (selection.empty && (readOnly || (!editor.isActive("link") && !editingLink))) ||
      editor.isActive("codeBlock")
    ) {
      element.hidden = true
      menu.hidden = true
      editingLink = false
      links.hide()
      return
    }
    element.hidden = false
    element.dataset["readonly"] = String(readOnly)
    if (!editingLink) {
      links.hide()
      row.hidden = selection.empty
      if (selection.empty && editor.isActive("link")) links.showSummary()
    }
    for (const entry of toggles)
      entry.button.setAttribute("aria-pressed", String(editor.isActive(entry.mark)))
    styles.sync(editor)
    more.setAttribute("aria-expanded", String(!menu.hidden))
    const level: unknown = editor.getAttributes("heading")["level"]
    heading.value =
      typeof level === "number"
        ? String(level)
        : editor.getAttributes("paragraph")["lead"]
          ? "lead"
          : "paragraph"
    place()
  }
  const onKey = (event: KeyboardEvent): void => {
    if (
      event.key === "Escape" &&
      (!menu.hidden || editingLink || element.contains(document.activeElement))
    ) {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }
  const onTool = (event: Event): void => {
    if (
      event instanceof CustomEvent &&
      event.detail === "link" &&
      current()?.view.dom.contains(event.target instanceof Node ? event.target : null)
    )
      showLink()
  }
  const outside = (event: MouseEvent): void => {
    if (event.target instanceof Node && !element.contains(event.target)) {
      menu.hidden = true
      editingLink = false
      links.hide()
    }
  }
  document.addEventListener("keydown", onKey)
  element.addEventListener("mousedown", (event) => {
    if (event.target instanceof Element && event.target.closest("button, a")) event.preventDefault()
  })
  document.addEventListener("onsite-editor-tool", onTool)
  document.addEventListener("mousedown", outside)
  window.addEventListener("scroll", place, { passive: true })
  window.addEventListener("resize", place)
  return {
    element,
    refresh,
    destroy() {
      styles.destroy()
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("onsite-editor-tool", onTool)
      document.removeEventListener("mousedown", outside)
      window.removeEventListener("scroll", place)
      window.removeEventListener("resize", place)
    },
  }
}
