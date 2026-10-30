import { describe, expect, test } from "bun:test"
import { fixtureBundles, legacyFixtureSlug } from "../shared/onsite/fixtures"
import { splitBody } from "./blocks"
import {
  createBundle,
  parseBundle,
  parseLanguageSource,
  serializeBundle,
  serializeLanguage,
  validateBundle,
} from "./codec"
import { patchFrontMatter, topLevelEntries } from "./front-matter"

const fixtures = `${import.meta.dir}/../shared/onsite/fixtures`

async function fixtureSources(slug: string): Promise<{ ko: string; en: string }> {
  return {
    ko: await Bun.file(`${fixtures}/${slug}/index.md`).text(),
    en: await Bun.file(`${fixtures}/${slug}/index.en.md`).text(),
  }
}

describe("block splitting", () => {
  const segments = (body: string) => splitBody(body).segments.map((segment) => segment.markdown)

  test("splits legacy paragraphs at blank lines and drops separator whitespace", () => {
    const body = "첫 문단\n\n\n  \n둘째 문단\n"
    const split = splitBody(body)
    expect(split.mode).toBe("legacy")
    expect(split.segments.map((s) => s.markdown)).toEqual(["첫 문단", "둘째 문단"])
    expect(split.segments.map((s) => s.prefix + s.markdown).join("") + split.trailing).toBe(body)
  })

  test("keeps fenced code, math, loose lists and nested continuations together", () => {
    expect(segments("```yaml\na: 1\n\nb: 2\n```\n\n~~~\n\nx\n~~~\n")).toEqual([
      "```yaml\na: 1\n\nb: 2\n```",
      "~~~\n\nx\n~~~",
    ])
    expect(segments("$$\na\n\nb\n$$\n\n$$x$$\n")).toEqual(["$$\na\n\nb\n$$", "$$x$$"])
    expect(segments("1. a\n\n2. b\n\n- c\n\n  continued\n\n* d\n")).toEqual([
      "1. a\n\n2. b",
      "- c\n\n  continued",
      "* d",
    ])
  })

  test("keeps paired shortcodes and HTML wrappers with blank lines inside as one block", () => {
    expect(
      segments(
        '{{< tabs >}}\n{{< tab name="a" >}}\n\ntext\n\n{{< /tab >}}\n{{< /tabs >}}\n\n{{< figure src="x" >}}\n',
      ),
    ).toEqual([
      '{{< tabs >}}\n{{< tab name="a" >}}\n\ntext\n\n{{< /tab >}}\n{{< /tabs >}}',
      '{{< figure src="x" >}}',
    ])
    expect(segments('<figure style="x">\n\n![a](images/a.png)\n\n</figure>\n\nAfter\n')).toEqual([
      '<figure style="x">\n\n![a](images/a.png)\n\n</figure>',
      "After",
    ])
  })

  test("falls back to blank-line splitting when a wrapper never closes", () => {
    expect(segments("<div>\n\nparagraph\n\nnext\n")).toEqual(["<div>", "paragraph", "next"])
  })

  test("marked bodies split only at markers and ignore markers inside code", () => {
    const body =
      "<!-- b:a -->\nfirst\n\nstill first\n\n<!-- b:b -->\n```\n<!-- b:nope -->\n```\n\n<!-- b:c -->\n\n\n<!-- b:d -->\nlast\n"
    const split = splitBody(body)
    expect(split.mode).toBe("marked")
    expect(split.segments.map((s) => [s.id, s.markdown])).toEqual([
      ["a", "first\n\nstill first"],
      ["b", "```\n<!-- b:nope -->\n```"],
      ["c", ""],
      ["d", "last"],
    ])
    expect(split.segments.map((s) => s.prefix + s.markdown).join("") + split.trailing).toBe(body)
  })
})

