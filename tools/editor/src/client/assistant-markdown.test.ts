import { describe, expect, test } from "bun:test"
import { renderAssistantMarkdown } from "./assistant-markdown"

describe("renderAssistantMarkdown", () => {
  test("renders common Markdown without executing embedded HTML", () => {
    const html = renderAssistantMarkdown(
      "**핵심**입니다.\n\n```ts\nconst value = 1\n```\n\n<img src=x onerror=alert(1)>",
    )

    expect(html).toContain("<strong>핵심</strong>")
    expect(html).toContain("<pre><code")
    expect(html).not.toContain("<img")
    expect(html).not.toContain("onerror")
  })

  test("drops unsafe link targets", () => {
    const html = renderAssistantMarkdown("[안전하지 않은 링크](javascript:alert(1))")

    expect(html).toContain("안전하지 않은 링크")
    expect(html).not.toContain("javascript:")
    expect(html).not.toContain("<a ")
  })
})
