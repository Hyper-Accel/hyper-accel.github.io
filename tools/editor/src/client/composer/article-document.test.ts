import { describe, expect, test } from "bun:test"
import { getSchema, resolveExtensions } from "@tiptap/core"
import { TableKit } from "@tiptap/extension-table"
import { MarkdownManager } from "@tiptap/markdown"
import { joinBackward, splitBlock } from "@tiptap/pm/commands"
import { history, redo, undo } from "@tiptap/pm/history"
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state"
import StarterKit from "@tiptap/starter-kit"
import { createBlockExtensions } from "../blocks"
import { createMarkdownTransport } from "../markdown"
import { ArticleDocument, articlePoint, articlePosition } from "./article-document"
import {
  articleIdentity,
  articleOrder,
  articleRanges,
  createArticleIdentityPlugin,
} from "./article-identity"

const extensions = [
  StarterKit.configure({ undoRedo: false }),
  ...createBlockExtensions(),
  articleIdentity(() => "a"),
]
const schema = getSchema(extensions)
const manager = new MarkdownManager({ extensions: resolveExtensions(extensions) })
const transport = createMarkdownTransport(
  (source) => `/preview/${source}`,
  (source) => source.replace("/preview/", ""),
)

function fixture(
  blocks = [
    { id: "a", markdown: "Alpha" },
    { id: "b", markdown: "Bravo" },
    { id: "c", markdown: "Charlie" },
  ],
) {
  const document = new ArticleDocument(manager, schema, transport)
  let state = EditorState.create({
    doc: document.load(blocks),
    plugins: [history(), createArticleIdentityPlugin(() => "a")],
  })
  return {
    document,
    get state() {
      return state
    },
    dispatch(transaction: Transaction) {
      state = state.applyTransaction(transaction).state
    },
  }
}

describe("continuous article identity", () => {
  test("keeps source identities when Enter splits a paragraph", () => {
    // Given one native document with three separately anchored source blocks.
    const f = fixture()
    f.dispatch(f.state.tr.setSelection(TextSelection.create(f.state.doc, 3)))
    // When native splitBlock runs at the caret.
    expect(splitBlock(f.state, f.dispatch)).toBe(true)
    // Then both paragraphs belong to the original ID and neighbors remain unchanged.
    expect(f.state.doc.childCount).toBe(4)
    expect([...f.document.read(f.state.doc)]).toEqual([
      ["a", "Al\n\npha"],
      ["b", "Bravo"],
      ["c", "Charlie"],
    ])
  })

  test("joins paragraph boundaries without deleting the other language identity", () => {
    // Given a caret at the beginning of the second paragraph.
    const f = fixture()
    f.dispatch(f.state.tr.setSelection(TextSelection.create(f.state.doc, 8)))
    // When native Backspace joins the paragraphs.
    expect(joinBackward(f.state, f.dispatch)).toBe(true)
    // Then the article joins naturally and the shared registry retains the empty ID.
    expect([...f.document.read(f.state.doc)]).toEqual([
      ["a", "AlphaBravo"],
      ["c", "Charlie"],
    ])
    const order = articleOrder(
      ["a", "b", "c"],
      articleRanges(f.state.doc).map((range) => range.id),
    )
    const english = new Map([
      ["a", "English A"],
      ["b", "English B"],
      ["c", "English C"],
    ])
    expect(
      order.map((id) => [id, f.document.read(f.state.doc).get(id) ?? "", english.get(id)]),
    ).toEqual([
      ["a", "AlphaBravo", "English A"],
      ["b", "", "English B"],
      ["c", "Charlie", "English C"],
    ])
  })

  test("restores deleted identities and content through native undo", () => {
    // Given a deletion spanning three paragraphs.
    const f = fixture()
    f.dispatch(f.state.tr.setSelection(TextSelection.create(f.state.doc, 3, 17)).deleteSelection())
    // When native undo runs.
    expect(undo(f.state, f.dispatch)).toBe(true)
    // Then every source ID and its text are restored.
    expect([...f.document.read(f.state.doc)]).toEqual([
      ["a", "Alpha"],
      ["b", "Bravo"],
      ["c", "Charlie"],
    ])
  })

  test("reapplies cross-paragraph deletion through native redo", () => {
    // Given the same selection deletion followed by undo.
    const f = fixture()
    f.dispatch(f.state.tr.setSelection(TextSelection.create(f.state.doc, 3, 17)).deleteSelection())
    undo(f.state, f.dispatch)
    // When redo runs.
    expect(redo(f.state, f.dispatch)).toBe(true)
    // Then deletion crosses paragraph boundaries rather than stopping at a block wrapper.
    expect([...f.document.read(f.state.doc)]).toEqual([["a", "Alarlie"]])
  })

  test("round trips backward cross-block cursor positions", () => {
    // Given a backward selection from C into A.
    const f = fixture()
    const anchor = articlePoint(f.state.doc, 18)
    const focus = articlePoint(f.state.doc, 3)
    if (!anchor || !focus) throw new Error("missing article points")
    // When the cursor endpoints are restored independently.
    const selection = TextSelection.between(
      f.state.doc.resolve(articlePosition(f.state.doc, anchor, ["a", "b", "c"])),
      f.state.doc.resolve(articlePosition(f.state.doc, focus, ["a", "b", "c"])),
    )
    // Then IDs, offsets and selection direction survive.
    expect(anchor.blockId).toBe("c")
    expect(focus.blockId).toBe("a")
    expect([selection.anchor, selection.head]).toEqual([18, 3])
  })

  test("preserves untouched multi-paragraph sources byte for byte", () => {
    // Given multiple paragraphs and Markdown spelling under one source ID.
    const blocks = [
      { id: "a", markdown: "## Heading\n\nSome __bold__ text.\n\nAnother paragraph." },
    ]
    const f = fixture(blocks)
    // When the native document is serialized without edits.
    const read = f.document.read(f.state.doc)
    // Then source spelling is not rewritten merely by mounting.
    expect(read.get("a")).toBe(blocks[0]?.markdown)
  })

  test("omits empty translation slots from the rendered document", () => {
    // Given empty translations between visible paragraphs.
    const f = fixture([
      { id: "a", markdown: "Alpha" },
      { id: "b", markdown: "" },
      { id: "c", markdown: "Charlie" },
    ])
    // When the article is loaded.
    const ranges = articleRanges(f.state.doc)
    // Then there is no placeholder paragraph for every missing translation.
    expect(ranges.map((range) => range.id)).toEqual(["a", "c"])
    expect(f.state.doc.childCount).toBe(2)
    expect(articlePosition(f.state.doc, { blockId: "b", offset: 0 }, ["a", "b", "c"])).toBe(7)
  })

  test("keeps ref shortcode tokens distinct after joining source paragraphs", () => {
    // Given independently prepared ref shortcodes (each originally numbered zero).
    const f = fixture([
      { id: "a", markdown: '[Alpha]({{< ref "/posts/alpha" >}})' },
      { id: "b", markdown: '[Bravo]({{< ref "/posts/bravo" >}})' },
    ])
    f.dispatch(f.state.tr.setSelection(TextSelection.create(f.state.doc, 8)))
    // When the paragraphs join.
    joinBackward(f.state, f.dispatch)
    // Then each link recovers its own original shortcode.
    expect(f.document.read(f.state.doc).get("a")).toBe(
      '[Alpha]({{< ref "/posts/alpha" >}})[Bravo]({{< ref "/posts/bravo" >}})',
    )
  })

  test("preserves image transports math and shortcode nodes after text edits", () => {
    // Given rendered rich content and a separate paragraph.
    const f = fixture([
      { id: "a", markdown: "Alpha" },
      { id: "b", markdown: '![Diagram](images/a.svg#wide "Caption")' },
      { id: "c", markdown: "$$\nx^2\n$$" },
      { id: "d", markdown: '{{< figure src="images/a.svg" caption="Example" >}}' },
    ])
    // When a neighboring paragraph changes.
    f.dispatch(f.state.tr.insertText("!", 6))
    // Then rich nodes and their exact original transport survive.
    expect([...f.document.read(f.state.doc)]).toEqual([
      ["a", "Alpha!"],
      ["b", '![Diagram](images/a.svg#wide "Caption")'],
      ["c", "$$\nx^2\n$$"],
      ["d", '{{< figure src="images/a.svg" caption="Example" >}}'],
    ])
    expect(f.state.doc.content.content.map((node) => node.type.name)).toEqual([
      "paragraph",
      "image",
      "mathBlock",
      "hugoShortcode",
    ])
  })
})

