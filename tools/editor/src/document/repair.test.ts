import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { ParseBundleInput } from "../shared/onsite/document"
import { fixtureBundles } from "../shared/onsite/fixtures"
import { parseBundle, serializeBundle, validateBundle } from "./codec"
import {
  applyRepair,
  applyRepairToBlocks,
  pairUnpaired,
  parseForEditing,
  repairStatus,
  type UnpairedBundle,
} from "./repair"

function repositoryRoot(): string {
  let candidate = import.meta.dir
  while (dirname(candidate) !== candidate) {
    if (existsSync(join(candidate, "hugo.yaml")) && existsSync(join(candidate, "content/posts"))) {
      return candidate
    }
    candidate = dirname(candidate)
  }
  throw new Error("Hugo repository root not found")
}

let sandbox = ""

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "hyperaccel-repair-"))
  for (const slug of ["crafting-compilers", "jalapeno-shock"]) {
    cpSync(join(repositoryRoot(), "content/posts", slug), join(sandbox, slug), { recursive: true })
  }
})

afterAll(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true })
})

async function inputFor(slug: string): Promise<ParseBundleInput> {
  const korean = existsSync(join(sandbox, slug, "index.md")) ? "index.md" : "index.ko.md"
  return {
    slug,
    ko: await Bun.file(join(sandbox, slug, korean)).text(),
    en: await Bun.file(join(sandbox, slug, "index.en.md")).text(),
    images: [],
    headSha: null,
  }
}

async function unpairedFor(slug: string): Promise<UnpairedBundle> {
  const parsed = await parseForEditing(await inputFor(slug))
  if (parsed.kind !== "repair") throw new Error(`expected repair, got ${parsed.kind}`)
  return parsed.unpaired
}

describe("repair operations", () => {
  test("insert, remove, merge and move act on one language only", () => {
    const blocks = ["a", "b", "c"]
    expect(applyRepairToBlocks(blocks, { type: "insert", language: "ko", index: 1 })).toEqual([
      "a",
      "",
      "b",
      "c",
    ])
    expect(applyRepairToBlocks(blocks, { type: "insert", language: "ko", index: 99 })).toEqual([
      "a",
      "b",
      "c",
      "",
    ])
    expect(
      applyRepairToBlocks(["a", "", "b"], { type: "remove", language: "ko", index: 1 }),
    ).toEqual(["a", "b"])
    expect(applyRepairToBlocks(blocks, { type: "remove", language: "ko", index: 1 })).toBe(blocks)
    expect(applyRepairToBlocks(blocks, { type: "merge", language: "ko", index: 1 })).toEqual([
      "a",
      "b\n\nc",
    ])
    expect(
      applyRepairToBlocks(["a", "", "c"], { type: "merge", language: "ko", index: 1 }),
    ).toEqual(["a", "c"])
    expect(applyRepairToBlocks(blocks, { type: "merge", language: "ko", index: 2 })).toBe(blocks)
    expect(
      applyRepairToBlocks(blocks, { type: "move", language: "ko", index: 0, direction: 1 }),
    ).toEqual(["b", "a", "c"])
    expect(
      applyRepairToBlocks(blocks, { type: "move", language: "ko", index: 0, direction: -1 }),
    ).toBe(blocks)
  })

  test("parseForEditing distinguishes paired, repairable and broken input", async () => {
    const [fixture] = fixtureBundles
    if (!fixture) throw new Error("Missing fixture")
    const paired = await parseForEditing({
      slug: fixture.slug,
      ko: await Bun.file(
        `${import.meta.dir}/../shared/onsite/fixtures/${fixture.slug}/index.md`,
      ).text(),
      en: await Bun.file(
        `${import.meta.dir}/../shared/onsite/fixtures/${fixture.slug}/index.en.md`,
      ).text(),
      images: fixture.images,
      headSha: fixture.headSha,
    })
    expect(paired.kind).toBe("bundle")
    const broken = await parseForEditing({
      slug: "Bad Slug",
      ko: "",
      en: "",
      images: [],
      headSha: null,
    })
    expect(broken.kind).toBe("error")
  })
})

