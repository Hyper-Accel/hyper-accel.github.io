import { describe, expect, test } from "bun:test"
import { coverPreviewUrl, maximumCoverBytes, validateCoverFile } from "./cover-editor"
import { applicationMarkup } from "./view"

describe("representative image controls", () => {
  test("keeps cover settings in the article without a top-bar shortcut", () => {
    const markup = applicationMarkup()
    expect(markup).not.toContain('id="cover-settings-button"')
    expect(markup).toContain('id="cover-section"')
    expect(markup).toContain('id="cover-select"')
    expect(markup).toContain('aria-label="본문 이미지 추가"')
  })

  test("offers a separate cover image section without changing post creation inputs", () => {
    const markup = applicationMarkup()
    expect(markup).toContain('id="cover-section"')
    expect(markup).toContain('id="cover-file-input"')
    expect(markup).toContain('id="cover-alt"')
    expect(markup).toContain('id="cover-remove"')
    expect(markup).toContain("대표 이미지 추가")
    expect(markup).toContain('aria-labelledby="cover-heading"')
  })

  test("validates cover upload format and the inclusive 1MiB size limit", () => {
    for (const type of ["image/png", "image/jpeg", "image/gif", "image/webp"]) {
      expect(
        validateCoverFile(new File([new Uint8Array(maximumCoverBytes)], "cover", { type })),
      ).toBeUndefined()
    }
    expect(validateCoverFile(new File([], "empty.png", { type: "image/png" }))).toContain("1MB")
    expect(
      validateCoverFile(
        new File([new Uint8Array(maximumCoverBytes + 1)], "large.png", { type: "image/png" }),
      ),
    ).toContain("1MB")
    expect(validateCoverFile(new File(["svg"], "unsafe.svg", { type: "image/svg+xml" }))).toContain(
      "PNG",
    )
  })

  test("previews local and static images through a confined endpoint and remote images directly", () => {
    const path = "content/posts/example/index.md"
    for (const image of ["images/cover.png", "/images/static-cover.webp", "legacy.png"]) {
      const source = coverPreviewUrl(path, { image, alt: "설명", relative: false })
      expect(source).toBeDefined()
      const url = new URL(source ?? "", "http://editor.local")
      expect(url.pathname).toBe("/api/cover-media")
      expect(url.searchParams.get("path")).toBe(path)
      expect(url.searchParams.get("src")).toBe(image)
    }
    expect(
      coverPreviewUrl(path, { image: "https://example.com/cover.jpg", alt: "", relative: false }),
    ).toBe("https://example.com/cover.jpg")
    for (const image of [
      "javascript:alert(1)",
      "data:image/svg+xml,unsafe",
      "file:///private/cover.png",
      "//remote.example/image.png",
    ]) {
      expect(coverPreviewUrl(path, { image, alt: "", relative: false })).toBeUndefined()
    }
  })
})
