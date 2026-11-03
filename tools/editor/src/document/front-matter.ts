import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import { type FrontMatter, frontMatterSchema } from "../shared/onsite/document"

export interface SplitSource {
  readonly head: string
  readonly rawFrontMatter: string
  readonly body: string
}

export type FrontMatterParse =
  | { readonly ok: true; readonly value: FrontMatter; readonly raw: Record<string, unknown> }
  | { readonly ok: false; readonly message: string }

const FRONT_MATTER = /^---[ \t]*\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/
const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_-]*)[ \t]*:(?:[ \t]|$)/

export function normalizeSource(source: string): string {
  return source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
}

export function splitSource(source: string): SplitSource | null {
  const match = FRONT_MATTER.exec(source)
  if (!match) return null
  const inner = (match[1] ?? "").replace(/(?:\n[ \t]*)+$/, "")
  return {
    head: match[0],
    rawFrontMatter: inner === "" ? "" : `${inner}\n`,
    body: source.slice(match[0].length),
  }
}

function yamlMapping(raw: string): Record<string, unknown> | null {
  const data: unknown = parseYaml(raw)
  if (data === null || data === undefined) return {}
  if (typeof data !== "object" || Array.isArray(data)) return null
  return data as Record<string, unknown>
}

export function parseFrontMatter(raw: string): FrontMatterParse {
  let mapping: Record<string, unknown> | null
  try {
    mapping = yamlMapping(raw)
  } catch (error: unknown) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
  if (!mapping) return { ok: false, message: "front matter must be a YAML mapping" }
  const result = frontMatterSchema.safeParse({ ...mapping, draft: mapping["draft"] ?? false })
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "front matter"}: ${issue.message}`)
      .join("; ")
    return { ok: false, message: detail }
  }
  return { ok: true, value: result.data, raw: mapping }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((item, index) => deepEqual(item, right[index]))
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined)
    const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined)
    if (leftKeys.length !== rightKeys.length) return false
    return leftKeys.every((key) => deepEqual(left[key], right[key]))
  }
  return false
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
}

function formatScalar(value: string | number | boolean | null): string {
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null"
  return String(value)
}

function formatMapping(value: Record<string, unknown>, indent: number): string[] {
  const lines: string[] = []
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) lines.push(...formatEntry(key, item, indent))
  }
  return lines
}

export function formatEntry(key: string, value: unknown, indent = 0): string[] {
  const pad = " ".repeat(indent)
  if (isScalar(value)) return [`${pad}${key}: ${formatScalar(value)}`]
  if (Array.isArray(value)) {
    if (value.every(isScalar)) return [`${pad}${key}: [${value.map(formatScalar).join(", ")}]`]
    return stringifyYaml({ [key]: value })
      .trimEnd()
      .split("\n")
      .map((line) => `${pad}${line}`)
  }
  if (isPlainObject(value)) {
    const nested = formatMapping(value, indent + 2)
    return nested.length === 0 ? [`${pad}${key}: {}`] : [`${pad}${key}:`, ...nested]
  }
  return [`${pad}${key}: ${JSON.stringify(String(value))}`]
}

export function formatFrontMatter(fields: Readonly<Record<string, unknown>>): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (key === "draft" && value === false) continue
    lines.push(...formatEntry(key, value))
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`
}

interface EntrySpan {
  readonly key: string
  readonly start: number
  readonly end: number
}

function bracketDelta(line: string): number {
  const code = line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'/g, "").replace(/#.*$/, "")
  let delta = 0
  for (const character of code) {
    if (character === "[" || character === "{") delta += 1
    if (character === "]" || character === "}") delta -= 1
  }
  return delta
}

export function topLevelEntries(raw: string): EntrySpan[] {
  const lines = raw.split("\n")
  const entries: EntrySpan[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ""
    const key = KEY_LINE.exec(line)?.[1]
    if (!key) {
      index += 1
      continue
    }
    let depth = bracketDelta(line)
    let last = index
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor] ?? ""
      if (depth > 0) {
        last = cursor
        depth += bracketDelta(candidate)
        continue
      }
      if (KEY_LINE.test(candidate)) break
      const indented = /^[ \t]/.test(candidate) && candidate.trim() !== ""
      const sequenceItem = /^-(?:[ \t]|$)/.test(candidate)
      if (indented || sequenceItem) {
        last = cursor
        depth += bracketDelta(candidate)
      }
    }
    entries.push({ key, start: index, end: last + 1 })
    index = last + 1
  }
  return entries
}

export function patchFrontMatter(raw: string, next: Readonly<Record<string, unknown>>): string {
  let parsed: Record<string, unknown>
  try {
    parsed = yamlMapping(raw) ?? {}
  } catch {
    parsed = {}
  }
  const lines = raw.split("\n")
  const spans = topLevelEntries(raw)
  const replacements = new Map<EntrySpan, string[]>()
  const present = new Set<string>()
  for (const span of spans) {
    present.add(span.key)
    const value = next[span.key]
    if (value === undefined) {
      replacements.set(span, [])
    } else if (!deepEqual(value, parsed[span.key])) {
      replacements.set(span, formatEntry(span.key, value))
    }
  }
  const appended: string[] = []
  for (const [key, value] of Object.entries(next)) {
    if (present.has(key) || value === undefined) continue
    if (key === "draft" && value === false) continue
    appended.push(...formatEntry(key, value))
  }
  if (replacements.size === 0 && appended.length === 0) return raw
  const output: string[] = []
  let consumed = 0
  for (const span of spans) {
    const replacement = replacements.get(span)
    if (!replacement) continue
    output.push(...lines.slice(consumed, span.start), ...replacement)
    consumed = span.end
  }
  output.push(...lines.slice(consumed))
  let text = output.join("\n")
  if (text !== "" && !text.endsWith("\n")) text += "\n"
  if (appended.length > 0) text += `${appended.join("\n")}\n`
  return text
}
