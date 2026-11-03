import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import { slashMenuItems } from "./slash-items"
import { SlashMenu } from "./slash-popup"
import { type SlashState, slashMenuKey } from "./slash-state"

export { type SlashMenuItem, slashMenuItems, tableContent } from "./slash-items"
export { slashMenuKey } from "./slash-state"

export function createSlashMenuExtension() {
  return Extension.create({
    name: "onsiteSlashMenu",

    addProseMirrorPlugins() {
      const editor = this.editor
      const items = slashMenuItems()
      let menu: SlashMenu | null = null
      return [
        new Plugin<SlashState | null>({
          key: slashMenuKey,
          state: {
            init: () => null,
            apply(tr, value) {
              const meta = tr.getMeta(slashMenuKey) as SlashState | null | undefined
              if (meta !== undefined) {
                return meta
              }
              if (!value) {
                return null
              }
              if (!tr.docChanged) {
                return value
              }
              const mapped = tr.mapping.mapResult(value.from)
              return mapped.deleted ? null : { from: mapped.pos }
            },
          },
          view(view) {
            menu = new SlashMenu(editor, view, items)
            return {
              update: (editorView) => menu?.update(slashMenuKey.getState(editorView.state) ?? null),
              destroy: () => {
                menu?.destroy()
                menu = null
              },
            }
          },
          props: {
            handleTextInput(view, from, to, text) {
              if (text !== "/" || !view.editable) {
                return false
              }
              const $from = view.state.doc.resolve(from)
              if (!$from.parent.isTextblock || $from.parent.type.spec.code) {
                return false
              }
              const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc")
              if (before !== "" && !/\s$/.test(before)) {
                return false
              }
              view.dispatch(view.state.tr.insertText("/", from, to).setMeta(slashMenuKey, { from }))
              return true
            },
            handleKeyDown(_view, event) {
              return menu?.handleKey(event) ?? false
            },
          },
        }),
      ]
    },
  })
}
