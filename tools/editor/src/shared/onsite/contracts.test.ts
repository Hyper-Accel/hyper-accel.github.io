import { describe, expect, test } from "bun:test"
import { postBundleSchema } from "./document"
import { draftSnapshotSchema } from "./drafts"
import { fixtureBundles } from "./fixtures"
import { rangeAnchorSchema } from "./review"

describe("on-site boundaries", () => {
  test("rejects mismatched language IDs while allowing unfinished translation", () => {
    const original = fixtureBundles[0]
    if (!original) throw new Error("Missing fixture")
    const incomplete = structuredClone(original)
    const first = incomplete.en.blocks[0]
    if (!first) throw new Error("Missing block")
    first.markdown = ""
    expect(postBundleSchema.safeParse(incomplete).success).toBe(true)
    first.id = "wrong-pair"
    expect(postBundleSchema.safeParse(incomplete).success).toBe(false)
  })

  test("preserves pending image bytes through structured clone draft boundary", async () => {
    const original = fixtureBundles[0]
    if (!original) throw new Error("Missing fixture")
    const snapshot = {
      version: 1,
      key: { owner: "Hyper-Accel", repository: "blog", userId: 1, slug: original.slug },
      bundle: {
        ...original,
        images: [
          {
            status: "pending",
            path: "images/pasted.png",
            blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
            mime: "image/png",
          },
        ],
      },
      cursor: {
        language: "ko" as const,
        anchor: { blockId: "image-layouts-1", offset: 2 },
        focus: { blockId: "image-layouts-1", offset: 4 },
        scrollTop: 100,
      },
      savedAt: 1,
      sequence: 1,
    }
    const restored = draftSnapshotSchema.parse(structuredClone(snapshot))
    const image = restored.bundle.images[0]
    if (image?.status !== "pending") throw new Error("Pending image was lost")
    expect(Array.from(new Uint8Array(await image.blob.arrayBuffer()))).toEqual([1, 2, 3])
    expect(restored.cursor).toEqual(snapshot.cursor)
  })

  test("accepts cross-block selection but rejects reversed single-block offsets", () => {
    const anchor = {
      version: 1,
      blockIds: ["a", "b"],
      startOffset: 20,
      endOffset: 3,
      quotedText: "end\nnew",
      markdown: {
        path: "content/posts/example/index.md",
        start_line: 10,
        line: 15,
        side: "RIGHT",
        start_side: "RIGHT",
      },
      snapshotHash: "a".repeat(64),
    }
    expect(rangeAnchorSchema.safeParse(anchor).success).toBe(true)
    expect(rangeAnchorSchema.safeParse({ ...anchor, blockIds: ["a"] }).success).toBe(false)
    expect(
      rangeAnchorSchema.safeParse({
        ...anchor,
        markdown: { ...anchor.markdown, start_line: 16 },
      }).success,
    ).toBe(false)
  })

  test.each(fixtureBundles)("fixture $slug matches its serialized snapshot", async (bundle) => {
    const tuples: string[][] = []
    for (const language of ["ko", "en"] as const) {
      const document = bundle[language]
      const source = await Bun.file(
        `${import.meta.dir}/fixtures/${bundle.slug}/index${language === "en" ? ".en" : ""}.md`,
      ).text()
      const expected = `---\n${document.rawFrontMatter}---\n\n${document.blocks
        .map((block) => `<!-- b:${block.id} -->\n${block.markdown}`)
        .join("\n\n")}\n`
      expect(source).toBe(expected)
      tuples.push([document.path, "utf-8", source])
    }
    for (const image of bundle.images) {
      const bytes = await Bun.file(
        `${import.meta.dir}/fixtures/${bundle.slug}/${image.path}`,
      ).arrayBuffer()
      const sha = new Bun.CryptoHasher("sha1")
        .update(`blob ${bytes.byteLength}\0`)
        .update(bytes)
        .digest("hex")
      if (image.status !== "committed") throw new Error("Fixture image must be committed")
      expect(image.sha).toBe(sha)
      tuples.push([`content/posts/${bundle.slug}/${image.path}`, "git-blob-sha", sha])
    }
    tuples.sort((left, right) => {
      const a = left[0] ?? ""
      const b = right[0] ?? ""
      return a < b ? -1 : a > b ? 1 : 0
    })
    expect(new Bun.CryptoHasher("sha256").update(JSON.stringify(tuples)).digest("hex")).toBe(
      bundle.snapshotHash,
    )
  })
})
