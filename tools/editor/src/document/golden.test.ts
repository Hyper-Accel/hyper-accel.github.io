import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import type { Language } from "../shared/onsite/document"
import { markerLine } from "./blocks"
import {
  languagePath,
  parseBundle,
  parseLanguageSource,
  serializeBundle,
  serializeLanguage,
} from "./codec"
import { patchFrontMatter } from "./front-matter"

/*
 * Golden round trip over every real post. Output may differ from input only by:
 * 1. Block separators: any run of blank or whitespace-only lines between top-level blocks
 *    becomes exactly one empty line followed by the block's `<!-- b:ID -->` marker line.
 * 2. Exactly one empty line between the closing `---` and the first marker.
 * 3. Leading blank lines before the first block are dropped; the file ends with exactly one `\n`.
 * 4. Blank lines between a marker and its block are dropped (marked input only).
 * 5. Trailing blank lines inside the front matter are dropped; CRLF becomes LF; a BOM is removed.
 * Every byte inside a block (trailing spaces, hard breaks, whitespace-only lines inside fences,
 * lists and shortcodes) and the YAML text itself are preserved.
 */

const PREFIX =
  /^(?:\n)?(?:[ \t]*\n)*(?:<!-- b:[A-Za-z0-9][A-Za-z0-9_-]* -->[ \t]*\n(?:[ \t]*\n)*)?$/
const TRAILING = /^(?:\n(?:[ \t]*\n)*)?[ \t]*$/

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

const root = repositoryRoot()
const postsRoot = join(root, "content/posts")
const slugs = readdirSync(postsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
const files = slugs.flatMap((slug) =>
  ["index.md", "index.ko.md", "index.en.md"]
    .filter((name) => existsSync(join(postsRoot, slug, name)))
    .map((name) => ({ slug, name, path: join(postsRoot, slug, name) })),
)

function canonical(text: string): string {
  let result = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (/^[ \t]*$/.test(line) ? "" : line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^---\n([\s\S]*?)\n---\n+/, "---\n$1\n---\n\n")
    .replace(/\n+$/, "\n")
  if (!result.endsWith("\n")) result += "\n"
  return result
}

describe("golden round trip of every post file", () => {
  expect(files.length).toBeGreaterThan(0)

  test.each(files)("$slug/$name", async ({ slug, name, path }) => {
    const source = await Bun.file(path).text()
    const parsed = parseLanguageSource(source)
    if (!parsed.ok) throw new Error(parsed.message)
    const { head, rawFrontMatter, frontMatter, segments, trailing } = parsed.value

    const rebuilt = head + segments.map((s) => s.prefix + s.markdown).join("") + trailing
    expect(rebuilt).toBe(source)
    for (const segment of segments) expect(segment.prefix).toMatch(PREFIX)
    expect(trailing).toMatch(TRAILING)
    expect(
      head.replace(/(?:\n[ \t]*)+\n---[ \t]*\n$/, "\n---\n").replace(/^---[ \t]*\n/, "---\n"),
    ).toBe(`---\n${rawFrontMatter}---\n`)

    expect(patchFrontMatter(rawFrontMatter, frontMatter)).toBe(rawFrontMatter)

    const language: Language = name === "index.en.md" ? "en" : "ko"
    const blocks = segments.map((segment, index) => ({
      id: segment.id ?? `${slug}-${index + 1}`,
      markdown: segment.markdown,
    }))
    const output = serializeLanguage({
      language,
      path: languagePath(slug, language),
      frontMatter,
      rawFrontMatter,
      blocks,
    }).source
    const expected =
      `---\n${rawFrontMatter}---\n` +
      (blocks.length === 0
        ? ""
        : `\n${blocks.map((block) => `${markerLine(block.id)}\n${block.markdown}`).join("\n\n")}\n`)
    expect(output).toBe(expected)
    expect(canonical(output.replace(/^<!-- b:[A-Za-z0-9][A-Za-z0-9_-]* -->\n/gm, ""))).toBe(
      canonical(source),
    )
  })
})

describe("bundle round trip of every post", () => {
  test.each(slugs.filter((slug) => existsSync(join(postsRoot, slug, "index.en.md"))))(
    "%s",
    async (slug) => {
      const korean = existsSync(join(postsRoot, slug, "index.md")) ? "index.md" : "index.ko.md"
      const ko = await Bun.file(join(postsRoot, slug, korean)).text()
      const en = await Bun.file(join(postsRoot, slug, "index.en.md")).text()
      const result = await parseBundle({ slug, ko, en, images: [], headSha: null })
      if (!result.ok) {
        for (const issue of result.issues) expect(["pairing", "legacy"]).toContain(issue.code)
        return
      }
      const serialized = await serializeBundle(result.bundle)
      expect(serialized.snapshotHash).toBe(result.bundle.snapshotHash)
      const [koFile, enFile] = serialized.files
      if (koFile?.encoding !== "utf-8" || enFile?.encoding !== "utf-8") {
        throw new Error("Markdown files must be UTF-8")
      }
      const again = await parseBundle({
        slug,
        ko: koFile.content,
        en: enFile.content,
        images: [],
        headSha: null,
      })
      if (!again.ok) throw new Error(JSON.stringify(again.issues))
      expect(again.migratedLegacy).toBe(false)
      expect(again.bundle).toEqual(result.bundle)
    },
  )
})
