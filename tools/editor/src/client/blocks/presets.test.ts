import { describe, expect, test } from "bun:test"
import { getSchema, resolveExtensions } from "@tiptap/core"
import { MarkdownManager } from "@tiptap/markdown"
import { EditorState, Plugin } from "@tiptap/pm/state"
import StarterKit from "@tiptap/starter-kit"
import { youtubeId } from "../../document/youtube"
import { ArticleDocument } from "../composer/article-document"
import { articleIdentity, createArticleIdentityPlugin } from "../composer/article-identity"
import { createMarkdownTransport } from "../markdown"
import { HighlightedCodeBlock } from "./code-highlight"
import { normalizeFootnotes } from "./footnote-order"
import { footnoteOrderPlugin } from "./footnotes"
import { createBlockExtensions } from "./index"
import { ArticleParagraph, INLINE_FORMATS, textFormatExtensions } from "./text-formats"

const extensions = [
  StarterKit.configure({ paragraph: false }),
  ArticleParagraph,
  ...textFormatExtensions(),
  ...createBlockExtensions(),
  articleIdentity(() => "a"),
]
const manager = new MarkdownManager({ extensions: resolveExtensions(extensions) })
const schema = getSchema(extensions)
const transport = createMarkdownTransport(
  (s) => s,
  (s) => s,
)

describe("semantic text presets", () => {
  for (const format of INLINE_FORMATS) {
    test(`round trips nested ${format.tag} when parsed from HTML`, () => {
      // Given a preset containing Markdown emphasis.
      const source = `앞 <${format.tag}>**본문**</${format.tag}> 뒤`
      // When it is parsed and serialized.
      const doc = manager.parse(source)
      // Then the semantic mark and nested emphasis survive.
      expect(doc.content?.[0]?.content?.[1]?.marks).toContainEqual({ type: format.name })
      expect(manager.serialize(doc)).toBe(source)
    })
  }
  test("keeps lead on an edited paragraph when serialized", () => {
    // Given a Goldmark lead paragraph.
    const doc = schema.nodeFromJSON(manager.parse("도입 문단\n{.lead}\n\n일반 문단"))
    // When its text changes.
    const edited = EditorState.create({ doc }).apply(
      EditorState.create({ doc }).tr.insertText("새 ", 1),
    )
    // Then the class remains in Goldmark syntax.
    expect(edited.doc.child(0).attrs["lead"]).toBe(true)
    expect(manager.serialize(edited.doc.toJSON())).toBe("새 도입 문단\n{.lead}\n\n일반 문단")
  })
  test("round trips free font, size and colours as one styled span", () => {
    const source =
      "앞 <span style=\"font-family: 'Nanum Myeongjo', serif; font-size: 24px; color: #ff6b6b\">**큰 글씨**</span> 뒤"
    const doc = manager.parse(source)
    expect(doc.content?.[0]?.content?.[1]?.marks).toContainEqual({
      type: "textStyle",
      attrs: { fontFamily: "'Nanum Myeongjo', serif", fontSize: "24px", color: "#ff6b6b" },
    })
    expect(manager.serialize(doc)).toBe(source)
  })
  test("keeps neighbouring spans with different styles apart", () => {
    const source =
      '<span style="color: #ff6b6b">빨강</span><span style="color: #4dabf7">파랑</span>'
    expect(manager.serialize(manager.parse(source))).toBe(source)
  })
  test("leaves a span with any other CSS as it was written", () => {
    const source = '<span style="color: red; position: fixed">위험</span>'
    const doc = manager.parse(source)
    expect(JSON.stringify(doc)).not.toContain("textStyle")
  })
  test("round trips paragraph alignment as a Goldmark block attribute", () => {
    for (const source of [
      "가운데 문단\n{.text-center}",
      "오른쪽 문단\n{.text-right}",
      "리드 문단\n{.lead .text-center}",
    ]) {
      const doc = manager.parse(`${source}\n\n일반 문단`)
      expect(manager.serialize(doc)).toBe(`${source}\n\n일반 문단`)
    }
    const doc = manager.parse("리드 문단\n{.lead .text-justify}")
    expect(doc.content?.[0]?.attrs).toMatchObject({ lead: true, align: "justify" })
  })
  test("keeps the code fence's language with the highlighted code block", () => {
    const highlighted = new MarkdownManager({
      extensions: resolveExtensions([
        StarterKit.configure({ paragraph: false, codeBlock: false }),
        ArticleParagraph,
        HighlightedCodeBlock,
      ]),
    })
    for (const source of ["```c\nint main(void) { return 0; }\n```", "```python\nprint('hi')\n```"])
      expect(highlighted.serialize(highlighted.parse(source))).toBe(source)
  })
  test("keeps images as blocks when parsing ordinary paragraphs", () => {
    // Given a standalone Markdown image.
    const source = "![alt](images/a.svg)"
    // When the extended paragraph parser runs.
    const doc = manager.parse(source)
    // Then the inherited image unwrapping behavior remains.
    expect(doc.content?.[0]?.type).toBe("image")
  })
})

