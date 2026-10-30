// Pure Markdown/Hugo syntax helpers for the on-site block editor. No DOM, no Tiptap.
// Syntax follows docs/editor/onsite-contracts.md and src/shared/onsite/blocks.ts.
import {
  ALERT_TYPES,
  IMAGE_PRESET_ALIASES,
  IMAGE_PRESETS,
  type ImagePreset,
  SHORTCODES,
} from "../shared/onsite/blocks"

export type AlertType = (typeof ALERT_TYPES)[number]
export type ShortcodeDelimiter = "<" | "%"
export type ParamQuote = '"' | "'" | "`" | null

export interface ShortcodeParam {
  /** `null` for positional parameters such as `{{< ref "/posts/x" >}}`. */
  readonly name: string | null
  readonly value: string
  readonly quote: ParamQuote
}

export interface ShortcodeTag {
  readonly name: string
  readonly closing: boolean
  readonly selfClosing: boolean
  readonly delimiter: ShortcodeDelimiter
  readonly params: readonly ShortcodeParam[]
  readonly raw: string
}

export interface ShortcodeBlock {
  readonly open: ShortcodeTag
  /** `null` for unpaired or self-closing shortcodes. */
  readonly close: ShortcodeTag | null
  /** Lines between the opening and closing tag, without the surrounding newlines. */
  readonly inner: string
  /** Exact source from the opening tag to the end of the closing tag. */
  readonly raw: string
}

export interface ImageModel {
  readonly src: string
  readonly alt: string
  readonly title: string | null
  readonly preset: ImagePreset
}

export interface AlertHead {
  readonly type: AlertType
  readonly title: string | null
}

