import { type Editor, Extension, type JSONContent } from "@tiptap/core"
import { NodeSelection, Plugin, TextSelection } from "@tiptap/pm/state"
import { editorTopInset } from "./editor-occlusion"

/** Editors of both languages; the visible one receives toolbox inserts. */
export class EditorRegistry {
  private readonly editors = new Set<Editor>()
  readonly changes = new EventTarget()
  readonly extension: Extension

  constructor() {
    const editors = this.editors
    const notify = (): void => {
      this.changes.dispatchEvent(new Event("change"))
    }
    this.extension = Extension.create({
      name: "siteEditorRegistry",
      onCreate() {
        editors.add(this.editor)
        notify()
      },
      onDestroy() {
        editors.delete(this.editor)
        notify()
      },
      onTransaction: notify,
      onFocus: notify,
      addProseMirrorPlugins() {
        return [
          new Plugin({
            props: {
              get scrollMargin() {
                const dock = document.querySelector<HTMLElement>(".composer-dock")
                return {
                  top: editorTopInset(),
                  bottom: (dock?.offsetHeight ?? 0) + 12,
                  left: 5,
                  right: 5,
                }
              },
            },
          }),
        ]
      },
    })
  }

  active(): Editor | null {
    for (const editor of this.editors) {
      if (editor.isDestroyed) continue
      if (!editor.view.dom.closest<HTMLElement>("[data-lang]")?.hidden) return editor
    }
    return null
  }
}

/** Replace an empty paragraph, otherwise insert after the current article block. */
export function insertBlock(editor: Editor, content: JSONContent, caret: number | null): void {
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const node = state.schema.nodeFromJSON(content)
      const { selection } = tr
      const $from = selection.$from
      let at: number
      const parent = $from.depth > 0 ? $from.node(-1) : null
      if (
        !(selection instanceof NodeSelection) &&
        $from.parent.isTextblock &&
        $from.parent.content.size === 0 &&
        parent?.canReplaceWith($from.index(-1), $from.indexAfter(-1), node.type)
      ) {
        at = $from.before()
        tr.replaceWith(at, $from.after(), node)
      } else {
        at =
          selection instanceof NodeSelection && $from.depth === 0
            ? selection.to
            : $from.depth > 0
              ? $from.after(1)
              : $from.pos
        // Footnotes stay at the document end even when inserting from a definition.
        const section = tr.doc.lastChild
        if (section?.type.name === "footnoteSection")
          at = Math.min(at, tr.doc.content.size - section.nodeSize)
        tr.insert(at, node)
      }
      if (caret === null) {
        const inserted = tr.doc.nodeAt(at)
        if (inserted && NodeSelection.isSelectable(inserted))
          tr.setSelection(NodeSelection.create(tr.doc, at))
      } else tr.setSelection(TextSelection.near(tr.doc.resolve(at + caret)))
      tr.scrollIntoView()
      return true
    })
    .run()
}
