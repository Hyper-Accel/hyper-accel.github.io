import type { Editor } from "@tiptap/core"

export type EditorCommand =
  | "undo"
  | "redo"
  | "paragraph"
  | "heading2"
  | "heading3"
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "blockquote"
  | "bulletList"
  | "orderedList"

export function runEditorCommand(editor: Editor, command: EditorCommand): void {
  const chain = editor.chain().focus()
  switch (command) {
    case "undo":
      chain.undo().run()
      return
    case "redo":
      chain.redo().run()
      return
    case "paragraph":
      chain.setParagraph().run()
      return
    case "heading2":
      chain.toggleHeading({ level: 2 }).run()
      return
    case "heading3":
      chain.toggleHeading({ level: 3 }).run()
      return
    case "bold":
      chain.toggleBold().run()
      return
    case "italic":
      chain.toggleItalic().run()
      return
    case "strike":
      chain.toggleStrike().run()
      return
    case "code":
      chain.toggleCode().run()
      return
    case "blockquote":
      chain.toggleBlockquote().run()
      return
    case "bulletList":
      chain.toggleBulletList().run()
      return
    case "orderedList":
      chain.toggleOrderedList().run()
  }
}

export function syncToolbarState(editor: Editor, root: HTMLElement): void {
  const active: Partial<Record<EditorCommand, boolean>> = {
    paragraph: editor.isActive("paragraph"),
    heading2: editor.isActive("heading", { level: 2 }),
    heading3: editor.isActive("heading", { level: 3 }),
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    strike: editor.isActive("strike"),
    code: editor.isActive("code"),
    blockquote: editor.isActive("blockquote"),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-command]")) {
    const command = button.dataset["command"] as EditorCommand | undefined
    button.setAttribute("aria-pressed", command && active[command] ? "true" : "false")
  }
}
