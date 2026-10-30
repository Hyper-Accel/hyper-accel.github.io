import type { AnyExtension, Editor } from "@tiptap/core"
import { EditorState, TextSelection } from "@tiptap/pm/state"
import { LANGUAGES, newBlockId } from "../../document/codec"
import type { Language } from "../../shared/onsite/document"
import type { DraftCursor } from "../../shared/onsite/drafts"
import { createBlockEditor } from "../editor"
import type { MarkdownTransport } from "../markdown"
import { ArticleDocument, articlePoint, articlePosition } from "./article-document"
import { articleIdentity, articleOrder, articleRanges } from "./article-identity"
import { createArticleToolbar } from "./article-toolbar"
import { insertArticleImage, insertArticleImages, reorderArticle } from "./article-transactions"
import { BlockHandlesExtension } from "./block-handles"
import { createCodeLanguagePicker } from "./code-language"
import { h } from "./dom"
import { createTableToolbar } from "./table-toolbar"
import "./article-editor.css"

export interface PairRow {
  readonly id: string
  readonly ko: string
  readonly en: string
}
export type RowStatus = "complete" | "needs-ko" | "needs-en" | "empty"
export const ROW_STATUS_LABEL: Record<RowStatus, string> = {
  complete: "번역 완료",
  "needs-ko": "한국어 번역 필요",
  "needs-en": "영어 번역 필요",
  empty: "비어 있음",
}
export const LANGUAGE_NAME: Record<Language, string> = { ko: "한국어", en: "English" }
export interface PairEditorOptions {
  readonly container: HTMLElement
  readonly extensions: readonly AnyExtension[]
  readonly transport: MarkdownTransport
  readonly mediaUrl: (source: string) => string
  readonly onChange: () => void
  readonly onImage: (file: File) => Promise<{ src: string; alt: string } | null>
  readonly onComment?: (editor: Editor) => void
  /** false shows the article read-only (the writer may not edit this post). */
  readonly editable?: boolean
}
export interface PairEditor {
  setRows(rows: readonly PairRow[]): void
  getRows(): PairRow[]
  setLanguage(language: Language): void
  setCursor(cursor: DraftCursor): void
  insertAfter(id: string | null): string
  remove(id: string): void
  move(id: string, direction: -1 | 1): void
  focus(
    id: string,
    language: Language,
    selection?: { anchor: number; focus: number; focusBlockId?: string },
  ): void
  getCursor(): DraftCursor | null
  statusCounts(): Record<RowStatus, number>
  dispose(): void
}
interface Article {
  readonly editor: Editor
  readonly document: ArticleDocument
  readonly panel: HTMLElement
}

