import { describe, expect, test } from "bun:test"
import type { PostBundle } from "../../shared/onsite/document"
import { fixtureBundles } from "../../shared/onsite/fixtures"
import type { DraftPullRequest } from "../../shared/onsite/github"
import type { BlockSourceEntry } from "../../shared/onsite/render"
import type { RangeAnchor, ReviewThread } from "../../shared/onsite/review"
import {
  type AnchorContext,
  buildAnchor,
  placeThreads,
  quoteSelection,
  relocateQuote,
} from "./anchors"
import { frameRuntimeSource } from "./frame-runtime"
import {
  approveGate,
  describeGitHubError,
  publishGate,
  reviewRequestGate,
  shortSha,
  translationReasons,
} from "./gates"
import { FRAME_MESSAGES, frameMessageSchema } from "./protocol"

const HASH_A = "a".repeat(64)
const HASH_B = "b".repeat(64)
const SHA_1 = "1".repeat(40)
const SHA_2 = "2".repeat(40)
const PATH = "content/posts/example/index.md"

function sourceMap(entries: readonly [string, string][]): BlockSourceEntry[] {
  let line = 10
  return entries.map(([blockId, text]) => {
    const startLine = line
    const endLine = startLine + text.split("\n").length - 1
    line = endLine + 3
    return { blockId, path: PATH, startLine, endLine, text }
  })
}

const BLOCKS: readonly [string, string][] = [
  ["b1", "리뷰 화면 개요"],
  ["b2", "첫 문단입니다. 드래그해서 댓글을 남깁니다."],
  ["b3", "둘째 문단입니다. 여러 문단 선택도 됩니다."],
  ["b4", "셋째 문단입니다."],
]

function context(blocks: readonly [string, string][] = BLOCKS, hash = HASH_A): AnchorContext {
  return {
    sourceMap: sourceMap(blocks),
    blockTexts: new Map(blocks),
    snapshotHash: hash,
  }
}

function anchorOf(
  blockIds: string[],
  startOffset: number,
  endOffset: number,
  quotedText: string,
  hash = HASH_A,
): RangeAnchor {
  return {
    version: 1,
    blockIds,
    startOffset,
    endOffset,
    quotedText,
    markdown: { path: PATH, start_line: 10, line: 12, side: "RIGHT", start_side: "RIGHT" },
    snapshotHash: hash,
  }
}

function threadOf(id: string, anchor: RangeAnchor, resolved = false): ReviewThread {
  const rootCommentId = Number.parseInt(id.replace(/\D/g, ""), 10) || 1
  return {
    id,
    pullNumber: 1,
    storage: "review",
    rootCommentId,
    anchor,
    commitSha: SHA_1,
    resolved,
    outdated: false,
    comments: [
      { id: rootCommentId, author: "author", body: "본문", createdAt: "2026-10-27T01:02:03Z" },
    ],
  }
}

function draft(overrides: Partial<DraftPullRequest> = {}): DraftPullRequest {
  return {
    number: 1,
    nodeId: "PR_1",
    slug: "image-layouts",
    branch: "post/image-layouts",
    headSha: SHA_1,
    draft: true,
    state: "open",
    ...overrides,
  }
}

function fixture(): PostBundle {
  const bundle = fixtureBundles[0]
  if (!bundle) throw new Error("fixture missing")
  return structuredClone(bundle)
}

describe("buildAnchor", () => {
  test("maps a single-block selection to the block's full Markdown line range", () => {
    const built = buildAnchor({ blockIds: ["b2"], startOffset: 0, endOffset: 8 }, context())
    if (!built.ok) throw new Error(built.reason)
    expect(built.anchor.quotedText).toBe("첫 문단입니다.")
    expect(built.anchor.markdown).toEqual({
      path: PATH,
      start_line: 13,
      line: 13,
      side: "RIGHT",
      start_side: "RIGHT",
    })
    expect(built.anchor.snapshotHash).toBe(HASH_A)
  })

  test("joins multi-block selections with newlines and spans first to last line", () => {
    const built = buildAnchor(
      { blockIds: ["b2", "b3", "b4"], startOffset: 9, endOffset: 8 },
      context(),
    )
    if (!built.ok) throw new Error(built.reason)
    expect(built.anchor.quotedText).toBe(
      "드래그해서 댓글을 남깁니다.\n둘째 문단입니다. 여러 문단 선택도 됩니다.\n셋째 문단입니다",
    )
    expect(built.anchor.markdown.start_line).toBe(13)
    expect(built.anchor.markdown.line).toBe(19)
  })

  test("rejects non-contiguous, unknown, and whitespace-only selections", () => {
    expect(
      buildAnchor({ blockIds: ["b2", "b4"], startOffset: 0, endOffset: 3 }, context()).ok,
    ).toBe(false)
    expect(buildAnchor({ blockIds: ["zz"], startOffset: 0, endOffset: 3 }, context()).ok).toBe(
      false,
    )
    const spaced = context([["s1", "a   b"]])
    expect(buildAnchor({ blockIds: ["s1"], startOffset: 1, endOffset: 4 }, spaced).ok).toBe(false)
  })
})

