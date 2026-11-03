import type { MarkdownToken, MarkdownTokenizer } from "@tiptap/core"
import { youtubeId } from "../../document/youtube"
import { SHORTCODES } from "../../shared/onsite/blocks"
import {
  type AlertType,
  findLineStart,
  type ImageModel,
  parseAlertHead,
  parseImageLines,
  parseShortcodeTag,
  type ShortcodeDelimiter,
  type ShortcodeParam,
  scanShortcodeBlock,
  stripQuotePrefix,
} from "../shortcode"

/** Every Hugo shortcode becomes a `hugoShortcode` token; `block` tells the typed nodes apart. */
export const SHORTCODE_TOKEN = "hugoShortcode"

export type ShortcodeBlockKind =
  | "pair"
  | "slides"
  | "compare"
  | "steps"
  | "tabs"
  | "youtube"
  | "unknown"

export interface TabToken {
  readonly params: readonly ShortcodeParam[]
  readonly delimiter: ShortcodeDelimiter
  readonly raw: string
  readonly tokens: MarkdownToken[]
}

export interface ShortcodeToken extends MarkdownToken {
  readonly block: ShortcodeBlockKind
  readonly images?: readonly ImageModel[]
  readonly params?: readonly ShortcodeParam[]
  readonly delimiter?: ShortcodeDelimiter
  readonly tabs?: readonly TabToken[]
}

export interface AlertToken extends MarkdownToken {
  readonly alertType: AlertType
  readonly title: string | null
}

export interface MathToken extends MarkdownToken {
  readonly source: string
  readonly display: boolean
}

type BlockLexer = Parameters<MarkdownTokenizer["tokenize"]>[2]

export function shortcodeBlockKind(token: MarkdownToken): ShortcodeBlockKind {
  const block: unknown = token["block"]
  return block === "pair" ||
    block === "slides" ||
    block === "compare" ||
    block === "steps" ||
    block === "tabs" ||
    block === "youtube"
    ? block
    : "unknown"
}

function isLoneOpeningTag(line: string): boolean {
  if (!line.trimStart().startsWith("{{")) {
    return false
  }
  const tag = parseShortcodeTag(line)
  return tag !== null && !tag.closing
}

function scanTabs(inner: string, lexer: BlockLexer): TabToken[] | null {
  const tabs: TabToken[] = []
  let rest = inner
  for (;;) {
    rest = rest.replace(/^(?:[ \t]*\n)+/, "")
    if (rest.trim() === "") {
      break
    }
    const block = scanShortcodeBlock(rest)
    if (block?.open.name !== "tab" || !block.close) {
      return null
    }
    tabs.push({
      params: block.open.params,
      delimiter: block.open.delimiter,
      raw: block.raw,
      tokens: lexer.blockTokens(block.inner),
    })
    rest = rest.slice(block.raw.length)
  }
  return tabs.length > 0 ? tabs : null
}