describe("published-page fidelity", () => {
  const pageExtensions = [
    StarterKit.configure({ undoRedo: false }),
    TableKit.configure({ table: { resizable: false, renderWrapper: false } }),
    articleIdentity(() => "a"),
  ]
  const pageSchema = getSchema(pageExtensions)
  const pageManager = new MarkdownManager({ extensions: resolveExtensions(pageExtensions) })
  const source = "첫 줄\n둘째 줄\n\n| 항목 | 값 |\n| --- | --- |\n| 폭 | 64-bit |"

  test("shows soft line breaks as spaces without rewriting untouched source", () => {
    // Given a block whose paragraph wraps onto two source lines and a GFM table.
    const document = new ArticleDocument(pageManager, pageSchema, transport)
    const doc = document.load([{ id: "a", markdown: source }])
    // Then the paragraph reads as one line, like Goldmark's HTML, and the table is a table.
    expect(doc.child(0).textContent).toBe("첫 줄 둘째 줄")
    expect(doc.child(1).type.name).toBe("table")
    // And an unedited block keeps its exact source.
    expect(document.read(doc).get("a")).toBe(source)
  })

  test("keeps an edited table as a Markdown table", () => {
    // Given the same block after a text edit in its first paragraph.
    const document = new ArticleDocument(pageManager, pageSchema, transport)
    const doc = document.load([{ id: "a", markdown: source }])
    const state = EditorState.create({ doc })
    const edited = state.apply(state.tr.insertText("!", 1))
    // When it is serialized again.
    const markdown = document.read(edited.doc).get("a") ?? ""
    // Then the table survives with its cells.
    expect(markdown).toContain("| 항목")
    expect(markdown).toContain("64-bit")
    expect(markdown.startsWith("!첫 줄 둘째 줄")).toBe(true)
  })
})
