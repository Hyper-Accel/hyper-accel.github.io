import { Extension } from "@tiptap/core"
import { EDITOR_SHORTCUTS } from "./shortcuts"

export const EditorShortcuts = Extension.create({
  name: "editorShortcuts",
  priority: 1200,
  addKeyboardShortcuts() {
    return Object.fromEntries(
      EDITOR_SHORTCUTS.filter((entry) => entry.id !== "comment").map((entry) => [
        entry.keys,
        () => {
          const editor = this.editor
          if (!editor.isEditable) return false
          switch (entry.id) {
            case "bold":
              return editor.commands.toggleBold()
            case "italic":
              return editor.commands.toggleItalic()
            case "underline":
              return editor.commands.toggleUnderline()
            case "strike":
              return editor.commands.toggleStrike()
            case "code":
              return editor.commands.toggleCode()
            case "highlight":
            case "subscript":
            case "superscript":
              return editor.commands.toggleMark(entry.id)
            case "paragraph":
              return editor
                .chain()
                .setParagraph()
                .updateAttributes("paragraph", { lead: false })
                .run()
            case "lead":
              return editor
                .chain()
                .setParagraph()
                .updateAttributes("paragraph", { lead: true })
                .run()
            case "heading-1":
              return editor.commands.setHeading({ level: 1 })
            case "heading-2":
              return editor.commands.setHeading({ level: 2 })
            case "heading-3":
              return editor.commands.setHeading({ level: 3 })
            case "bullet-list":
              return editor.commands.toggleBulletList()
            case "ordered-list":
              return editor.commands.toggleOrderedList()
            case "quote":
              return editor.commands.toggleBlockquote()
            case "divider":
              return editor.commands.setHorizontalRule()
            case "undo":
              return editor.commands.undo()
            case "redo":
            case "redo-shift":
              return editor.commands.redo()
            case "clear":
              return editor
                .chain()
                .unsetAllMarks()
                .clearNodes()
                .updateAttributes("paragraph", { lead: false })
                .run()
            case "save":
            case "save-shift": {
              const save = document.querySelector<HTMLButtonElement>("[data-site-save]")
              if (save && !save.disabled) save.click()
              return true
            }
            case "link":
            case "image":
            case "youtube":
            case "footnote":
            case "help":
              editor.view.dom.dispatchEvent(
                new CustomEvent("onsite-editor-tool", {
                  bubbles: true,
                  detail: entry.id,
                }),
              )
              return true
            default: {
              const exhaustive: never = entry
              return exhaustive
            }
          }
        },
      ]),
    )
  },
})

/** One Tab in running text: two em spaces (Markdown would read a leading tab or spaces as code). */
export const TAB_SPACE = "\u2003\u2003"

/**
 * Tab writes a horizontal space where the caret is, as in a word processor, instead of moving focus
 * to the next button. Lists (indent) and tables (next cell) keep their own Tab, which runs first;
 * in a code block Tab indents by four spaces. Shift+Tab takes back a space written just before.
 */
export const TabSpace = Extension.create({
  name: "tabSpace",
  priority: 50,
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const { editor } = this
        const { selection } = editor.state
        if (!editor.isEditable || !selection.$from.parent.isTextblock) return false
        const space = selection.$from.parent.type.name === "codeBlock" ? "    " : TAB_SPACE
        return editor.commands.insertContent(space)
      },
      "Shift-Tab": () => {
        const { editor } = this
        const { selection } = editor.state
        if (!editor.isEditable || !selection.empty || !selection.$from.parent.isTextblock)
          return false
        const space = selection.$from.parent.type.name === "codeBlock" ? "    " : TAB_SPACE
        const from = selection.from - space.length
        if (from < selection.$from.start()) return true
        if (editor.state.doc.textBetween(from, selection.from) !== space) return true
        return editor.commands.deleteRange({ from, to: selection.from })
      },
    }
  },
})
