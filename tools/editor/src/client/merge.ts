export type MergeChoice = "current" | "proposed"

export type MergeSegment = {
  readonly id: string
  readonly kind: "equal" | "change"
  readonly current: readonly string[]
  readonly proposed: readonly string[]
}

export function splitMarkdownBlocks(markdown: string): readonly string[] {
  const blocks: string[] = []
  let lines: string[] = []
  let fence: string | undefined
  let rawHtml = false

  const flush = (): void => {
    const block = lines.join("\n").trim()
    if (block) {
      blocks.push(block)
    }
    lines = []
  }

  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line)?.[1]
    if (fenceMatch && !fence) {
      fence = fenceMatch.slice(0, 3)
    } else if (fence && fenceMatch?.startsWith(fence)) {
      fence = undefined
    }
    if (/^\s*\{\{[<%]\s*rawhtml\b/.test(line)) {
      rawHtml = true
    }
    if (line.trim() === "" && !fence && !rawHtml) {
      flush()
      continue
    }
    lines.push(line)
    if (/^\s*\{\{[<%]\s*\/rawhtml\b/.test(line)) {
      rawHtml = false
    }
  }
  flush()
  return blocks
}

type DiffOperation = {
  readonly kind: "equal" | "delete" | "insert"
  readonly value: string
}

function diffBlocks(
  current: readonly string[],
  proposed: readonly string[],
): readonly DiffOperation[] {
  const rows = current.length + 1
  const columns = proposed.length + 1
  const table = Array.from({ length: rows }, () => Array<number>(columns).fill(0))
  for (let left = current.length - 1; left >= 0; left -= 1) {
    const row = table[left]
    if (!row) {
      throw new RangeError("병합 비교표의 행을 찾을 수 없습니다.")
    }
    for (let right = proposed.length - 1; right >= 0; right -= 1) {
      row[right] =
        current[left] === proposed[right]
          ? (table[left + 1]?.[right + 1] ?? 0) + 1
          : Math.max(table[left + 1]?.[right] ?? 0, table[left]?.[right + 1] ?? 0)
    }
  }

  const operations: DiffOperation[] = []
  let left = 0
  let right = 0
  while (left < current.length || right < proposed.length) {
    if (current[left] === proposed[right] && current[left] !== undefined) {
      operations.push({ kind: "equal", value: current[left] ?? "" })
      left += 1
      right += 1
    } else if (
      right >= proposed.length ||
      (left < current.length && (table[left + 1]?.[right] ?? 0) >= (table[left]?.[right + 1] ?? 0))
    ) {
      operations.push({ kind: "delete", value: current[left] ?? "" })
      left += 1
    } else {
      operations.push({ kind: "insert", value: proposed[right] ?? "" })
      right += 1
    }
  }
  return operations
}

export function createMergeSegments(
  current: readonly string[],
  proposed: readonly string[],
): readonly MergeSegment[] {
  const segments: MergeSegment[] = []
  let currentGroup: string[] = []
  let proposedGroup: string[] = []
  let kind: "equal" | "change" | undefined

  const flush = (): void => {
    if (!kind) {
      return
    }
    segments.push({
      id: `merge-${segments.length}`,
      kind,
      current: currentGroup,
      proposed: proposedGroup,
    })
    currentGroup = []
    proposedGroup = []
  }

  for (const operation of diffBlocks(current, proposed)) {
    const nextKind = operation.kind === "equal" ? "equal" : "change"
    if (kind && nextKind !== kind) {
      flush()
    }
    kind = nextKind
    if (operation.kind !== "insert") {
      currentGroup.push(operation.value)
    }
    if (operation.kind !== "delete") {
      proposedGroup.push(operation.value)
    }
  }
  flush()
  return segments
}

export function applyMergeChoices(
  segments: readonly MergeSegment[],
  choices: ReadonlyMap<string, MergeChoice>,
): string {
  const blocks = segments.flatMap((segment) => {
    if (segment.kind === "equal") {
      return segment.current
    }
    return choices.get(segment.id) === "proposed" ? segment.proposed : segment.current
  })
  return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : ""
}
