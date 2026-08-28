import { describe, expect, test } from "bun:test"
import { applyMergeChoices, createMergeSegments, splitMarkdownBlocks } from "./merge"

describe("splitMarkdownBlocks", () => {
  test("keeps fenced code, lists, and shortcode blocks intact", () => {
    const markdown = `# 제목

첫 문단
이어지는 문장

- 하나
- 둘

\`\`\`ts
const value = 1

console.log(value)
\`\`\`

{{< figure src="diagram.png" >}}
`
    expect(splitMarkdownBlocks(markdown)).toEqual([
      "# 제목",
      "첫 문단\n이어지는 문장",
      "- 하나\n- 둘",
      "```ts\nconst value = 1\n\nconsole.log(value)\n```",
      '{{< figure src="diagram.png" >}}',
    ])
  })
})

describe("merge segments", () => {
  test("creates deterministic change hunks and applies individual choices", () => {
    const current = ["# 제목", "기존 첫 문단", "공통 문단", "기존 결론"]
    const proposed = ["# 제목", "수정 첫 문단", "공통 문단", "수정 결론", "새 문단"]
    const segments = createMergeSegments(current, proposed)

    expect(segments.map((segment) => segment.kind)).toEqual(["equal", "change", "equal", "change"])
    const changed = segments.filter((segment) => segment.kind === "change")
    const choices = new Map([
      [changed[0]?.id ?? "", "proposed" as const],
      [changed[1]?.id ?? "", "current" as const],
    ])
    expect(applyMergeChoices(segments, choices)).toBe(
      "# 제목\n\n수정 첫 문단\n\n공통 문단\n\n기존 결론\n",
    )
  })
})