describe("relocateQuote", () => {
  test("relocates a unique quote after text was inserted before it", () => {
    const anchor = anchorOf(["b2"], 0, 8, "첫 문단입니다.")
    const texts = new Map([["b2", "(수정) 첫 문단입니다. 드래그해서 댓글을 남깁니다."]])
    expect(relocateQuote(anchor, texts)).toEqual({
      blockIds: ["b2"],
      startOffset: 5,
      endOffset: 13,
    })
  })

  test("treats absent or non-unique quotes as outdated", () => {
    const anchor = anchorOf(["b2"], 0, 2, "aa")
    expect(relocateQuote(anchor, new Map([["b2", "bbb"]]))).toBeNull()
    expect(relocateQuote(anchor, new Map([["b2", "aaa"]]))).toBeNull()
    expect(relocateQuote(anchor, new Map())).toBeNull()
  })

  test("relocates multi-block quotes by suffix, middle, and prefix", () => {
    const anchor = anchorOf(["b2", "b3", "b4"], 9, 7, "남깁니다.\n둘째 문단입니다.\n셋째 문단")
    const texts = new Map([
      ["b2", "새로 쓴 첫 문단. 남깁니다."],
      ["b3", "둘째 문단입니다."],
      ["b4", "셋째 문단입니다. 추가 문장."],
    ])
    expect(relocateQuote(anchor, texts)).toEqual({
      blockIds: ["b2", "b3", "b4"],
      startOffset: 11,
      endOffset: 5,
    })
    expect(relocateQuote(anchor, new Map([...texts, ["b3", "바뀐 중간 문단"]]))).toBeNull()
  })

  test("marks ambiguous multi-block matches as outdated", () => {
    const anchor = anchorOf(["c1", "c2"], 0, 1, "x\nx\nx")
    const texts = new Map([
      ["c1", "x\nx"],
      ["c2", "x\nx"],
    ])
    expect(relocateQuote(anchor, texts)).toBeNull()
  })
})

describe("placeThreads", () => {
  test("keeps anchored, relocated, and outdated threads apart in document order", () => {
    const anchored = threadOf("THREAD_3", anchorOf(["b3"], 0, 2, "둘째"))
    const relocated = threadOf("THREAD_2", anchorOf(["b2"], 1, 3, "문단", HASH_B))
    const outdated = threadOf("THREAD_1", anchorOf(["b4"], 0, 3, "없는 글", HASH_B))
    const english = threadOf("THREAD_4", {
      ...anchorOf(["b2"], 0, 1, "A"),
      markdown: { ...anchorOf([], 0, 1, "A").markdown, path: "content/posts/example/index.en.md" },
    })
    const placements = placeThreads([outdated, anchored, relocated, english], "ko", context())
    expect(placements.map((placement) => [placement.thread.id, placement.status])).toEqual([
      ["THREAD_2", "relocated"],
      ["THREAD_3", "anchored"],
      ["THREAD_1", "outdated"],
    ])
    expect(placements[0]?.range).toEqual({ blockIds: ["b2"], startOffset: 2, endOffset: 4 })
  })

  test("falls back to relocation when the stored offsets no longer match the quote", () => {
    const stale = threadOf("THREAD_9", anchorOf(["b2"], 0, 2, "문단"))
    const [placement] = placeThreads([stale], "ko", context())
    expect(placement?.status).toBe("relocated")
    expect(placement?.range?.startOffset).toBe(2)
  })

  test("quoteSelection mirrors the frame's newline join", () => {
    expect(
      quoteSelection({ blockIds: ["b1", "b2"], startOffset: 3, endOffset: 1 }, new Map(BLOCKS)),
    ).toBe("화면 개요\n첫")
  })
})