export function createPairEditor(options: PairEditorOptions): PairEditor {
  let order: string[] = []
  let language: Language = "ko"
  let replacing = false
  const articles = new Map<Language, Article>()
  const root = h("div", { class: "composer-article-editor" })
  const current = (): Editor | undefined => articles.get(language)?.editor
  const toolbar = createArticleToolbar(
    current,
    options.onComment ? { onComment: options.onComment } : {},
  )
  const tables = createTableToolbar(current)
  const codeLanguage = createCodeLanguagePicker(current)
  root.append(toolbar.element, tables.element, codeLanguage.element)
  const refreshTools = (): void => {
    toolbar.refresh()
    tables.refresh()
    codeLanguage.refresh()
  }
  options.container.append(root)

  function changed(active: Language): void {
    if (replacing) return
    const article = articles.get(active)
    if (!article) return
    const next = articleOrder(
      order,
      articleRanges(article.editor.state.doc).map((range) => range.id),
    )
    const reordered = next.join("\n") !== order.join("\n")
    order = next
    if (reordered) {
      const other = articles.get(active === "ko" ? "en" : "ko")
      if (other) {
        replacing = true
        reorderArticle(other.editor, order)
        replacing = false
      }
    }
    refreshTools()
    options.onChange()
  }

  function mount(lang: Language, rows: readonly PairRow[]): Article {
    const panel = h("div", {
      class: "composer-document composer-article-language post-content",
      "data-lang": lang,
      lang,
      hidden: lang !== language,
    })
    root.append(panel)
    const editor = createBlockEditor(panel, {
      mediaUrl: options.mediaUrl,
      extensions: [
        ...options.extensions,
        BlockHandlesExtension,
        articleIdentity(() => order[0] ?? newBlockId()),
      ],
      ariaLabel: `${LANGUAGE_NAME[lang]} 본문`,
      editable: options.editable ?? true,
      placeholder: "본문을 입력하세요",
      onChange: () => changed(lang),
      onFocus: () => {
        language = lang
        refreshTools()
      },
      onSelectionUpdate: () => refreshTools(),
      // Focus may land in the toolbar itself; decide after it settles.
      onBlur: (event) => {
        if (
          event.relatedTarget instanceof Node &&
          (toolbar.element.contains(event.relatedTarget) ||
            tables.element.contains(event.relatedTarget) ||
            codeLanguage.element.contains(event.relatedTarget))
        )
          return
        queueMicrotask(() => refreshTools())
      },
      onImage: (file, position, beside) =>
        insertArticleImage(
          editor,
          { file, position, ...(beside ? { beside } : {}) },
          options.onImage,
        ),
      onImages: (files, position, beside, point) =>
        insertArticleImages(
          editor,
          { files, position, point, ...(beside ? { beside } : {}) },
          options.onImage,
        ),
    })
    const manager = editor.markdown
    if (!manager) throw new TypeError("Article editor requires the Markdown extension")
    const document = new ArticleDocument(manager, editor.schema, options.transport)
    const doc = document.load(rows.map((row) => ({ id: row.id, markdown: row[lang] })))
    editor.view.updateState(EditorState.create({ doc, plugins: editor.state.plugins }))
    editor.view.dom.classList.add("composer-article-document")
    return { editor, document, panel }
  }

  function pointSelection(editor: Editor, cursor: Pick<DraftCursor, "anchor" | "focus">): void {
    const doc = editor.state.doc
    const anchor = articlePosition(doc, cursor.anchor, order)
    const head = articlePosition(doc, cursor.focus, order)
    editor.view.dispatch(
      editor.state.tr
        .setSelection(TextSelection.between(doc.resolve(anchor), doc.resolve(head)))
        .scrollIntoView(),
    )
    editor.view.focus()
  }

  const api: PairEditor = {
    setRows(next) {
      replacing = true
      for (const article of articles.values()) {
        article.editor.destroy()
        article.panel.remove()
      }
      articles.clear()
      const rows = next.length ? next : [{ id: newBlockId(), ko: "", en: "" }]
      order = rows.map((row) => row.id)
      for (const lang of LANGUAGES) articles.set(lang, mount(lang, rows))
      replacing = false
      refreshTools()
    },
    getRows() {
      const values = new Map<Language, ReadonlyMap<string, string>>()
      for (const [lang, article] of articles)
        values.set(lang, article.document.read(article.editor.state.doc))
      const rows = order.map((id) => ({
        id,
        ko: values.get("ko")?.get(id) ?? "",
        en: values.get("en")?.get(id) ?? "",
      }))
      const populated = rows.filter((row) => row.ko.trim() !== "" || row.en.trim() !== "")
      // Both translations were deleted. Keep native history, but do not persist
      // invisible empty pairs that the writer cannot remove through the article.
      return populated.length ? populated : rows.slice(0, 1)
    },
    setLanguage(next) {
      language = next
      for (const [lang, article] of articles) article.panel.hidden = lang !== language
      refreshTools()
    },
    setCursor(cursor) {
      api.setLanguage(cursor.language)
      const editor = current()
      if (editor) pointSelection(editor, cursor)
    },
    insertAfter(id) {
      const fresh = newBlockId()
      const rows = api.getRows()
      const index = id === null ? rows.length : rows.findIndex((row) => row.id === id) + 1
      rows.splice(index, 0, { id: fresh, ko: "", en: "" })
      api.setRows(rows)
      api.focus(fresh, language)
      return fresh
    },
    remove(id) {
      api.setRows(api.getRows().filter((row) => row.id !== id))
      options.onChange()
    },
    move(id, direction) {
      const rows = api.getRows()
      const index = rows.findIndex((row) => row.id === id)
      const row = rows[index]
      const other = rows[index + direction]
      if (!row || !other) return
      rows[index] = other
      rows[index + direction] = row
      api.setRows(rows)
      options.onChange()
    },
    focus(id, lang, selection) {
      api.setLanguage(lang)
      const article = articles.get(lang)
      if (!article || !order.includes(id)) return
      if (!articleRanges(article.editor.state.doc).some((range) => range.id === id)) {
        const position = articlePosition(
          article.editor.state.doc,
          { blockId: id, offset: 0 },
          order,
        )
        article.editor.view.dispatch(
          article.editor.state.tr.insert(position, article.document.empty(id)),
        )
      }
      pointSelection(article.editor, {
        anchor: { blockId: id, offset: selection?.anchor ?? 1 },
        focus: { blockId: selection?.focusBlockId ?? id, offset: selection?.focus ?? 1 },
      })
    },
    getCursor() {
      const editor = current()
      if (!editor) return null
      const { doc, selection } = editor.state
      const anchor = articlePoint(doc, selection.anchor)
      const focus = articlePoint(doc, selection.head)
      return anchor && focus
        ? { language, anchor, focus, scrollTop: Math.max(0, window.scrollY) }
        : null
    },
    statusCounts() {
      const counts: Record<RowStatus, number> = {
        complete: 0,
        "needs-ko": 0,
        "needs-en": 0,
        empty: 0,
      }
      for (const row of api.getRows()) {
        const status = row.ko.trim()
          ? row.en.trim()
            ? "complete"
            : "needs-en"
          : row.en.trim()
            ? "needs-ko"
            : "empty"
        counts[status] += 1
      }
      return counts
    },
    dispose() {
      toolbar.destroy()
      tables.destroy()
      codeLanguage.destroy()
      for (const article of articles.values()) article.editor.destroy()
      articles.clear()
      root.remove()
    },
  }
  return api
}
