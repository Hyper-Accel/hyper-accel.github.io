import { describe, expect, test } from "bun:test"
import { fixtureBundles } from "../../shared/onsite/fixtures"
import {
  applyMetadata,
  formatLocalIso,
  fromDateTimeLocal,
  metadataErrors,
  metadataFromBundle,
  newPostFields,
  parseTags,
  slugify,
  toDateTimeLocal,
} from "./metadata"

describe("composer metadata", () => {
  test("derives contract-safe slugs and de-duplicated tags", () => {
    expect(slugify("  Onsite Editor Test! (v2) ")).toBe("onsite-editor-test-v2")
    expect(slugify("한국어 제목")).toBe("")
    expect(slugify("Café-Résumé")).toBe("cafe-resume")
    expect(parseTags(" editor, test,\neditor ,, ")).toEqual(["editor", "test"])
  })

  test("formats dates with the local offset and round-trips datetime-local values", () => {
    const iso = formatLocalIso(new Date(2026, 9, 27, 9, 5, 7))
    expect(iso).toMatch(/^2026-10-27T09:05:07[+-]\d{2}:\d{2}$/)
    expect(toDateTimeLocal(iso)).toBe("2026-10-27T09:05")
    expect(fromDateTimeLocal("2026-10-27T09:05", "fallback")).toMatch(/^2026-10-27T09:05:00/)
    expect(fromDateTimeLocal("", "fallback")).toBe("fallback")
    expect(toDateTimeLocal("not a date")).toBe("")
  })

  test("reads metadata from a bundle and applies edits to both languages", () => {
    const [fixture] = fixtureBundles
    if (!fixture) throw new Error("Missing fixture")
    const metadata = metadataFromBundle(fixture)
    expect(metadata).toEqual({
      slug: "image-layouts",
      title: { ko: "문법 검증: image-layouts", en: "Syntax fixture: image-layouts" },
      authors: ["Fixture Author"],
      category: "Engineering",
      tags: [],
      series: "",
      seriesIndex: null,
      cover: null,
      date: "2026-10-27T00:00:00Z",
      draft: true,
      editors: [],
    })
    const applied = applyMetadata(fixture, {
      ...metadata,
      title: { ko: "새 제목", en: "New title" },
      category: "AI Hardware",
      tags: ["a"],
      series: "S",
      seriesIndex: 2.5,
      cover: { image: "images/cover.webp", alt: "Cover" },
      draft: false,
    })
    expect(applied.ko.frontMatter).toEqual({
      title: "새 제목",
      date: "2026-10-27T00:00:00Z",
      draft: false,
      authors: ["Fixture Author"],
      categories: ["AI Hardware"],
      tags: ["a"],
      series: ["S"],
      series_idx: 2.5,
      cover: { image: "images/cover.webp", alt: "Cover", relative: true },
    })
    expect(applied.en.frontMatter.title).toBe("New title")
    expect(applied.en.blocks).toBe(fixture.en.blocks)
    expect(fixture.ko.frontMatter.title).toBe("문법 검증: image-layouts")
  })

  test("validates the creation form and maps to new-post fields", () => {
    const metadata = metadataFromBundle(
      fixtureBundles[0] ??
        (() => {
          throw new Error("Missing fixture")
        })(),
    )
    expect(metadataErrors(metadata, ["Fixture Author"])).toEqual([])
    expect(
      metadataErrors(
        {
          ...metadata,
          slug: "Bad Slug",
          authors: ["Nobody"],
          category: "",
          title: { ko: "", en: "" },
        },
        ["Fixture Author"],
      ),
    ).toEqual([
      "한국어 제목을 입력하세요.",
      "슬러그는 소문자 영문, 숫자, 하이픈만 쓸 수 있습니다.",
      "작성자는 content/authors 목록에 있는 이름이어야 합니다.",
      "카테고리를 선택하세요.",
    ])
    expect(newPostFields({ ...metadata, series: "S", seriesIndex: 1 })).toEqual({
      slug: "image-layouts",
      title: metadata.title,
      date: "2026-10-27T00:00:00Z",
      authors: ["Fixture Author"],
      category: "Engineering",
      tags: [],
      series: "S",
      seriesIndex: 1,
      draft: true,
    })
  })
})
