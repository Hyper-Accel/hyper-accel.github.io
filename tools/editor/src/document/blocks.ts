import { BLOCK_ID_PREFIX, BLOCK_ID_SUFFIX } from "../shared/onsite/blocks"

/**
 * Splits a Markdown body (everything after the YAML front matter) into top-level blocks.
 *
 * - "marked" mode: the body already carries `<!-- b:ID -->` markers. Markers are the only block
 *   boundaries (outside fenced code and raw HTML), so a block may contain blank lines.
 * - "legacy" mode: no markers. Blank lines separate blocks, except inside constructs that must
 *   stay together: fenced code, raw HTML (script/pre/style/textarea, multi-line comments),
 *   HTML wrappers opened at column 0, paired Hugo shortcodes, display math, loose lists and
 *   indented continuation lines. Merging is always rendering-neutral; splitting is not.
 *
 * The split is lossless: `segments.map((s) => s.prefix + s.markdown).join("") + trailing`
 * reproduces the body byte for byte. A prefix holds only blank lines and at most one marker.
 */
export interface BlockSegment {
  readonly prefix: string
  readonly id: string | null
  readonly markdown: string
}

export interface SplitBody {
  readonly mode: "marked" | "legacy"
  readonly segments: readonly BlockSegment[]
  readonly trailing: string
}

type Tracker = "html" | "shortcode" | "math"

const MARKER_LINE = /^<!-- b:([A-Za-z0-9][A-Za-z0-9_-]*) -->[ \t]*$/
const BLANK_LINE = /^[ \t]*$/
const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})/
const FENCE_CLOSE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/
const LIST_ITEM = /^ {0,3}(?:([-*+])|\d{1,9}([.)]))(?:[ \t]|$)/
const INDENTED_LINE = /^(?: {2,}|\t)/
const RAW_HTML_OPEN = /^ {0,3}<(script|pre|style|textarea)(?:[\s>]|$)/i
const COMMENT_OPEN = /^ {0,3}<!--/
const HTML_TAG = /<(\/?)([A-Za-z][A-Za-z0-9-]*)(?:\s[^<>]*?)?(\/?)>/g
const SHORTCODE_TAG = /\{\{[<%]\s*(\/?)([A-Za-z0-9_-]+)[^}]*?[>%]\}\}/g
const SHORTCODE_CLOSER = /\{\{[<%]\s*\/([A-Za-z0-9_-]+)\s*[>%]\}\}/g
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
])

export function markerLine(id: string): string {
  return `${BLOCK_ID_PREFIX}${id}${BLOCK_ID_SUFFIX}`
}

export function parseMarkerLine(text: string): string | null {
  return MARKER_LINE.exec(text)?.[1] ?? null
}

function splitLines(body: string): string[] {
  return body.match(/[^\n]*\n|[^\n]+$/g) ?? []
}

function lineText(raw: string): string {
  return raw.endsWith("\n") ? raw.slice(0, -1) : raw
}

function listKindOf(text: string): string | null {
  const match = LIST_ITEM.exec(text)
  if (!match) return null
  return match[1] ?? `n${match[2] ?? ""}`
}

class Context {
  private fence: { readonly char: string; readonly length: number } | null = null
  private raw: RegExp | null = null
  private math = false
  private readonly html: string[] = []
  private readonly shortcodes: string[] = []

  constructor(
    private readonly trackers: Readonly<Record<Tracker, boolean>>,
    private readonly closers: ReadonlySet<string>,
  ) {}

  get inCode(): boolean {
    return this.fence !== null || this.raw !== null
  }

  get open(): boolean {
    return this.html.length > 0 || this.shortcodes.length > 0 || this.math
  }

  unbalanced(): Tracker[] {
    const result: Tracker[] = []
    if (this.html.length > 0) result.push("html")
    if (this.shortcodes.length > 0) result.push("shortcode")
    if (this.math) result.push("math")
    return result
  }

  update(text: string): void {
    if (this.fence) {
      const close = FENCE_CLOSE.exec(text)?.[1]
      if (close && close[0] === this.fence.char && close.length >= this.fence.length) {
        this.fence = null
      }
      return
    }
    if (this.raw) {
      if (this.raw.test(text)) this.raw = null
      return
    }
    const fence = FENCE_OPEN.exec(text)
    const marker = fence?.[1]
    if (fence && marker) {
      const info = text.slice(fence[0].length)
      if (marker[0] !== "`" || !info.includes("`")) {
        this.fence = { char: marker[0] ?? "`", length: marker.length }
        return
      }
    }
    const rawTag = RAW_HTML_OPEN.exec(text)?.[1]
    if (rawTag) {
      const close = new RegExp(`</${rawTag}\\s*>`, "i")
      if (!close.test(text)) this.raw = close
      return
    }
    if (COMMENT_OPEN.test(text) && !text.includes("-->")) {
      this.raw = /-->/
      return
    }
    if (this.trackers.math) this.updateMath(text)
    if (this.trackers.shortcode) this.updateShortcodes(text)
    if (this.trackers.html) this.updateHtml(text)
  }

