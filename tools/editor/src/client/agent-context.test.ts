import { describe, expect, test } from "bun:test"
import { locateSelectionLines } from "./agent-context"

describe("locateSelectionLines", () => {
  test("maps a formatted text selection to its Markdown line", () => {
    const markdown = ["첫 문단입니다.", "", "**강조 문장**을 다듬습니다.", ""].join("\n")

    expect(locateSelectionLines(markdown, "강조 문장", 0.5)).toEqual({
      startLine: 3,
      endLine: 3,
    })
  })

  test("uses the editor position to disambiguate repeated text", () => {
    const markdown = ["같은 문장", "", "중간 문단", "", "같은 문장", ""].join("\n")

    expect(locateSelectionLines(markdown, "같은 문장", 0.9)).toEqual({
      startLine: 5,
      endLine: 5,
    })
  })
})