describe("document footnotes", () => {
  test("keeps continuation paragraphs inside a footnote when editing its definition", () => {
    // Given one definition with wrapped text and a second indented paragraph.
    const source = "본문[^a]\n\n[^a]: 첫 줄\n    이어지는 줄\n\n    둘째 **문단**\n\n다음 본문"
    const doc = schema.nodeFromJSON(manager.parse(source))
    // When the parser creates the definition.
    const definition = doc.content.content.find((node) => node.type.name === "footnoteDefinition")
    // Then both paragraphs belong to that definition, not the article body.
    expect(definition?.childCount).toBe(2)
    expect(definition?.textContent).toBe("첫 줄\n이어지는 줄둘째 문단")
    expect(doc.lastChild?.textContent).toBe("다음 본문")
    expect(manager.serialize(doc.toJSON())).toContain("\n    둘째 **문단**")
  })
  test("converges with article identities when inserting a new endnote", () => {
    // Given the production identity and footnote normalizers.
    let appended = 0
    const document = new ArticleDocument(manager, schema, transport)
    const state = EditorState.create({
      doc: document.load([{ id: "a", markdown: "Alpha" }]),
      plugins: [
        new Plugin({
          filterTransaction() {
            if (++appended > 12) throw new Error("Footnote normalization failed to converge")
            return true
          },
        }),
        createArticleIdentityPlugin(() => "a"),
        footnoteOrderPlugin(),
      ],
    })
    // When a reference and its endnote are inserted in one transaction.
    const tr = state.tr.insert(6, schema.node("footnoteReference", { label: "1" }))
    tr.insert(
      tr.doc.content.size,
      schema.node("footnoteSection", null, [
        schema.node("footnoteDefinition", { label: "1" }, [
          schema.node("paragraph", null, schema.text("Note")),
        ]),
      ]),
    )
    const next = state.applyTransaction(tr).state
    // Then both plugins reach a stable document with the source identity intact.
    expect(next.doc.lastChild?.firstChild?.attrs["articleId"]).toBe("a")
    expect(document.read(next.doc).get("a")).toBe("Alpha[^1]\n\n[^1]: Note")
  })
  test("numbers repeated named references locally when definitions span source IDs", () => {
    // Given two source blocks with named references and a definition.
    const document = new ArticleDocument(manager, schema, transport)
    const blocks = [
      { id: "a", markdown: "참조[^note]와 반복[^note]." },
      { id: "b", markdown: "[^note]: 각주 **내용**" },
    ]
    // When the continuous document is loaded.
    const doc = document.load(blocks)
    // Then definitions are one end section and untouched source bytes survive.
    expect(doc.lastChild?.type.name).toBe("footnoteSection")
    expect(doc.firstChild?.child(1).attrs["number"]).toBe(1)
    expect([...document.read(doc)]).toEqual(blocks.map((b) => [b.id, b.markdown]))
  })
  test("edits a definition without dropping its reference when serialized", () => {
    // Given references and definitions under the same source identity.
    const document = new ArticleDocument(manager, schema, transport)
    const doc = document.load([{ id: "a", markdown: "본문[^1]\n\n[^1]: 설명" }])
    let at = 0
    doc.descendants((node, pos) => {
      if (node.type.name === "footnoteDefinition") at = pos + 2
    })
    // When the footnote text is edited.
    const state = EditorState.create({ doc })
    const edited = state.apply(state.tr.insertText("새 ", at))
    // Then both Markdown constructs remain.
    expect(document.read(edited.doc).get("a")).toBe("본문[^1]\n\n[^1]: 새 설명")
  })
  test("keeps numbering independent when another language has different reference order", () => {
    // Given independent Korean and English documents.
    const ko = schema.nodeFromJSON(manager.parse("한국어[^b]와[^a]\n\n[^a]: A\n\n[^b]: B"))
    const en = schema.nodeFromJSON(manager.parse("English[^a]\n\n[^a]: EN"))
    // When each document is normalized.
    const docs = [normalizeFootnotes(ko), normalizeFootnotes(en)]
    // Then each starts at one using its own reference order.
    expect(docs.map((d) => d.firstChild?.child(1).attrs["number"])).toEqual([1, 1])
    expect(docs[0]?.lastChild?.firstChild?.attrs["label"]).toBe("b")
    expect(docs[1]?.lastChild?.firstChild?.textContent).toBe("EN")
  })
})

describe("YouTube shortcode", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://youtube.com/shorts/dQw4w9WgXcQ",
    "https://youtube.com/embed/dQw4w9WgXcQ",
  ]) {
    test(`extracts a video ID when given ${url}`, () => {
      // Given a supported URL. When parsed. Then it yields the shortcode ID.
      expect(youtubeId(url)).toBe("dQw4w9WgXcQ")
    })
  }
  test("rejects unrelated hosts and executable URLs when parsing video input", () => {
    // Given unsafe or unrelated addresses. When parsed. Then none becomes an embed.
    expect(
      [
        "https://youtube.com.evil/watch?v=dQw4w9WgXcQ",
        "javascript:alert(1)",
        "https://youtu.be/short",
      ].map(youtubeId),
    ).toEqual([null, null, null])
  })
  test("keeps a YouTube shortcode as a video when round tripped", () => {
    // Given Hugo's built-in positional shortcode.
    const source = "{{< youtube dQw4w9WgXcQ >}}"
    // When parsed by the block system.
    const doc = manager.parse(source)
    // Then a video, not an unknown shortcode, is saved without loss.
    expect(doc.content?.[0]?.type).toBe("youtube")
    expect(manager.serialize(doc)).toBe(source)
  })
})