  private updateMath(text: string): void {
    const trimmed = text.trim()
    if (this.math) {
      if (trimmed.includes("$$")) this.math = false
      return
    }
    if (trimmed.startsWith("$$") && (trimmed.split("$$").length - 1) % 2 === 1) {
      this.math = true
    }
  }

  private updateShortcodes(text: string): void {
    for (const match of text.matchAll(SHORTCODE_TAG)) {
      const name = match[2] ?? ""
      if (match[1] === "/") {
        const index = this.shortcodes.lastIndexOf(name)
        if (index >= 0) this.shortcodes.splice(index)
      } else if (this.closers.has(name)) {
        this.shortcodes.push(name)
      }
    }
  }

  private updateHtml(text: string): void {
    const lead = /^ {0,3}/.exec(text)?.[0].length ?? 0
    for (const match of text.matchAll(HTML_TAG)) {
      const name = (match[2] ?? "").toLowerCase()
      if (match[1] === "/") {
        const index = this.html.lastIndexOf(name)
        if (index >= 0) this.html.splice(index)
      } else if (match[3] !== "/" && !VOID_ELEMENTS.has(name) && match.index === lead) {
        this.html.push(name)
      }
    }
  }
}

function hasTopLevelMarker(lines: readonly string[]): boolean {
  const context = new Context({ html: false, shortcode: false, math: false }, new Set())
  for (const raw of lines) {
    const text = lineText(raw)
    if (!context.inCode && MARKER_LINE.test(text)) return true
    context.update(text)
  }
  return false
}

function splitWith(
  lines: readonly string[],
  mode: SplitBody["mode"],
  trackers: Readonly<Record<Tracker, boolean>>,
): { readonly body: SplitBody; readonly unbalanced: Tracker[] } {
  const closers = new Set<string>()
  for (const raw of lines) {
    for (const match of lineText(raw).matchAll(SHORTCODE_CLOSER)) {
      if (match[1]) closers.add(match[1])
    }
  }
  const context = new Context(trackers, closers)
  const segments: BlockSegment[] = []
  const state: {
    prefix: string
    pendingId: string | null
    block: string[] | null
    blockPrefix: string
    blockId: string | null
    listKind: string | null
    pendingBlank: string
  } = {
    prefix: "",
    pendingId: null,
    block: null,
    blockPrefix: "",
    blockId: null,
    listKind: null,
    pendingBlank: "",
  }

  const close = (): void => {
    if (!state.block) return
    let markdown = state.block.join("")
    let carry = ""
    if (markdown.endsWith("\n")) {
      markdown = markdown.slice(0, -1)
      carry = "\n"
    }
    segments.push({ prefix: state.blockPrefix, id: state.blockId, markdown })
    state.prefix = carry + state.pendingBlank
    state.pendingBlank = ""
    state.block = null
    state.blockId = null
    state.listKind = null
  }
  const flushPendingMarker = (): void => {
    if (state.pendingId === null) return
    segments.push({ prefix: state.prefix, id: state.pendingId, markdown: "" })
    state.prefix = ""
    state.pendingId = null
  }
  const start = (raw: string, text: string): void => {
    state.blockPrefix = state.prefix
    state.prefix = ""
    state.blockId = state.pendingId
    state.pendingId = null
    state.block = [raw]
    state.listKind = listKindOf(text)
  }
  const append = (block: string[], raw: string): void => {
    if (state.pendingBlank) {
      block.push(state.pendingBlank)
      state.pendingBlank = ""
    }
    block.push(raw)
  }

  for (const raw of lines) {
    const text = lineText(raw)
    if (!context.inCode) {
      const id = parseMarkerLine(text)
      if (id !== null) {
        close()
        flushPendingMarker()
        state.pendingId = id
        state.prefix += raw
        continue
      }
    }
    const block = state.block
    if (block === null) {
      if (BLANK_LINE.test(text)) {
        state.prefix += raw
        continue
      }
      start(raw, text)
      context.update(text)
      continue
    }
    if (context.inCode) {
      append(block, raw)
      context.update(text)
      continue
    }
    if (BLANK_LINE.test(text)) {
      state.pendingBlank += raw
      continue
    }
    const continues =
      state.pendingBlank === "" ||
      mode === "marked" ||
      context.open ||
      INDENTED_LINE.test(text) ||
      (state.listKind !== null && listKindOf(text) === state.listKind)
    if (continues) {
      append(block, raw)
      context.update(text)
      continue
    }
    close()
    start(raw, text)
    context.update(text)
  }
  close()
  flushPendingMarker()
  return {
    body: { mode, segments, trailing: state.prefix },
    unbalanced: context.unbalanced(),
  }
}

export function splitBody(body: string): SplitBody {
  const lines = splitLines(body)
  const mode: SplitBody["mode"] = hasTopLevelMarker(lines) ? "marked" : "legacy"
  const trackers: Record<Tracker, boolean> = { html: true, shortcode: true, math: true }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = splitWith(lines, mode, trackers)
    if (result.unbalanced.length === 0 || attempt === 3) return result.body
    // An unclosed wrapper would swallow the rest of the document; drop that tracker instead.
    for (const tracker of result.unbalanced) trackers[tracker] = false
  }
  return splitWith(lines, mode, trackers).body
}