describe("front matter patching", () => {
  const raw =
    'date: \'2026-01-03T17:20:16+09:00\'\ntitle: \'기존 제목\'\ncover:\n  image: "cover.webp"\n  # keep this comment when untouched\n  alt: "alt"\n  relative: true\nauthors: [Jaewon Lim] # must match\ntags: ["a", "b"]\ncategories: ["AI Hardware"]\nkeywords: [\n  "x", "y"\n]\ncomments: true\n'

  test("finds top-level spans including flow collections and nested mappings", () => {
    expect(topLevelEntries(raw).map((entry) => [entry.key, entry.start, entry.end])).toEqual([
      ["date", 0, 1],
      ["title", 1, 2],
      ["cover", 2, 7],
      ["authors", 7, 8],
      ["tags", 8, 9],
      ["categories", 9, 10],
      ["keywords", 10, 13],
      ["comments", 13, 14],
    ])
  })

  test("rewrites only changed keys and appends new ones", () => {
    const next = {
      date: "2026-01-03T17:20:16+09:00",
      title: "새 제목",
      cover: { image: "cover.webp", alt: "alt", relative: true },
      authors: ["Jaewon Lim"],
      tags: ["a", "b", "c"],
      categories: ["AI Hardware"],
      keywords: ["x", "y"],
      comments: true,
      draft: false,
      series: ["시리즈"],
      series_idx: 2,
    }
    const patched = patchFrontMatter(raw, next)
    expect(patched).toBe(
      'date: \'2026-01-03T17:20:16+09:00\'\ntitle: "새 제목"\ncover:\n  image: "cover.webp"\n  # keep this comment when untouched\n  alt: "alt"\n  relative: true\nauthors: [Jaewon Lim] # must match\ntags: ["a", "b", "c"]\ncategories: ["AI Hardware"]\nkeywords: [\n  "x", "y"\n]\ncomments: true\nseries: ["시리즈"]\nseries_idx: 2\n',
    )
    expect(
      patchFrontMatter(raw, {
        ...next,
        title: "기존 제목",
        tags: ["a", "b"],
        series: undefined,
        series_idx: undefined,
      }),
    ).toBe(raw)
  })

  test("removes deleted keys and rewrites nested mappings as a unit", () => {
    const patched = patchFrontMatter(raw, {
      date: "2026-01-03T17:20:16+09:00",
      title: "기존 제목",
      cover: { image: "images/new.webp", alt: "new alt", relative: true },
      authors: ["Jaewon Lim"],
      categories: ["AI Hardware"],
      keywords: ["x", "y"],
      comments: true,
      draft: true,
    })
    expect(patched).toBe(
      'date: \'2026-01-03T17:20:16+09:00\'\ntitle: \'기존 제목\'\ncover:\n  image: "images/new.webp"\n  alt: "new alt"\n  relative: true\nauthors: [Jaewon Lim] # must match\ncategories: ["AI Hardware"]\nkeywords: [\n  "x", "y"\n]\ncomments: true\ndraft: true\n',
    )
  })
})

