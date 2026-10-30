import type { Language } from "../../shared/onsite/document"
import type { BlockSourceEntry } from "../../shared/onsite/render"
import { type RangeAnchor, type ReviewThread, rangeAnchorSchema } from "../../shared/onsite/review"

export interface SelectionRange {
  readonly blockIds: readonly string[]
  readonly startOffset: number
  readonly endOffset: number
}
export type BlockTexts = ReadonlyMap<string, string>
export interface AnchorContext {
  readonly sourceMap: readonly BlockSourceEntry[]
  readonly blockTexts: BlockTexts
  readonly snapshotHash: string
}
export type AnchorBuild =
  | { readonly ok: true; readonly anchor: RangeAnchor }
  | { readonly ok: false; readonly reason: string }
export type PlacementStatus = "anchored" | "relocated" | "outdated"
export interface ThreadPlacement {
  readonly thread: ReviewThread
  readonly status: PlacementStatus
  readonly range: SelectionRange | null
}

export function quoteSelection(range: SelectionRange, texts: BlockTexts): string | null {
  const lastIndex = range.blockIds.length - 1
  const portions: string[] = []
  for (const [index, id] of range.blockIds.entries()) {
    const text = texts.get(id)
    if (text === undefined) return null
    portions.push(
      text.slice(
        index === 0 ? range.startOffset : 0,
        index === lastIndex ? range.endOffset : text.length,
      ),
    )
  }
  return portions.join("\n")
}

export function buildAnchor(range: SelectionRange, context: AnchorContext): AnchorBuild {
  const indexes = range.blockIds.map((id) =>
    context.sourceMap.findIndex((entry) => entry.blockId === id),
  )
  if (range.blockIds.length === 0 || indexes.some((index) => index < 0)) {
    return { ok: false, reason: "선택한 블록을 원문에서 찾을 수 없습니다." }
  }
  const contiguous = indexes.every(
    (value, position) => position === 0 || value === (indexes[position - 1] ?? -2) + 1,
  )
  if (!contiguous) {
    return { ok: false, reason: "이어진 블록만 함께 선택할 수 있습니다." }
  }
  const quotedText = quoteSelection(range, context.blockTexts)
  if (quotedText === null || quotedText.trim() === "") {
    return { ok: false, reason: "선택한 글을 찾을 수 없습니다." }
  }
  const first = context.sourceMap[indexes[0] ?? -1]
  const last = context.sourceMap[indexes[indexes.length - 1] ?? -1]
  if (!first || !last) {
    return { ok: false, reason: "선택한 블록을 원문에서 찾을 수 없습니다." }
  }
  const parsed = rangeAnchorSchema.safeParse({
    version: 1,
    blockIds: [...range.blockIds],
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    quotedText,
    markdown: {
      path: first.path,
      start_line: first.startLine,
      line: last.endLine,
      side: "RIGHT",
      start_side: "RIGHT",
    },
    snapshotHash: context.snapshotHash,
  })
  if (!parsed.success) {
    return { ok: false, reason: "선택 범위가 올바르지 않습니다." }
  }
  return { ok: true, anchor: parsed.data }
}

export function anchorLanguage(anchor: RangeAnchor): Language {
  return anchor.markdown.path.endsWith(".en.md") ? "en" : "ko"
}

function countOccurrences(text: string, needle: string): number {
  let count = 0
  let index = text.indexOf(needle)
  while (index >= 0 && count < 2) {
    count += 1
    index = text.indexOf(needle, index + 1)
  }
  return count
}

export function relocateQuote(anchor: RangeAnchor, texts: BlockTexts): SelectionRange | null {
  const blockTexts: string[] = []
  for (const id of anchor.blockIds) {
    const text = texts.get(id)
    if (text === undefined) return null
    blockTexts.push(text)
  }
  const first = blockTexts[0]
  const last = blockTexts[blockTexts.length - 1]
  if (first === undefined || last === undefined) return null
  if (blockTexts.length === 1) {
    if (countOccurrences(first, anchor.quotedText) !== 1) return null
    const startOffset = first.indexOf(anchor.quotedText)
    return {
      blockIds: anchor.blockIds,
      startOffset,
      endOffset: startOffset + anchor.quotedText.length,
    }
  }
  const middle = blockTexts.slice(1, -1)
  const tail = middle.length > 0 ? `${middle.join("\n")}\n` : ""
  const matches: { start: number; end: number }[] = []
  for (let start = 0; start <= first.length; start += 1) {
    const head = `${first.slice(start)}\n${tail}`
    if (!anchor.quotedText.startsWith(head)) continue
    const rest = anchor.quotedText.slice(head.length)
    if (!last.startsWith(rest)) continue
    matches.push({ start, end: rest.length })
  }
  const match = matches[0]
  if (matches.length !== 1 || !match) return null
  return { blockIds: anchor.blockIds, startOffset: match.start, endOffset: match.end }
}

export function placeThread(thread: ReviewThread, context: AnchorContext): ThreadPlacement {
  const anchor = thread.anchor
  if (anchor.snapshotHash === context.snapshotHash) {
    const quoted = quoteSelection(anchor, context.blockTexts)
    if (quoted === anchor.quotedText) {
      return {
        thread,
        status: "anchored",
        range: {
          blockIds: anchor.blockIds,
          startOffset: anchor.startOffset,
          endOffset: anchor.endOffset,
        },
      }
    }
  }
  const relocated = relocateQuote(anchor, context.blockTexts)
  return relocated
    ? { thread, status: "relocated", range: relocated }
    : { thread, status: "outdated", range: null }
}

export function placeThreads(
  threads: readonly ReviewThread[],
  language: Language,
  context: AnchorContext,
): readonly ThreadPlacement[] {
  const order = new Map(context.sourceMap.map((entry, index) => [entry.blockId, index]))
  const placements = threads
    .filter((thread) => anchorLanguage(thread.anchor) === language)
    .map((thread) => placeThread(thread, context))
  const position = (placement: ThreadPlacement): readonly [number, number] => {
    const firstBlock = placement.range?.blockIds[0]
    const blockIndex = firstBlock === undefined ? -1 : (order.get(firstBlock) ?? -1)
    return [blockIndex, placement.range?.startOffset ?? 0]
  }
  return [...placements].sort((left, right) => {
    if (left.range && !right.range) return -1
    if (!left.range && right.range) return 1
    const [leftBlock, leftOffset] = position(left)
    const [rightBlock, rightOffset] = position(right)
    if (leftBlock !== rightBlock) return leftBlock - rightBlock
    if (leftOffset !== rightOffset) return leftOffset - rightOffset
    return left.thread.rootCommentId - right.thread.rootCommentId
  })
}
