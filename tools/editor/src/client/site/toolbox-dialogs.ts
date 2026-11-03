import type { Editor } from "@tiptap/core"
import { h } from "../composer/dom"
import { EDITOR_SHORTCUTS, isMacOS, shortcutLabel, UNMAPPED_SHORTCUTS } from "../composer/shortcuts"
import "./toolbox.css"

export class ToolboxDialogs {
  private dialog: HTMLDialogElement | null = null
  constructor(private readonly current: () => Editor | null) {}

  /** The shortcut guide. Videos and footnotes are inserted in place, without a dialog. */
  show(): void {
    this.close()
    const editor = this.current()
    if (!editor) return
    const dialog = h("dialog", {
      class: "composer-tool-dialog",
      "data-onsite-ui": "",
      "aria-label": "단축키 안내",
    })
    const close = h("button", { type: "button", "aria-label": "닫기" }, "닫기")
    close.addEventListener("click", () => this.close())
    dialog.append(h("header", {}, h("h2", {}, dialog.getAttribute("aria-label") ?? ""), close))
    const mac = isMacOS()
    const table = h("dl", { class: "composer-shortcuts" })
    for (const entry of EDITOR_SHORTCUTS)
      table.append(
        h("dt", {}, entry.label),
        h("dd", {}, h("kbd", {}, shortcutLabel(entry.keys, mac))),
      )
    dialog.append(
      table,
      h(
        "p",
        {},
        "이동·선택·복사·잘라내기·붙여넣기·전체 선택·삭제·줄바꿈은 운영체제 기본 키를 그대로 사용합니다. Esc로 메뉴를 닫습니다.",
      ),
      ...UNMAPPED_SHORTCUTS.map((text) => h("p", {}, text)),
    )
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault()
      this.close()
    })
    document.body.append(dialog)
    this.dialog = dialog
    dialog.showModal()
    dialog.querySelector("input")?.focus()
  }

  close(): void {
    if (!this.dialog) return
    this.dialog.close()
    this.dialog.remove()
    this.dialog = null
    this.current()?.commands.focus()
  }
}
