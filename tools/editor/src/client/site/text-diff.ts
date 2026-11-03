/** One piece of a diff: kept, only in the new text (add) or only in the old text (del). */
export interface DiffPart {
  readonly type: "same" | "add" | "del"
  readonly value: string
}

/** Longest-common-subsequence diff of two token lists (blocks are short, so O(n·m) is fine). */
export function diffTokens(before: readonly string[], after: readonly string[]): DiffPart[] {
  const rows = before.length
  const cols = after.length
  // table[i * (cols + 1) + j]: the common-subsequence length of before[i..] and after[j..].
  const table = new Int32Array((rows + 1) * (cols + 1))
  const at = (i: number, j: number): number => table[i * (cols + 1) + j] ?? 0
  for (let i = rows - 1; i >= 0; i -= 1)
    for (let j = cols - 1; j >= 0; j -= 1)
      table[i * (cols + 1) + j] =
        before[i] === after[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
  const parts: DiffPart[] = []
  let i = 0
  let j = 0
  while (i < rows && j < cols) {
    const left = before[i] ?? ""
    const right = after[j] ?? ""
    if (left === right) {
      parts.push({ type: "same", value: left })
      i += 1
      j += 1
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      parts.push({ type: "del", value: left })
      i += 1
    } else {
      parts.push({ type: "add", value: right })
      j += 1
    }
  }
  for (; i < rows; i += 1) parts.push({ type: "del", value: before[i] ?? "" })
  for (; j < cols; j += 1) parts.push({ type: "add", value: after[j] ?? "" })
  return parts
}

/** Words and the spaces between them, so a changed word can be marked inside a line. */
export function wordTokens(text: string): string[] {
  return text.split(/(\s+)/).filter((token) => token !== "")
}

/**
 * Joins neighbouring pieces of the same kind, and a space between two changed pieces, so a run of
 * changed words reads as one mark.
 */
function coalesce(parts: readonly DiffPart[]): DiffPart[] {
  const merged: DiffPart[] = []
  for (const part of parts) {
    const last = merged.at(-1)
    if (last && last.type === part.type)
      merged[merged.length - 1] = { type: part.type, value: last.value + part.value }
    else merged.push(part)
  }
  const joined: DiffPart[] = []
  for (let index = 0; index < merged.length; index += 1) {
    const part = merged[index]
    const gap = merged[index + 1]
    const next = merged[index + 2]
    if (
      part &&
      part.type !== "same" &&
      gap?.type === "same" &&
      /^\s+$/.test(gap.value) &&
      next?.type === part.type
    ) {
      merged[index + 2] = { type: part.type, value: part.value + gap.value + next.value }
      index += 1
      continue
    }
    if (part) joined.push(part)
  }
  return joined
}

export interface DiffLine {
  readonly type: "same" | "add" | "del"
  /** The line as pieces; in a changed pair, the words that differ are marked add/del. */
  readonly parts: readonly DiffPart[]
}

/**
 * Line diff of two texts (GitHub's unified view). Removed lines followed by added ones are paired
 * as changed lines, and the words that differ inside each pair are marked.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const lines = diffTokens(before.split("\n"), after.split("\n"))
  const result: DiffLine[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (line && line.type !== "del") {
      result.push({ type: line.type, parts: [{ type: "same", value: line.value }] })
      index += 1
      continue
    }
    const removed: string[] = []
    const added: string[] = []
    for (let next = lines[index]; next?.type === "del"; next = lines[++index])
      removed.push(next.value)
    for (let next = lines[index]; next?.type === "add"; next = lines[++index])
      added.push(next.value)
    const removedLines: DiffLine[] = []
    const addedLines: DiffLine[] = []
    for (let k = 0; k < Math.max(removed.length, added.length); k += 1) {
      const old = removed[k]
      const fresh = added[k]
      if (old !== undefined && fresh !== undefined) {
        const words = diffTokens(wordTokens(old), wordTokens(fresh))
        removedLines.push({
          type: "del",
          parts: coalesce(words.filter((word) => word.type !== "add")),
        })
        addedLines.push({
          type: "add",
          parts: coalesce(words.filter((word) => word.type !== "del")),
        })
      } else if (old !== undefined)
        removedLines.push({ type: "del", parts: [{ type: "same", value: old }] })
      else if (fresh !== undefined)
        addedLines.push({ type: "add", parts: [{ type: "same", value: fresh }] })
    }
    result.push(...removedLines, ...addedLines)
  }
  return result
}
