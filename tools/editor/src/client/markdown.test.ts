import { describe, expect, test } from "bun:test"
import { prepareMarkdown, restoreMarkdown } from "./markdown"

describe("editor markdown transport", () => {
  const path = "content/posts/example/index.ko.md"

  test("round-trips relative images through the local media endpoint", () => {
    const source = "문단\n\n![구조도](images/diagram.png)\n"
    const prepared = prepareMarkdown(source, path)

    expect(prepared.markdown).toContain("/api/media?")
    expect(restoreMarkdown(prepared.markdown, prepared.shortcodes)).toBe(source)
  })

  test("protects a Hugo ref shortcode inside a Markdown link", () => {
    const source = '[1편]({{< ref "/posts/first" >}})에서 이어집니다.\n'
    const prepared = prepareMarkdown(source, path)

    expect(prepared.markdown).not.toContain("{{< ref")
    expect(restoreMarkdown(prepared.markdown, prepared.shortcodes)).toBe(source)
  })

  test("does not rewrite remote or root-relative images", () => {
    const source = "![remote](https://example.com/a.png)\n\n![root](/images/b.png)\n"
    const prepared = prepareMarkdown(source, path)

    expect(prepared.markdown).toBe(source)
  })
})
