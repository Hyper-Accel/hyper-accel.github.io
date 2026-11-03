import { afterEach, expect, test } from "bun:test"
import { cp, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { z } from "zod"
import { annotation, changedSlugs } from "./validate-posts"

const fixtureRoot = resolve(import.meta.dir, "fixtures")
const repository = resolve(import.meta.dir, "../../..")
const script = resolve(import.meta.dir, "validate-posts.ts")
const sandboxes: string[] = []
afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function fixture(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "editor-ci-"))
  sandboxes.push(root)
  await mkdir(resolve(root, "content/authors/Fixture Author"), { recursive: true })
  await mkdir(resolve(root, "content/posts"), { recursive: true })
  await cp(resolve(fixtureRoot, "passing"), resolve(root, "content/posts/example"), {
    recursive: true,
  })
  return root
}

async function run(root: string, args: readonly string[] = ["--all", "--strict"]) {
  const child = Bun.spawn(["bun", script, "--root", root, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    // A real checkout supplies only history, never fixture content; no test commits are needed.
    env: { ...process.env, GIT_DIR: resolve(repository, ".git"), GIT_WORK_TREE: repository },
  })
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout, stderr, status }
}

const failures = z
  .array(
    z.object({
      name: z.string(),
      code: z.string(),
      file: z.string(),
      delete: z.boolean().optional(),
      emptyBody: z.boolean().optional(),
      find: z.string().optional(),
      replace: z.string().optional(),
      append: z.string().optional(),
      bytes: z.number().int().optional(),
    }),
  )
  .parse(await Bun.file(resolve(fixtureRoot, "failing.json")).json())

for (const bad of failures) {
  test(`rejects ${bad.name} when validating its bad fixture`, async () => {
    // Given: mutate exactly the input described by the checked-in failure fixture.
    const root = await fixture()
    const path = resolve(root, "content/posts/example", bad.file)
    if (bad.delete) await rm(path)
    else if (bad.bytes) await writeFile(path, new Uint8Array(bad.bytes))
    else {
      const source = await Bun.file(path).text()
      if (bad.find !== undefined) expect(source.includes(bad.find)).toBe(true)
      const edited = bad.emptyBody
        ? `${source.split("\n---\n")[0]}\n---\n<!-- b:intro -->\n`
        : bad.find !== undefined
          ? source.replace(bad.find, bad.replace ?? "")
          : source
      await writeFile(path, edited + (bad.append ?? ""))
    }
    // When: run the actual CLI, not a mock validator.
    const result = await run(root)
    // Then: the expected machine-readable failure is emitted and publication fails.
    expect(result.status).toBe(1)
    expect(result.stdout).toContain(`(${bad.code})::`)
    expect(result.stdout).toContain("::error ")
  })
}

test("accepts a complete publishable bundle when both languages match", async () => {
  // Given
  const root = await fixture()
  // When
  const result = await run(root)
  // Then
  expect(result.status).toBe(0)
  expect(result.stdout).not.toContain("::error ")
})

test("accepts index.ko.md when it is the Korean page", async () => {
  // Given
  const root = await fixture()
  await rename(
    resolve(root, "content/posts/example/index.md"),
    resolve(root, "content/posts/example/index.ko.md"),
  )
  // When
  const result = await run(root)
  // Then
  expect(result.status).toBe(0)
})

test("accepts a one MiB image when exactly at the size limit", async () => {
  // Given
  const root = await fixture()
  await writeFile(
    resolve(root, "content/posts/example/images/pixel.svg"),
    new Uint8Array(1_048_576),
  )
  // When
  const result = await run(root)
  // Then
  expect(result.status).toBe(0)
})

test("reports legacy violations without failing when the bundle is unchanged", async () => {
  // Given
  const root = await fixture()
  await rm(resolve(root, "content/posts/example/index.en.md"))
  // When
  const result = await run(root, ["--all", "--base", "HEAD", "--head", "HEAD"])
  // Then
  expect(result.status).toBe(0)
  expect(result.stdout).toContain("::warning ")
  expect(result.stdout).not.toContain("::error ")
})

test("fails closed when the diff base cannot be resolved", async () => {
  // Given
  const root = await fixture()
  // When
  const result = await run(root, ["--base", "refs/heads/nonexistent-editor-ci-fixture"])
  // Then
  expect(result.status).toBe(1)
  expect(result.stdout).toContain("(configuration)::")
})

test("selects bundles when any asset or deleted translation changed", () => {
  // Given
  const paths = [
    "content/posts/first/images/a.svg",
    "content/posts/first/index.en.md",
    "content/posts/second/index.md",
    "content/posts/AGENTS.md",
  ]
  // When
  const changed = changedSlugs(paths)
  // Then
  expect([...changed]).toEqual(["first", "second"])
})

test("escapes annotation control characters when paths or messages contain them", () => {
  // Given
  const finding = {
    check: "ko-en",
    code: "images",
    file: "a,b:c%file\n.md",
    message: "first\n::error::injected",
  } as const
  // When
  const result = annotation(finding, true)
  // Then
  expect(result.split("\n")).toHaveLength(1)
  expect(result).toContain("file=a%2Cb%3Ac%25file%0A.md,")
  expect(result).toContain("first%0A::error::injected")
})
