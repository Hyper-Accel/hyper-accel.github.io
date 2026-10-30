import { type Extensions, Mark } from "@tiptap/core"
import { Paragraph } from "@tiptap/extension-paragraph"
import { TextStyle } from "./text-style"

export const INLINE_FORMATS = [
  { name: "highlight", tag: "mark", label: "형광펜" },
  { name: "superscript", tag: "sup", label: "위첨자" },
  { name: "subscript", tag: "sub", label: "아래첨자" },
  { name: "keyboard", tag: "kbd", label: "키보드 키" },
  { name: "small", tag: "small", label: "작게" },
] as const

/** Semantic presets, plus free font, size and colours (TextStyle) as in Naver's editor. */
export function textFormatExtensions(): Extensions {
  return [
    TextStyle,
    ...INLINE_FORMATS.map(({ name, tag }) =>
      Mark.create({
        name,
        priority: 110,
        ...(tag === "sup" ? { excludes: "subscript" } : {}),
        ...(tag === "sub" ? { excludes: "superscript" } : {}),
        parseHTML: () => [{ tag }],
        renderHTML: () => [tag, 0],
        markdownTokenizer: {
          name,
          level: "inline",
          start: (source) => source.indexOf(`<${tag}>`),
          tokenize(source, _tokens, lexer) {
            const match = new RegExp(`^<${tag}>([\\s\\S]*?)</${tag}>`).exec(source)
            if (!match) return undefined
            return {
              type: name,
              raw: match[0],
              tokens: lexer.inlineTokens(match[1] ?? ""),
            }
          },
        },
        parseMarkdown: (token, helpers) =>
          helpers.applyMark(name, helpers.parseInline(token.tokens ?? [])),
        renderMarkdown: (node, helpers) => `<${tag}>${helpers.renderChildren(node)}</${tag}>`,
      }),
    ),
  ]
}

export const ALIGNMENTS = ["left", "center", "right", "justify"] as const
export type Alignment = (typeof ALIGNMENTS)[number]

/** A paragraph's classes, written as a Goldmark block attribute line: {.lead .text-center}. */
const BLOCK_ATTRIBUTE = /\n\{((?:\.(?:lead|text-(?:center|right|justify))\s*)+)\}(?:\n|$)/
const BLOCK_ATTRIBUTE_SOURCE = BLOCK_ATTRIBUTE.source

function paragraphClasses(raw: string): { lead: boolean; align: Alignment | null } | null {
  const classes = BLOCK_ATTRIBUTE.exec(raw)?.[1]?.trim().split(/\s+/)
  if (!classes) return null
  const align = classes.find((name) => name.startsWith(".text-"))?.slice(6)
  return {
    lead: classes.includes(".lead"),
    align: align === "center" || align === "right" || align === "justify" ? align : null,
  }
}

export const ArticleParagraph = Paragraph.extend({
  addAttributes() {
    return {
      lead: {
        default: false,
        parseHTML: (element) => element.classList.contains("lead"),
        renderHTML: (attrs) => (attrs["lead"] ? { class: "lead" } : {}),
      },
      // Paragraph alignment (left is the default and is not written out).
      align: {
        default: null,
        parseHTML: (element) =>
          ALIGNMENTS.find(
            (align) => align !== "left" && element.classList.contains(`text-${align}`),
          ) ?? null,
        renderHTML: (attrs) =>
          typeof attrs["align"] === "string" && attrs["align"] !== "left"
            ? { class: `text-${attrs["align"]}` }
            : {},
      },
    }
  },
  markdownTokenizer: {
    name: "paragraph",
    level: "block",
    start: (source) => {
      const match = new RegExp(`(?:^|\\n\\n)([^\\n][\\s\\S]*?)${BLOCK_ATTRIBUTE_SOURCE}`).exec(
        source,
      )
      return match?.index ?? -1
    },
    tokenize(source, _tokens, lexer) {
      const match = new RegExp(`^((?:(?!\\n\\n)[\\s\\S])+?)${BLOCK_ATTRIBUTE_SOURCE}`).exec(source)
      if (!match || /^(?:#|>|[-*] |```|~~~|\{\{)/.test(match[1] ?? "")) return undefined
      return {
        type: "paragraph",
        raw: match[0],
        tokens: lexer.inlineTokens(match[1] ?? ""),
      }
    },
  },
  markdownTokenName: "paragraph",
  parseMarkdown(token, helpers) {
    const classes = paragraphClasses(token.raw ?? "")
    if (!classes) return Paragraph.config.parseMarkdown?.call(this, token, helpers) ?? []
    return {
      type: "paragraph",
      attrs: classes,
      content: helpers.parseInline(token.tokens ?? []),
    }
  },
  renderMarkdown(node, helpers, context) {
    const align: unknown = node.attrs?.["align"]
    const classes = [
      ...(node.attrs?.["lead"] ? [".lead"] : []),
      ...(typeof align === "string" && align !== "left" ? [`.text-${align}`] : []),
    ]
    return classes.length > 0
      ? `${helpers.renderChildren(node.content ?? [])}\n{${classes.join(" ")}}`
      : (Paragraph.config.renderMarkdown?.call(this, node, helpers, context) ?? "")
  },
})
