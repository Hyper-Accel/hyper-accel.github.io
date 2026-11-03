import type { JSONContent } from "@tiptap/core"
import type { MarkdownManager } from "@tiptap/markdown"
import { Fragment, type Node as PMNode, type Schema } from "@tiptap/pm/model"
import type { PostBlock } from "../../shared/onsite/document"
import type { DraftCursor } from "../../shared/onsite/drafts"
import { normalizeFootnotes } from "../blocks/footnote-order"
import type { MarkdownTransport } from "../markdown"
import { ARTICLE_ID, articleRanges } from "./article-identity"

interface OriginalBlock {
  readonly markdown: string
  readonly content: Fragment
}

export class ArticleDocument {
  private readonly originals = new Map<string, OriginalBlock>()
  private readonly shortcodes = new Map<string, string>()

  constructor(
    private readonly markdown: MarkdownManager,
    private readonly schema: Schema,
    private readonly transport: MarkdownTransport,
  ) {}

  load(blocks: readonly PostBlock[]): PMNode {
    this.originals.clear()
    this.shortcodes.clear()
    const nodes: PMNode[] = []
    for (const block of blocks) {
      const prepared = this.transport.prepare(block.markdown)
      let source = prepared.markdown
      // prepare() numbers ref tokens per invocation. Namespace them across the document
      // before parsing, including when paragraphs from different IDs are later joined.
      for (const [token, shortcode] of [...prepared.shortcodes].sort(
        ([left], [right]) => right.length - left.length,
      )) {
        const unique = `${token}/article-${block.id}`
        source = source.replaceAll(token, unique)
        this.shortcodes.set(unique, shortcode)
      }
      const parsed = this.markdown.parse(source)
      const content = block.markdown.trim() === "" ? [] : (parsed.content ?? [])
      const tagged = content.map((node) => this.schema.nodeFromJSON(this.identify(node, block.id)))
      this.originals.set(block.id, {
        markdown: block.markdown,
        content: Fragment.fromArray(tagged),
      })
      nodes.push(...tagged)
    }
    const first = blocks[0]
    if (nodes.length === 0 && first) nodes.push(this.empty(first.id))
    const doc = normalizeFootnotes(this.schema.topNodeType.createChecked(null, nodes))
    for (const [id, content] of this.contents(doc)) {
      const original = this.originals.get(id)
      if (original) this.originals.set(id, { ...original, content })
    }
    return doc
  }

  private identify(node: JSONContent, id: string, code = false): JSONContent {
    if (node.type === "text") {
      // Markdown soft line breaks render as spaces on the published page (Hugo/Goldmark).
      const literal = code || node.marks?.some((mark) => mark.type === "code")
      return literal || !node.text?.includes("\n")
        ? node
        : { ...node, text: node.text.replace(/[ \t]*\n[ \t]*/g, " ") }
    }
    const inCode = code || node.type === "codeBlock"
    return {
      ...node,
      attrs: { ...node.attrs, [ARTICLE_ID]: id },
      ...(node.content
        ? { content: node.content.map((child) => this.identify(child, id, inCode)) }
        : {}),
    }
  }

  empty(id: string): PMNode {
    return this.schema.node("paragraph", { [ARTICLE_ID]: id })
  }

  read(doc: PMNode): ReadonlyMap<string, string> {
    const result = new Map<string, string>()
    for (const [id, content] of this.contents(doc)) {
      const original = this.originals.get(id)
      const source = original?.content.eq(content)
        ? original.markdown
        : this.transport.restore(
            this.markdown.serialize(this.schema.topNodeType.create(null, content).toJSON()),
            this.shortcodes,
          )
      result.set(id, source)
    }
    return result
  }

  private contents(doc: PMNode): ReadonlyMap<string, Fragment> {
    const grouped = new Map<string, PMNode[]>()
    for (const range of articleRanges(doc)) {
      const nodes = grouped.get(range.id) ?? []
      nodes.push(...range.nodes)
      grouped.set(range.id, nodes)
    }
    return new Map([...grouped].map(([id, nodes]) => [id, Fragment.fromArray(nodes)]))
  }
}

/** Offsets use the existing per-source-block ProseMirror position convention. */
export function articlePoint(doc: PMNode, position: number): DraftCursor["anchor"] | null {
  const ranges = articleRanges(doc)
  const range =
    ranges.find((entry) => position >= entry.from && position < entry.to) ?? ranges.at(-1)
  return range ? { blockId: range.id, offset: position - range.from } : null
}

export function articlePosition(
  doc: PMNode,
  point: DraftCursor["anchor"],
  order: readonly string[],
): number {
  const ranges = articleRanges(doc)
  const range = ranges.find((entry) => entry.id === point.blockId)
  if (range) return range.from + Math.max(0, Math.min(range.to - range.from, point.offset))
  const index = order.indexOf(point.blockId)
  const next = ranges.find((entry) => order.indexOf(entry.id) > index)
  return next?.from ?? doc.content.size
}
