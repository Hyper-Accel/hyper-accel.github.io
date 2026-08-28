import type { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import type { AgentContext } from "../shared/agent-contracts"
import { originalMediaSource } from "./markdown"

type LineRange = {
  readonly startLine: number
  readonly endLine: number
}

function lineAt(markdown: string, index: number): number {
  return markdown.slice(0, index).split(/\r?\n/).length
}

function closestIndex(markdown: string, candidates: readonly number[], ratio: number): number {
  const expected = markdown.length * Math.min(1, Math.max(0, ratio))
  return candidates.reduce((closest, candidate) =>
    Math.abs(candidate - expected) < Math.abs(closest - expected) ? candidate : closest,
  )
}

function occurrences(markdown: string, text: string): number[] {
  const matches: number[] = []
  let offset = 0
  while (offset <= markdown.length) {
    const index = markdown.indexOf(text, offset)
    if (index < 0) {
      break
    }
    matches.push(index)
    offset = index + Math.max(1, text.length)
  }
  return matches
}

export function locateSelectionLines(
  markdown: string,
  selectedText: string,
  positionRatio: number,
): LineRange {
  const text = selectedText.trim()
  const exactMatches = occurrences(markdown, text)
  if (exactMatches.length > 0) {
    const start = closestIndex(markdown, exactMatches, positionRatio)
    return {
      startLine: lineAt(markdown, start),
      endLine: lineAt(markdown, start + text.length),
    }
  }

  const tokens = text.split(/\s+/).filter(Boolean)
  const first = tokens[0]
  const last = tokens.at(-1)
  if (first && last) {
    const starts = occurrences(markdown, first)
    if (starts.length > 0) {
      const start = closestIndex(markdown, starts, positionRatio)
      const lastIndex = markdown.indexOf(last, start + first.length)
      const end = lastIndex < 0 ? start + first.length : lastIndex + last.length
      return { startLine: lineAt(markdown, start), endLine: lineAt(markdown, end) }
    }
  }

  const fallback = Math.round(markdown.length * Math.min(1, Math.max(0, positionRatio)))
  const selectedLines = Math.max(1, text.split(/\r?\n/).length)
  const startLine = lineAt(markdown, fallback)
  return { startLine, endLine: startLine + selectedLines - 1 }
}

function isLocalImagePath(path: string): boolean {
  return (
    !path.startsWith("/") &&
    !/^[a-z][a-z\d+.-]*:/i.test(path) &&
    !path.split(/[\\/]/).includes("..")
  )
}

export function imageAgentContext(source: string): AgentContext | undefined {
  const path = originalMediaSource(source)
  return isLocalImagePath(path) ? { kind: "image", path } : undefined
}

export function captureAgentContext(
  editor: Editor,
  restore: (markdown: string) => string,
): AgentContext | undefined {
  const { selection, doc } = editor.state
  if (selection instanceof NodeSelection && selection.node.type.name === "image") {
    const source = selection.node.attrs["src"]
    if (typeof source !== "string") {
      return undefined
    }
    return imageAgentContext(source)
  }
  if (selection.empty) {
    return undefined
  }

  const text = doc.textBetween(selection.from, selection.to, "\n", "\n").trim()
  if (!text) {
    return undefined
  }
  const markdown = restore(editor.getMarkdown())
  const range = locateSelectionLines(markdown, text, selection.from / doc.content.size)
  return { kind: "text", text, ...range }
}