const TAG_START = /^\{\{([<%])\s*(\/?)([A-Za-z][A-Za-z0-9_.-]*)/
const IMAGE_LINE =
  /^!\[((?:\\[\s\S]|[^\]\\])*)\]\(\s*(<[^<>\n]*>|[^\s()<>]+)(?:\s+("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\((?:\\[\s\S]|[^()\\])*\)))?\s*\)$/
const ALERT_HEAD = /^ {0,3}> ?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]+(.*?))?[ \t]*$/
const QUOTE_PREFIX = /^ {0,3}> ?/

export const ALERT_LABELS: Readonly<Record<AlertType, string>> = {
  NOTE: "참고",
  TIP: "팁",
  IMPORTANT: "중요",
  WARNING: "주의",
  CAUTION: "경고",
}

export const PRESET_LABELS: Readonly<Record<ImagePreset, string>> = {
  body: "본문",
  wide: "넓게",
  "side-left": "왼쪽 옆",
  "side-right": "오른쪽 옆",
}

export const IMAGE_PRESET_ORDER: readonly ImagePreset[] = [
  "body",
  "wide",
  "side-left",
  "side-right",
]

export function isImagePreset(value: unknown): value is ImagePreset {
  return typeof value === "string" && Object.hasOwn(IMAGE_PRESETS, value)
}

export function isAlertType(value: unknown): value is AlertType {
  return typeof value === "string" && (ALERT_TYPES as readonly string[]).includes(value)
}

function isQuote(char: string): char is '"' | "'" | "`" {
  return char === '"' || char === "'" || char === "`"
}

function readQuoted(body: string, start: number): { value: string; end: number } | null {
  const quote = body[start]
  if (!quote || !isQuote(quote)) {
    return null
  }
  let value = ""
  for (let index = start + 1; index < body.length; index += 1) {
    const char = body[index] ?? ""
    if (char === quote) {
      return { value, end: index + 1 }
    }
    if (char === "\\" && quote !== "`") {
      const next = body[index + 1]
      if (next === quote || next === "\\") {
        value += next
        index += 1
        continue
      }
    }
    value += char
  }
  return null
}

function parseParams(body: string): ShortcodeParam[] | null {
  const params: ShortcodeParam[] = []
  let index = 0
  while (index < body.length) {
    const char = body[index] ?? ""
    if (/\s/.test(char)) {
      index += 1
      continue
    }
    if (isQuote(char)) {
      const quoted = readQuoted(body, index)
      if (!quoted) {
        return null
      }
      params.push({ name: null, value: quoted.value, quote: char })
      index = quoted.end
      continue
    }
    let end = index
    while (end < body.length && !/[\s=]/.test(body[end] ?? "")) {
      end += 1
    }
    if (end === index) {
      return null
    }
    const word = body.slice(index, end)
    if (body[end] === "=") {
      const valueStart = end + 1
      const valueChar = body[valueStart] ?? ""
      if (isQuote(valueChar)) {
        const quoted = readQuoted(body, valueStart)
        if (!quoted) {
          return null
        }
        params.push({ name: word, value: quoted.value, quote: valueChar })
        index = quoted.end
        continue
      }
      let valueEnd = valueStart
      while (valueEnd < body.length && !/\s/.test(body[valueEnd] ?? "")) {
        valueEnd += 1
      }
      if (valueEnd === valueStart) {
        return null
      }
      params.push({ name: word, value: body.slice(valueStart, valueEnd), quote: null })
      index = valueEnd
      continue
    }
    params.push({ name: null, value: word, quote: null })
    index = end
  }
  return params
}

/** Parses one line that consists of exactly one Hugo shortcode tag. */
export function parseShortcodeTag(line: string): ShortcodeTag | null {
  const text = line.trim()
  const start = TAG_START.exec(text)
  if (!start) {
    return null
  }
  const delimiter: ShortcodeDelimiter = start[1] === "%" ? "%" : "<"
  const end = delimiter === "<" ? ">}}" : "%}}"
  if (!text.endsWith(end) || text.length < start[0].length + end.length) {
    return null
  }
  let body = text.slice(start[0].length, text.length - end.length)
  if (body.length > 0 && !/^[\s/]/.test(body)) {
    return null
  }
  let selfClosing = false
  const trimmedBody = body.trimEnd()
  if (trimmedBody.endsWith("/")) {
    selfClosing = true
    body = trimmedBody.slice(0, -1)
  }
  const params = parseParams(body)
  if (!params) {
    return null
  }
  const closing = start[2] === "/"
  if (closing && (params.length > 0 || selfClosing)) {
    return null
  }
  return { name: start[3] ?? "", closing, selfClosing, delimiter, params, raw: line }
}

function quoteDouble(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function quoteValue(value: string, quote: ParamQuote): string {
  if (quote === null) {
    return value.length > 0 && /^[^\s"'`=]+$/.test(value) ? value : quoteDouble(value)
  }
  if (quote === "`") {
    return value.includes("`") ? quoteDouble(value) : `\`${value}\``
  }
  if (quote === "'") {
    return value.includes("'") ? quoteDouble(value) : `'${value}'`
  }
  return quoteDouble(value)
}

export function serializeParam(param: ShortcodeParam): string {
  const value = quoteValue(param.value, param.quote)
  return param.name === null ? value : `${param.name}=${value}`
}

export function serializeShortcodeTag(tag: {
  readonly name: string
  readonly params?: readonly ShortcodeParam[]
  readonly closing?: boolean
  readonly selfClosing?: boolean
  readonly delimiter?: ShortcodeDelimiter
}): string {
  const delimiter = tag.delimiter ?? "<"
  const parts = [tag.closing ? `/${tag.name}` : tag.name, ...(tag.params ?? []).map(serializeParam)]
  if (tag.selfClosing) {
    parts.push("/")
  }
  return `{{${delimiter} ${parts.join(" ")} ${delimiter === "<" ? ">" : "%"}}}`
}

/**
 * Matches a shortcode block at the start of `source`: a lone tag line, optionally paired
 * with its closing tag (same-name nesting is counted). Unpaired tags are one-line blocks.
 */
export function scanShortcodeBlock(source: string): ShortcodeBlock | null {
  const firstLineEnd = source.indexOf("\n")
  const firstLine = firstLineEnd < 0 ? source : source.slice(0, firstLineEnd)
  const open = parseShortcodeTag(firstLine)
  if (!open || open.closing) {
    return null
  }
  const single: ShortcodeBlock = { open, close: null, inner: "", raw: firstLine }
  if (open.selfClosing || firstLineEnd < 0) {
    return single
  }
  let depth = 1
  let lineStart = firstLineEnd + 1
  while (lineStart <= source.length) {
    const lineEnd = source.indexOf("\n", lineStart)
    const line = lineEnd < 0 ? source.slice(lineStart) : source.slice(lineStart, lineEnd)
    const tag = parseShortcodeTag(line)
    if (tag && tag.name === open.name) {
      if (tag.closing) {
        depth -= 1
        if (depth === 0) {
          const inner = source.slice(firstLineEnd + 1, Math.max(firstLineEnd + 1, lineStart - 1))
          const end = lineEnd < 0 ? source.length : lineEnd
          return { open, close: tag, inner, raw: source.slice(0, end) }
        }
      } else if (!tag.selfClosing) {
        depth += 1
      }
    }
    if (lineEnd < 0) {
      break
    }
    lineStart = lineEnd + 1
  }
  return single
}

export function getParam(params: readonly ShortcodeParam[], name: string): string | null {
  const found = params.find((param) => param.name === name)
  return found ? found.value : null
}

export function setParam(
  params: readonly ShortcodeParam[],
  name: string,
  value: string,
): ShortcodeParam[] {
  const index = params.findIndex((param) => param.name === name)
  if (index < 0) {
    return [...params, { name, value, quote: '"' }]
  }
  return params.map((param, position) =>
    position === index ? { name, value, quote: param.quote ?? '"' } : param,
  )
}

export function removeParam(params: readonly ShortcodeParam[], name: string): ShortcodeParam[] {
  return params.filter((param) => param.name !== name)
}

export function presetFromFragment(fragment: string): ImagePreset | null {
  const aliases: Readonly<Record<string, string>> = IMAGE_PRESET_ALIASES
  const canonical = aliases[fragment] ?? fragment
  for (const preset of IMAGE_PRESET_ORDER) {
    const value: string = IMAGE_PRESETS[preset]
    if (value !== "" && value === canonical) {
      return preset
    }
  }
  return null
}

export function splitImageDestination(destination: string): {
  readonly src: string
  readonly preset: ImagePreset
} {
  const hash = destination.lastIndexOf("#")
  if (hash < 0) {
    return { src: destination, preset: "body" }
  }
  const preset = presetFromFragment(destination.slice(hash))
  return preset ? { src: destination.slice(0, hash), preset } : { src: destination, preset: "body" }
}

function unescapeBrackets(text: string): string {
  return text.replace(/\\([[\]])/g, "$1")
}

function unescapeTitle(text: string): string {
  return text.replace(/\\(["'()\\])/g, "$1")
}

/** Parses one standalone Markdown image such as `![alt](images/a.webp#wide "caption")`. */
export function parseImageMarkdown(text: string): ImageModel | null {
  const match = IMAGE_LINE.exec(text.trim())
  if (!match) {
    return null
  }
  let destination = match[2] ?? ""
  if (destination.startsWith("<")) {
    destination = destination.slice(1, -1)
  }
  const rawTitle = match[3]
  const title = rawTitle ? unescapeTitle(rawTitle.slice(1, -1)) : null
  const { src, preset } = splitImageDestination(destination)
  return { src, alt: unescapeBrackets(match[1] ?? ""), title: title || null, preset }
}

export function serializeImageMarkdown(image: ImageModel): string {
  const alt = image.alt.replace(/([[\]])/g, "\\$1")
  const base = image.preset === "body" ? image.src : (image.src.split("#")[0] ?? image.src)
  const destination = `${base}${IMAGE_PRESETS[image.preset]}`
  const title = image.title ? ` "${image.title.replace(/(["\\])/g, "\\$1")}"` : ""
  return `![${alt}](${destination}${title})`
}

export function parseImageLines(inner: string): ImageModel[] | null {
  const images: ImageModel[] = []
  for (const line of inner.split("\n")) {
    if (line.trim() === "") {
      continue
    }
    const image = parseImageMarkdown(line)
    if (!image) {
      return null
    }
    images.push(image)
  }
  return images
}

export function serializeImageBlock(
  name: string,
  params: readonly ShortcodeParam[],
  images: readonly ImageModel[],
  delimiter: ShortcodeDelimiter = "<",
): string {
  return [
    serializeShortcodeTag({ name, params, delimiter }),
    ...images.map(serializeImageMarkdown),
    serializeShortcodeTag({ name, closing: true, delimiter }),
  ].join("\n")
}

export function serializeContainerBlock(
  name: string,
  params: readonly ShortcodeParam[],
  content: string,
  delimiter: ShortcodeDelimiter = "<",
): string {
  const open = serializeShortcodeTag({ name, params, delimiter })
  const close = serializeShortcodeTag({ name, closing: true, delimiter })
  return content === "" ? `${open}\n${close}` : `${open}\n${content}\n${close}`
}

export function clampCompareStart(value: number): number {
  const { minStart, maxStart, defaultStart } = SHORTCODES.compare
  if (!Number.isFinite(value)) {
    return defaultStart
  }
  return Math.min(maxStart, Math.max(minStart, Math.round(value)))
}

export function compareStart(params: readonly ShortcodeParam[]): number {
  const raw = getParam(params, "start")
  return raw === null ? SHORTCODES.compare.defaultStart : clampCompareStart(Number(raw))
}

export function parseAlertHead(line: string): AlertHead | null {
  const match = ALERT_HEAD.exec(line)
  const type = match?.[1]
  if (!match || !isAlertType(type)) {
    return null
  }
  const title = match[2]?.trim()
  return { type, title: title ? title : null }
}

export function serializeAlertHead(head: AlertHead): string {
  return head.title ? `> [!${head.type}] ${head.title}` : `> [!${head.type}]`
}

export function stripQuotePrefix(line: string): string {
  return line.replace(QUOTE_PREFIX, "")
}

export function quoteLines(body: string): string {
  return body
    .split("\n")
    .map((line) => (line.trim() === "" ? ">" : `> ${line}`))
    .join("\n")
}

export function serializeAlert(head: AlertHead, body: string): string {
  const first = serializeAlertHead(head)
  return body === "" ? first : `${first}\n${quoteLines(body)}`
}

export function findLineStart(source: string, predicate: (line: string) => boolean): number {
  let offset = 0
  for (const line of source.split("\n")) {
    if (predicate(line)) {
      return offset
    }
    offset += line.length + 1
  }
  return -1
}

export function shortcodeLabel(raw: string): string {
  const name = /^\{\{[<%]\s*\/?([a-zA-Z0-9_.-]+)/.exec(raw.trimStart())?.[1]
  return name ? `Hugo · ${name}` : "Hugo shortcode"
}

export function figureSource(raw: string): string | undefined {
  const tag = parseShortcodeTag(raw.split("\n")[0] ?? "")
  if (tag?.name !== "figure") {
    return undefined
  }
  return getParam(tag.params, "src") ?? undefined
}

// Compatibility for the existing desktop editor (lane C's editor.ts). New code should use
// createBlockExtensions from ./blocks instead; the opaque node lives in ./blocks/unknown-shortcode.
export { createHugoShortcode } from "./blocks/unknown-shortcode"