describe("review gates", () => {
  test("blocks review requests until both translations are complete", () => {
    const bundle = fixture()
    const block = bundle.en.blocks[1]
    if (!block) throw new Error("block missing")
    block.markdown = ""
    bundle.ko.frontMatter.authors = []
    expect(translationReasons(bundle)).toEqual([
      "한국어 작성자가 없습니다.",
      "영어 본문이 비어 있는 블록이 1개 있습니다.",
    ])
    const gate = reviewRequestGate(bundle, draft(), () => [
      { code: "image", message: "이미지 경로가 올바르지 않습니다." },
    ])
    expect(gate.allowed).toBe(false)
    expect(gate.reasons).toContain("이미지 경로가 올바르지 않습니다.")
    expect(reviewRequestGate(fixture(), draft()).allowed).toBe(true)
    expect(reviewRequestGate(fixture(), draft({ draft: false })).reasons).toEqual([
      "이미 리뷰를 요청했습니다.",
    ])
  })

  test("publishing requires a review request and approval on the current head", () => {
    const bundle = fixture()
    expect(publishGate(bundle, draft(), null).reasons).toEqual([
      "리뷰 요청과 승인 후 게시할 수 있습니다.",
    ])
    expect(publishGate(bundle, draft({ draft: false }), null).reasons).toEqual([
      "승인 후 게시할 수 있습니다.",
    ])
    expect(publishGate(bundle, draft({ draft: false }), SHA_2).allowed).toBe(false)
    expect(publishGate(bundle, draft({ draft: false }), SHA_1).allowed).toBe(true)
    expect(publishGate(bundle, draft({ draft: false, state: "merged" }), SHA_1).reasons).toEqual([
      "이미 게시된 글입니다.",
    ])
    expect(approveGate(draft(), null).reasons).toEqual(["리뷰 요청 후 승인할 수 있습니다."])
    expect(approveGate(draft({ draft: false }), SHA_1).reasons).toEqual(["이미 승인되었습니다."])
  })

  test("describes a stale head conflict with both SHAs", () => {
    const message = describeGitHubError({
      kind: "conflict",
      message: "stale head",
      expectedHeadSha: SHA_1,
      actualHeadSha: SHA_2,
    })
    expect(message).toContain(shortSha(SHA_1))
    expect(message).toContain(shortSha(SHA_2))
  })
})

describe("frame protocol", () => {
  test("accepts contract selection messages with or without a rect", () => {
    const base = {
      type: FRAME_MESSAGES.selection,
      blockIds: ["b1"],
      startOffset: 0,
      endOffset: 3,
      quotedText: "abc",
    }
    expect(frameMessageSchema.safeParse(base).success).toBe(true)
    const parsed = frameMessageSchema.safeParse({
      ...base,
      rect: { top: 1, left: 2, width: 3, height: 4 },
    })
    expect(
      parsed.success && parsed.data.type === FRAME_MESSAGES.selection && parsed.data.rect,
    ).toEqual({
      top: 1,
      left: 2,
      width: 3,
      height: 4,
    })
    expect(frameMessageSchema.safeParse({ type: "onsite:unknown" }).success).toBe(false)
    expect(frameMessageSchema.safeParse({ ...base, blockIds: [] }).success).toBe(false)
  })

  test("serialized runtime carries the config and cannot close its script tag", () => {
    const source = frameRuntimeSource({
      contentId: "content",
      markAttribute: "data-onsite-thread",
      messages: {
        ready: "r",
        height: "h",
        selection: "s",
        selectionCleared: "c",
        commentShortcut: "k",
        threadActivate: "a",
        headingRect: "hr",
        heading: "hd",
        threadRect: "t",
        escape: "</script>",
        highlights: "H",
        reveal: "R",
        clearSelection: "C",
      },
    })
    expect(source).toContain('"contentId":"content"')
    expect(source).not.toContain("</script>")
    expect(source.startsWith("(function frameRuntime(")).toBe(true)
  })
})
