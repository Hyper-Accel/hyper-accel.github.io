import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildImageName,
  findRepositoryRoot,
  patchFrontmatterScalar,
  resolveContentPath,
  splitMarkdownDocument,
} from "./content"

const temporaryRoots: string[] = []

describe("splitMarkdownDocument", () => {
  test("keeps the exact frontmatter and body slices", () => {
    const source = "---\ntitle: '원본 제목'\ntags: [AI]\n---\n\n첫 문단입니다.\n"
    const result = splitMarkdownDocument(source)

    expect(result.frontmatter).toBe("title: '원본 제목'\ntags: [AI]\n")
    expect(result.body).toBe("첫 문단입니다.\n")
  })

  test("rejects content without YAML frontmatter", () => {
    expect(() => splitMarkdownDocument("# 제목\n")).toThrow()
  })
})

describe("patchFrontmatterScalar", () => {
  test("changes only the requested scalar line", () => {
    const source = "date: '2026-08-18'\ntitle: '기존 제목'\ntags: [AI]\n"

    expect(patchFrontmatterScalar(source, "title", "새 제목")).toBe(
      "date: '2026-08-18'\ntitle: \"새 제목\"\ntags: [AI]\n",
    )
  })
})

describe("resolveContentPath", () => {
  test("accepts an index markdown file inside content/posts", () => {
    const result = resolveContentPath("/repo", "content/posts/example/index.ko.md")
    expect(result).toBe("/repo/content/posts/example/index.ko.md")
  })

  test("rejects path traversal and non-index files", () => {
    expect(() => resolveContentPath("/repo", "../../secret.md")).toThrow()
    expect(() => resolveContentPath("/repo", "content/posts/example/note.md")).toThrow()
  })
})

describe("buildImageName", () => {
  test("creates a deterministic safe image path", () => {
    expect(buildImageName("image/png", new Date("2026-08-27T03:04:05Z"), "a1b2")).toBe(
      "images/pasted-20260827-030405-a1b2.png",
    )
  })

  test("rejects unsupported clipboard file types", () => {
    expect(() => buildImageName("text/plain", new Date(), "a1b2")).toThrow()
  })
})

describe("findRepositoryRoot", () => {
  test("finds the Hugo root from a bundled server directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "editor-root-test-"))
    temporaryRoots.push(root)
    const serverDirectory = join(root, "tools/editor/dist-server")
    await mkdir(join(root, "content/posts"), { recursive: true })
    await mkdir(serverDirectory, { recursive: true })
    await Bun.write(join(root, "hugo.yaml"), "baseURL: https://example.com\n")

    expect(findRepositoryRoot(serverDirectory, serverDirectory)).toBe(root)

    await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })))
  })
})