describe("repair of real mismatched posts (temp copies)", () => {
  test("crafting-compilers: an empty block appended to English aligns 22/21 and pairs with ordered IDs", async () => {
    const unpaired = await unpairedFor("crafting-compilers")
    expect(repairStatus(unpaired)).toEqual({ ko: 22, en: 21, rows: 22, aligned: false })
    expect((await pairUnpaired(unpaired)).ok).toBe(false)

    const repaired = applyRepair(unpaired, { type: "insert", language: "en", index: 21 })
    expect(repairStatus(repaired)).toEqual({ ko: 22, en: 22, rows: 22, aligned: true })
    expect(unpaired.en.blocks).toHaveLength(21)

    const result = await pairUnpaired(repaired)
    if (!result.ok) throw new Error(JSON.stringify(result.issues))
    expect(result.migratedLegacy).toBe(true)
    expect(result.bundle.ko.blocks.map((block) => block.id)).toEqual(
      Array.from({ length: 22 }, (_, index) => `crafting-compilers-${index + 1}`),
    )
    expect(result.bundle.en.blocks.map((block) => block.id)).toEqual(
      result.bundle.ko.blocks.map((block) => block.id),
    )
    expect(result.bundle.en.blocks[21]).toEqual({ id: "crafting-compilers-22", markdown: "" })
    expect(result.bundle.ko.blocks[21]?.markdown.startsWith("이번 글에서는")).toBe(true)
    expect(result.bundle.ko.rawFrontMatter).toBe(unpaired.ko.rawFrontMatter)
    expect(
      validateBundle(result.bundle, "review").filter((issue) => issue.code === "emptyTranslation"),
    ).toEqual([
      {
        code: "emptyTranslation",
        language: "en",
        blockId: "crafting-compilers-22",
        message: "22번째 블록의 영어 번역이 비어 있습니다.",
      },
    ])
    expect(validateBundle(result.bundle, "publish").some((issue) => issue.code === "pairing")).toBe(
      false,
    )

    const serialized = await serializeBundle(result.bundle)
    const [koFile, enFile] = serialized.files
    if (koFile?.encoding !== "utf-8" || enFile?.encoding !== "utf-8") throw new Error("utf-8")
    const again = await parseBundle({
      slug: "crafting-compilers",
      ko: koFile.content,
      en: enFile.content,
      images: [],
      headSha: null,
    })
    if (!again.ok) throw new Error(JSON.stringify(again.issues))
    expect(again.migratedLegacy).toBe(false)
    expect(again.bundle.ko.blocks).toEqual(result.bundle.ko.blocks)
    expect(again.bundle.en.blocks).toEqual(result.bundle.en.blocks)
  })

  test("jalapeno-shock: merging the split English image back into its paragraph aligns 55/56", async () => {
    const unpaired = await unpairedFor("jalapeno-shock")
    expect(repairStatus(unpaired)).toEqual({ ko: 55, en: 56, rows: 56, aligned: false })
    const image = unpaired.en.blocks[7] ?? ""
    expect(image.startsWith("![Per-user token throughput")).toBe(true)
    const paragraph = unpaired.en.blocks[6] ?? ""
    const merged = applyRepair(unpaired, { type: "merge", language: "en", index: 6 })
    expect(repairStatus(merged).aligned).toBe(true)
    expect(merged.en.blocks[6]).toBe(`${paragraph}\n\n${image}`)
    expect(merged.ko).toBe(unpaired.ko)
    const result = await pairUnpaired(merged)
    if (!result.ok) throw new Error(JSON.stringify(result.issues))
    expect(result.bundle.en.blocks).toHaveLength(55)
    expect(result.bundle.en.blocks[6]?.id).toBe("jalapeno-shock-7")
    expect(validateBundle(result.bundle, "review").some((issue) => issue.code === "pairing")).toBe(
      false,
    )
  })

  test("moving a block in one language keeps the other language untouched", async () => {
    const unpaired = await unpairedFor("crafting-compilers")
    const moved = applyRepair(unpaired, { type: "move", language: "ko", index: 0, direction: 1 })
    expect(moved.ko.blocks[0]).toBe(unpaired.ko.blocks[1] ?? "")
    expect(moved.ko.blocks[1]).toBe(unpaired.ko.blocks[0] ?? "")
    expect(moved.en).toBe(unpaired.en)
    expect(applyRepair(unpaired, { type: "move", language: "ko", index: 0, direction: -1 })).toBe(
      unpaired,
    )
  })
})