export const shortcodeTokenizer: MarkdownTokenizer = {
  name: SHORTCODE_TOKEN,
  level: "block",
  start: (source) => (source.includes("{{") ? findLineStart(source, isLoneOpeningTag) : -1),
  tokenize: (source, _tokens, lexer): ShortcodeToken | undefined => {
    const block = scanShortcodeBlock(source)
    if (!block) {
      return undefined
    }
    const base = {
      type: SHORTCODE_TOKEN,
      raw: block.raw,
      delimiter: block.open.delimiter,
      params: block.open.params,
    }
    const video = /^\{\{<\s*youtube\s+["']?([\w-]{11})["']?\s*>\}\}$/.exec(block.raw)
    if (video && youtubeId(video[1] ?? "")) {
      return { ...base, block: "youtube", videoId: video[1] }
    }
    if (block.close) {
      switch (block.open.name) {
        case "pair":
        case "slides": {
          const { minImages, maxImages } = SHORTCODES[block.open.name]
          const images = parseImageLines(block.inner)
          if (images && images.length >= minImages && images.length <= maxImages) {
            return { ...base, block: block.open.name, images }
          }
          break
        }
        case "compare": {
          const images = parseImageLines(block.inner)
          if (images && images.length === 2) {
            return { ...base, block: "compare", images }
          }
          break
        }
        case "steps":
          return { ...base, block: "steps", tokens: lexer.blockTokens(block.inner) }
        case "tabs": {
          const tabs = scanTabs(block.inner, lexer)
          if (tabs) {
            return { ...base, block: "tabs", tabs }
          }
          break
        }
        default:
          break
      }
    }
    return { type: SHORTCODE_TOKEN, block: "unknown", raw: block.raw }
  },
}

let measuringAlertExtent = false

function alertExtent(source: string, firstLine: string, lexer: BlockLexer): string {
  const chunk = /^(?:[^\n]*\S[^\n]*(?:\n|$))+/.exec(source)?.[0] ?? firstLine
  measuringAlertExtent = true
  try {
    const quote = lexer.blockTokens(chunk)[0]
    const raw =
      quote?.type === "blockquote" && typeof quote.raw === "string" ? quote.raw : firstLine
    return raw.replace(/\n+$/, "")
  } finally {
    measuringAlertExtent = false
  }
}

export const alertTokenizer: MarkdownTokenizer = {
  name: "alert",
  level: "block",
  start: (source) =>
    source.includes("[!") ? findLineStart(source, (line) => parseAlertHead(line) !== null) : -1,
  tokenize: (source, _tokens, lexer): AlertToken | undefined => {
    if (measuringAlertExtent) {
      return undefined
    }
    const firstLineEnd = source.indexOf("\n")
    const firstLine = firstLineEnd < 0 ? source : source.slice(0, firstLineEnd)
    const head = parseAlertHead(firstLine)
    if (!head) {
      return undefined
    }
    const raw = alertExtent(source, firstLine, lexer)
    const body = raw.split("\n").slice(1).map(stripQuotePrefix).join("\n")
    return {
      type: "alert",
      raw,
      alertType: head.type,
      title: head.title,
      tokens: body.trim() === "" ? [] : lexer.blockTokens(body),
    }
  },
}

const MATH_BLOCK_SINGLE = /^[ \t]*\$\$([^\n$]*?)\$\$[ \t]*(?:\n|$)/
const MATH_BLOCK_OPEN = /^[ \t]*\$\$([^\n$]*)(?:\n|$)/
const MATH_BLOCK_CLOSE = /^[ \t]*\$\$[ \t]*$/

export const mathBlockTokenizer: MarkdownTokenizer = {
  name: "mathBlock",
  level: "block",
  start: (source) =>
    source.includes("$$") ? findLineStart(source, (line) => /^[ \t]*\$\$/.test(line)) : -1,
  tokenize: (source): MathToken | undefined => {
    const single = MATH_BLOCK_SINGLE.exec(source)
    if (single) {
      const raw = single[0].replace(/\n$/, "")
      return { type: "mathBlock", raw, source: (single[1] ?? "").trim(), display: true }
    }
    const open = MATH_BLOCK_OPEN.exec(source)
    if (!open) {
      return undefined
    }
    const lines = source.split("\n")
    for (let index = 1; index < lines.length; index += 1) {
      if (MATH_BLOCK_CLOSE.test(lines[index] ?? "")) {
        const raw = lines.slice(0, index + 1).join("\n")
        const inner = [open[1]?.trim() ?? "", ...lines.slice(1, index)].filter(
          (line, position) => position > 0 || line !== "",
        )
        return { type: "mathBlock", raw, source: inner.join("\n"), display: true }
      }
    }
    return undefined
  },
}

const MATH_INLINE_DISPLAY = /^\$\$((?:\\.|[^$\n])+?)\$\$/
const MATH_INLINE = /^\$(?!\s)((?:\\.|[^$\n])+?)(?<!\s)\$(?!\d)/

export const mathInlineTokenizer: MarkdownTokenizer = {
  name: "mathInline",
  level: "inline",
  start: (source) => source.indexOf("$"),
  tokenize: (source): MathToken | undefined => {
    const display = MATH_INLINE_DISPLAY.exec(source)
    if (display) {
      return { type: "mathInline", raw: display[0], source: display[1] ?? "", display: true }
    }
    const inline = MATH_INLINE.exec(source)
    if (inline) {
      return { type: "mathInline", raw: inline[0], source: inline[1] ?? "", display: false }
    }
    return undefined
  },
}