describe("bundle codec", () => {
  test("keeps the saved snapshot hash stable when the editor leaves trailing blank paragraphs", async () => {
    for (const original of fixtureBundles) {
      // Given: editing can leave empty paragraphs at a block's end.
      const bundle = {
        ...original,
        en: {
          ...original.en,
          blocks: original.en.blocks.map((block) => ({
            ...block,
            markdown: `${block.markdown}\n\n`,
          })),
        },
      }
      // When: save and reload through the same codec boundary as GitHub.
      const saved = await serializeBundle(bundle)
      const loaded = await parseBundle({
        slug: bundle.slug,
        ko: serializeLanguage(bundle.ko).source,
        en: serializeLanguage(bundle.en).source,
        images: bundle.images,
        headSha: "a".repeat(40),
      })
      // Then: an acknowledged save is not misclassified as a remote conflict.
      expect(loaded.ok).toBe(true)
      if (loaded.ok) expect(loaded.bundle.snapshotHash).toBe(saved.snapshotHash)
    }
  })
  test.each(fixtureBundles)("parses fixture $slug into its expected bundle", async (expected) => {
    const sources = await fixtureSources(expected.slug)
    const result = await parseBundle({
      slug: expected.slug,
      ...sources,
      images: expected.images,
      headSha: expected.headSha,
    })
    if (!result.ok) throw new Error(JSON.stringify(result.issues))
    expect(result.migratedLegacy).toBe(false)
    expect(result.bundle).toEqual(expected)
  })

  test.each(fixtureBundles)("serializes fixture $slug back to its files", async (bundle) => {
    const sources = await fixtureSources(bundle.slug)
    const serialized = await serializeBundle(bundle)
    expect(serialized.snapshotHash).toBe(bundle.snapshotHash)
    expect(serialized.files).toEqual([
      { path: bundle.ko.path, encoding: "utf-8", content: sources.ko },
      { path: bundle.en.path, encoding: "utf-8", content: sources.en },
    ])
    for (const entry of serialized.sourceMap) {
      const language = entry.path.endsWith(".en.md") ? "en" : "ko"
      const lines = sources[language].split("\n")
      expect(lines.slice(entry.startLine - 1, entry.endLine).join("\n")).toBe(entry.text)
      expect(lines[entry.startLine - 2]).toBe(`<!-- b:${entry.blockId} -->`)
    }
  })

  test("migrates a legacy post by assigning ordered IDs and keeps YAML comments", async () => {
    const sources = await fixtureSources(legacyFixtureSlug)
    const result = await parseBundle({
      slug: legacyFixtureSlug,
      ...sources,
      images: [],
      headSha: null,
    })
    if (!result.ok) throw new Error(JSON.stringify(result.issues))
    expect(result.migratedLegacy).toBe(true)
    expect(result.bundle.ko.blocks.map((block) => block.id)).toEqual([
      "legacy-no-ids-1",
      "legacy-no-ids-2",
      "legacy-no-ids-3",
    ])
    expect(result.bundle.en.blocks.map((block) => block.id)).toEqual(
      result.bundle.ko.blocks.map((block) => block.id),
    )
    expect(result.bundle.ko.frontMatter["custom_field"]).toBe("keep-me")
    expect(result.bundle.ko.frontMatter.draft).toBe(false)
    const serialized = serializeLanguage(result.bundle.ko)
    expect(serialized.source).toBe(
      '---\n# Preserve this metadata comment.\ntitle: "기존 글"\ndraft: false\nauthors: ["Fixture Author"]\ncategories: ["Engineering"]\ncustom_field: keep-me\n---\n\n<!-- b:legacy-no-ids-1 -->\n## 시작\n\n<!-- b:legacy-no-ids-2 -->\n블록 ID가 없는 글입니다.\n\n<!-- b:legacy-no-ids-3 -->\n{{< figure src="images/a.svg" caption="Legacy" >}}\n',
    )
    const reparsed = parseLanguageSource(serialized.source)
    if (!reparsed.ok) throw new Error(reparsed.message)
    expect(reparsed.value.mode).toBe("marked")
    expect(reparsed.value.segments.map((segment) => segment.id)).toEqual([
      "legacy-no-ids-1",
      "legacy-no-ids-2",
      "legacy-no-ids-3",
    ])
  })

  test("reports mismatched legacy block counts instead of guessing", async () => {
    const sources = await fixtureSources(legacyFixtureSlug)
    const result = await parseBundle({
      slug: legacyFixtureSlug,
      ko: sources.ko,
      en: `${sources.en}\nExtra English paragraph.\n`,
      images: [],
      headSha: null,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues).toEqual([
      {
        code: "pairing",
        message: "블록 수가 다릅니다 (한국어 3, 영어 4). 수동 짝 맞춤이 필요합니다.",
      },
    ])
  })

  test("fills a missing marked counterpart with an empty block and rejects reordered IDs", async () => {
    const [fixture] = fixtureBundles
    if (!fixture) throw new Error("Missing fixture")
    const sources = await fixtureSources(fixture.slug)
    const withoutThird = sources.en.replace(/<!-- b:image-layouts-3 -->\n[^\n]+\n\n/, "")
    const filled = await parseBundle({
      slug: fixture.slug,
      ko: sources.ko,
      en: withoutThird,
      images: fixture.images,
      headSha: null,
    })
    if (!filled.ok) throw new Error(JSON.stringify(filled.issues))
    expect(filled.migratedLegacy).toBe(true)
    expect(filled.bundle.en.blocks[2]).toEqual({ id: "image-layouts-3", markdown: "" })
    expect(filled.bundle.en.blocks.map((block) => block.id)).toEqual(
      fixture.ko.blocks.map((block) => block.id),
    )

    const swapped = sources.en
      .replace("<!-- b:image-layouts-1 -->", "<!-- b:tmp -->")
      .replace("<!-- b:image-layouts-2 -->", "<!-- b:image-layouts-1 -->")
      .replace("<!-- b:tmp -->", "<!-- b:image-layouts-2 -->")
    const reordered = await parseBundle({
      slug: fixture.slug,
      ko: sources.ko,
      en: swapped,
      images: fixture.images,
      headSha: null,
    })
    expect(reordered.ok).toBe(false)
    if (!reordered.ok) expect(reordered.issues[0]?.code).toBe("pairing")
  })

  test("treats an empty translation file as blocks needing translation", async () => {
    const sources = await fixtureSources(legacyFixtureSlug)
    const result = await parseBundle({
      slug: legacyFixtureSlug,
      ko: sources.ko,
      en: "",
      images: [],
      headSha: null,
    })
    if (!result.ok) throw new Error(JSON.stringify(result.issues))
    expect(result.migratedLegacy).toBe(true)
    expect(result.bundle.en.blocks).toEqual(
      result.bundle.ko.blocks.map((block) => ({ id: block.id, markdown: "" })),
    )
    expect(result.bundle.en.frontMatter.title).toBe("")
    expect(result.bundle.en.frontMatter.authors).toEqual(["Fixture Author"])
  })

  test("rejects slugs outside the contract", async () => {
    const result = await parseBundle({
      slug: "TPU-deep-dive",
      ko: "",
      en: "",
      images: [],
      headSha: null,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]?.code).toBe("legacy")
  })

  test("creates a new bundle with archetype-style front matter and a shared empty block", async () => {
    const bundle = await createBundle(
      {
        slug: "new-post",
        title: { ko: "새 글", en: "New post" },
        date: "2026-10-27T10:00:00+09:00",
        authors: ["Donghyeon Choi"],
        category: "Engineering Culture",
        tags: ["editor"],
        series: "Series",
        seriesIndex: 1,
        cover: { image: "images/cover.webp", alt: "Cover" },
        draft: false,
      },
      ["first"],
    )
    expect(bundle.ko.rawFrontMatter).toBe(
      'date: "2026-10-27T10:00:00+09:00"\ntitle: "새 글"\ncover:\n  image: "images/cover.webp"\n  alt: "Cover"\n  caption: ""\n  relative: true\nauthors: ["Donghyeon Choi"]\ntags: ["editor"]\ncategories: ["Engineering Culture"]\nseries: ["Series"]\nseries_idx: 1\ncomments: true\n',
    )
    expect(bundle.en.frontMatter.title).toBe("New post")
    expect(bundle.ko.blocks).toEqual([{ id: "first", markdown: "" }])
    expect(bundle.en.blocks).toEqual([{ id: "first", markdown: "" }])
    const serialized = await serializeBundle(bundle)
    expect(serialized.snapshotHash).toBe(bundle.snapshotHash)
    expect(serialized.files[0]).toEqual({
      path: bundle.ko.path,
      encoding: "utf-8",
      content: `---\n${bundle.ko.rawFrontMatter}---\n\n<!-- b:first -->\n\n`,
    })
  })

  test("serializes pending images as base64 and hashes them like Git blobs", async () => {
    const [fixture] = fixtureBundles
    if (!fixture) throw new Error("Missing fixture")
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" })
    const bundle = {
      ...fixture,
      images: [{ status: "pending" as const, path: "images/p.webp", blob, mime: "image/webp" }],
    }
    const serialized = await serializeBundle(bundle)
    expect(serialized.files[2]).toEqual({
      path: "content/posts/image-layouts/images/p.webp",
      encoding: "base64",
      content: "AQID",
    })
    const sha = new Bun.CryptoHasher("sha1")
      .update("blob 3\0")
      .update(new Uint8Array([1, 2, 3]))
      .digest("hex")
    const tuples = [
      [bundle.ko.path, "utf-8", serializeLanguage(bundle.ko).source],
      [bundle.en.path, "utf-8", serializeLanguage(bundle.en).source],
      ["content/posts/image-layouts/images/p.webp", "git-blob-sha", sha],
    ].sort((left, right) => ((left[0] ?? "") < (right[0] ?? "") ? -1 : 1))
    expect(serialized.snapshotHash).toBe(
      new Bun.CryptoHasher("sha256").update(JSON.stringify(tuples)).digest("hex"),
    )
  })
})

describe("validation", () => {
  test("allows unfinished translation on save but blocks review and publish", () => {
    const [fixture] = fixtureBundles
    if (!fixture) throw new Error("Missing fixture")
    const draft = structuredClone(fixture)
    const first = draft.en.blocks[0]
    if (!first) throw new Error("Missing block")
    first.markdown = ""
    draft.ko.frontMatter.authors = []
    draft.ko.blocks.push({ id: "x", markdown: "![missing](images/missing.png)" })
    draft.en.blocks.push({ id: "x", markdown: "ok" })
    expect(validateBundle(draft, "save")).toEqual([])
    const review = validateBundle(draft, "review")
    expect(review.map((issue) => String(issue.code)).sort()).toEqual(
      ["emptyTranslation", "frontMatter", "frontMatter", "frontMatter", "image"].sort(),
    )
    expect(review.find((issue) => issue.code === "emptyTranslation")).toEqual({
      code: "emptyTranslation",
      language: "en",
      blockId: "image-layouts-1",
      message: "1번째 블록의 영어 번역이 비어 있습니다.",
    })
    expect(
      review.some((issue) => issue.message.includes("허용 목록에 없습니다: Engineering")),
    ).toBe(true)
    expect(validateBundle(draft, "publish").length).toBe(review.length + 2)
  })

  test("flags oversized pending images and unpaired IDs", () => {
    const [fixture] = fixtureBundles
    if (!fixture) throw new Error("Missing fixture")
    const broken = structuredClone(fixture)
    const first = broken.en.blocks[0]
    if (!first) throw new Error("Missing block")
    first.id = "other"
    const issues = validateBundle(
      {
        ...broken,
        images: [
          {
            status: "pending",
            path: "images/big.webp",
            blob: new Blob([new Uint8Array(1_048_577)], { type: "image/webp" }),
            mime: "image/webp",
          },
        ],
      },
      "save",
    )
    expect(issues.some((issue) => issue.code === "pairing")).toBe(true)
    expect(validateBundle(fixture, "review").some((issue) => issue.message.includes("초과"))).toBe(
      false,
    )
    expect(
      validateBundle(
        {
          ...fixture,
          images: [
            {
              status: "pending",
              path: "images/big.webp",
              blob: new Blob([new Uint8Array(1_048_577)], { type: "image/webp" }),
              mime: "image/webp",
            },
          ],
        },
        "review",
      ).some((issue) => issue.message.includes("초과")),
    ).toBe(true)
  })
})
