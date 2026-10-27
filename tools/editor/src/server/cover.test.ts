import { afterEach, expect, spyOn, test } from "bun:test"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { parse } from "yaml"
import * as contracts from "../shared/contracts"
import { readPost, savePost } from "./content"
import * as coverModule from "./cover"
import { ContentError } from "./errors"

test("cover edits preserve exact unrelated YAML and per-field comments", () => {
  const source =
    "# header\ntitle: 'Original' # title\ncover: # cover\n  image: old.png # image\n  alt: old # alt\n  relative: false # relative\n  caption: 'Keep: caption' # caption\n  hidden: true # flag\ntags: [AI] # tags\n"
  const result = coverModule.patchCoverFrontmatter(source, {
    image: "images/new.png",
    alt: "새 이미지",
    relative: true,
  })
  expect(result).toBe(
    source
      .replace("old.png", '"images/new.png"')
      .replace("alt: old", 'alt: "새 이미지"')
      .replace("relative: false", "relative: true"),
  )
  const cleared = coverModule.patchCoverFrontmatter(result, null)
  expect(parse(cleared).cover).toEqual({
    image: "",
    alt: "",
    relative: true,
    caption: "Keep: caption",
    hidden: true,
  })
  expect(cleared).toContain('image: "" # image')
  expect(cleared).toContain('alt: "" # alt')
})

test("cover edits add absent fields in block/flow mappings without touching flags", () => {
  for (const source of [
    "title: Original\n",
    "title: Original\ncover: {hidden: true} # cover\n",
    "title: Original\ncover:\n  caption: keep # caption\ntags: [AI]\n",
  ]) {
    const result = coverModule.patchCoverFrontmatter(source, {
      image: "new.png",
      alt: "new",
      relative: true,
    })
    expect(parse(result).cover).toMatchObject({ image: "new.png", alt: "new", relative: true })
    expect(result).toContain("title: Original\n")
    if (source.includes("hidden")) expect(result).toContain("hidden: true")
    if (source.includes("caption"))
      expect(result).toContain("  caption: keep # caption\ntags: [AI]\n")
  }
  expect(coverModule.patchCoverFrontmatter("title: Original\n", null)).toBe("title: Original\n")
})

test("malformed or aliased cover metadata is rejected without clobbering it", () => {
  for (const source of [
    "cover: legacy\n",
    "cover: {image: [bad]}\n",
    "cover: {image: a.png, image: b.png}\n",
    "shared: &shared {image: a.png}\ncover: *shared\n",
  ]) {
    expect(() =>
      coverModule.patchCoverFrontmatter(source, { image: "new.png", alt: "", relative: true }),
    ).toThrow()
  }
})

test("cover upload checks real PNG bytes and writes unique assets without changing frontmatter", async () => {
  const root = fixture()
  const original = await Bun.file(join(root, path)).text()
  const image = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "same.png", {
    type: "image/png",
  })
  const first = await coverModule.saveCoverImage(path, image, root)
  const second = await coverModule.saveCoverImage(path, image, root)
  expect(first.markdownPath).toMatch(/^images\/cover-\d{8}-\d{6}-[a-f0-9-]+\.png$/)
  expect(second.markdownPath).not.toBe(first.markdownPath)
  expect(await Bun.file(join(root, "content/posts/example", first.markdownPath)).bytes()).toEqual(
    await image.bytes(),
  )
  expect(first.previewUrl).toBe(
    `/api/cover-media?path=${encodeURIComponent(path)}&src=${encodeURIComponent(first.markdownPath)}`,
  )
  expect(await Bun.file(join(root, path)).text()).toBe(original)
})

test("invalid, oversized, MIME-spoofed and signature-spoofed uploads leave no files", async () => {
  for (const image of [
    new File([new Uint8Array(1024 * 1024 + 1)], "large.png", { type: "image/png" }),
    new File(["fake"], "fake.png", { type: "image/png" }),
    new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "fake.jpg", {
      type: "image/jpeg",
    }),
    new File(["<svg/>"], "image.svg", { type: "image/svg+xml" }),
    new File([], "empty.png", { type: "image/png" }),
    new File(["GIF89a"], "fake.gif", { type: "text/plain" }),
  ]) {
    const root = fixture()
    const original = await Bun.file(join(root, path)).text()
    await expect(coverModule.saveCoverImage(path, image, root)).rejects.toThrow()
    expect(existsSync(join(root, "content/posts/example/images"))).toBe(false)
    expect(await Bun.file(join(root, path)).text()).toBe(original)
  }
})

test("all supported signatures select the canonical extension, including exactly 1MiB", async () => {
  for (const [mime, bytes, extension] of [
    ["image/jpeg", new Uint8Array([255, 216, 255]), "jpg"],
    ["image/gif", new TextEncoder().encode("GIF87a"), "gif"],
    ["image/gif", new TextEncoder().encode("GIF89a"), "gif"],
    ["image/webp", new TextEncoder().encode("RIFF1234WEBP"), "webp"],
  ] as const) {
    const root = fixture()
    const saved = await coverModule.saveCoverImage(
      path,
      new File([bytes], "untrusted.svg", { type: mime }),
      root,
    )
    expect(saved.markdownPath.endsWith(`.${extension}`)).toBe(true)
  }
  const bytes = new Uint8Array(1024 * 1024)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  const root = fixture()
  const saved = await coverModule.saveCoverImage(
    path,
    new File([bytes], "limit.png", { type: "image/png" }),
    root,
  )
  expect(Bun.file(join(root, "content/posts/example", saved.markdownPath)).size).toBe(1024 * 1024)
})

test("uploads reject escaping bundle and images symlinks", async () => {
  const image = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "a.png", {
    type: "image/png",
  })
  for (const link of ["bundle", "images"]) {
    const root = fixture()
    const outside = fixture()
    const target = join(root, "content/posts/example", ...(link === "images" ? ["images"] : []))
    if (link === "bundle") rmSync(target, { recursive: true })
    symlinkSync(join(outside, "content/posts/example"), target)
    await expect(coverModule.saveCoverImage(path, image, root)).rejects.toThrow()
    expect(readdirSync(join(outside, "content/posts/example"))).toEqual(["index.md"])
  }
})

test("local previews prefer the bundle and fall back to static, independent of legacy relative flags", () => {
  const root = fixture("title: Original\ncover: {image: images/a.png, relative: false}\n")
  mkdirSync(join(root, "content/posts/example/images"))
  mkdirSync(join(root, "static/images"), { recursive: true })
  writeFileSync(join(root, "content/posts/example/images/a.png"), "bundle")
  writeFileSync(join(root, "static/images/a.png"), "static")
  writeFileSync(join(root, "static/images/static.png"), "static")
  expect(coverModule.resolveCoverMediaPath(path, "images/a.png", root)).toBe(
    join(root, "content/posts/example/images/a.png"),
  )
  expect(coverModule.resolveCoverMediaPath(path, "/images/a.png", root)).toBe(
    join(root, "static/images/a.png"),
  )
  expect(coverModule.resolveCoverMediaPath(path, "images/static.png", root)).toBe(
    join(root, "static/images/static.png"),
  )
})

test("local previews reject remote URLs, traversal, unsafe schemes, extensions and escaping symlinks", () => {
  const root = fixture()
  const outside = fixture()
  mkdirSync(join(root, "static/images"), { recursive: true })
  writeFileSync(join(outside, "secret.png"), "outside")
  symlinkSync(join(outside, "secret.png"), join(root, "static/images/escape.png"))
  symlinkSync(outside, join(root, "content/posts/example/escape"))
  for (const source of [
    "../secret.png",
    "images/../../secret.png",
    "images\\\\secret.png",
    "%2e%2e/secret.png",
    "//example.com/a.png",
    "https://example.com/a.png",
    "data:image/png;base64,eA==",
    "javascript:alert(1)",
    "file:///secret.png",
    "notes.md",
    "/images/escape.png",
    "escape/secret.png",
    "escape/missing.png",
  ]) {
    expect(() => coverModule.resolveCoverMediaPath(path, source, root)).toThrow()
  }
})

test("normal save roundtrips cover changes, omission and clear while retaining body, flags and comments", async () => {
  const root = fixture(
    "# header\ntitle: Original # title\ncover: {image: old.png, alt: old, relative: false, caption: keep, hidden: true} # cover\ntags: [AI] # tags\n",
  )
  const original = await Bun.file(join(root, path)).text()
  writeFileSync(join(root, "content/posts/example/old.png"), "shared asset")
  const post = await readPost(path, root)
  const cover = { image: "https://example.com/new.png", alt: "new", relative: false }
  const revision = await savePost(path, "Changed", post.body, post.revision, cover, root)
  const changed = await Bun.file(join(root, path)).text()
  expect(changed).toBe(
    original
      .replace("title: Original", 'title: "Changed"')
      .replace("image: old.png", 'image: "https://example.com/new.png"')
      .replace("alt: old", 'alt: "new"'),
  )
  expect((await readPost(path, root)).cover).toEqual(cover)
  const omittedRevision = await savePost(
    path,
    "Changed again",
    post.body,
    revision,
    undefined,
    root,
  )
  expect((await readPost(path, root)).cover).toEqual(cover)
  expect(await Bun.file(join(root, path)).text()).toContain(
    'cover: {image: "https://example.com/new.png", alt: "new", relative: false, caption: keep, hidden: true} # cover',
  )
  await savePost(path, "Changed again", post.body, omittedRevision, null, root)
  const cleared = await Bun.file(join(root, path)).text()
  expect(
    parse((await import("./content")).splitMarkdownDocument(cleared).frontmatter).cover,
  ).toEqual({ image: "", alt: "", relative: false, caption: "keep", hidden: true })
  expect(cleared.endsWith(post.body)).toBe(true)
  expect(await Bun.file(join(root, "content/posts/example/old.png")).text()).toBe("shared asset")
})

test("unsafe cover saves fail before writing, while safe remote and missing local references are supported", async () => {
  const root = fixture()
  const original = await Bun.file(join(root, path)).text()
  const post = await readPost(path, root)
  const outside = fixture()
  symlinkSync(outside, join(root, "content/posts/example/escape"))
  for (const image of [
    "../secret.png",
    "javascript:alert(1)",
    "data:image/png;base64,eA==",
    "file:///secret.png",
    "//example.com/a.png",
    "a\\\\b.png",
    "notes.md",
    "escape/missing.png",
  ]) {
    await expect(
      savePost(
        path,
        "Changed",
        post.body,
        post.revision,
        { image, alt: "", relative: false },
        root,
      ),
    ).rejects.toThrow()
    expect(await Bun.file(join(root, path)).text()).toBe(original)
  }
  await savePost(
    path,
    post.title,
    post.body,
    post.revision,
    { image: "images/missing.png", alt: "", relative: true },
    root,
  )
})

test("cover save revision conflicts and real Hugo errors preserve the original file", async () => {
  const root = fixture(
    "title: Original\ncover: {image: old.png, alt: old, hidden: true} # comment\n",
  )
  const original = await Bun.file(join(root, path)).text()
  const post = await readPost(path, root)
  const cover = { image: "https://example.com/new.png", alt: "", relative: false }
  await expect(savePost(path, "Changed", post.body, "stale", cover, root)).rejects.toMatchObject({
    status: 409,
  })
  expect(await Bun.file(join(root, path)).text()).toBe(original)
  await expect(
    savePost(path, "Changed", "{{< unknown-cover-test >}}\n", post.revision, cover, root),
  ).rejects.toMatchObject({ status: 422 })
  expect(await Bun.file(join(root, path)).text()).toBe(original)
})

test("cover HTTP routes validate uploads and refuse unsafe local previews", async () => {
  const server = (await import("./index")).default
  const form = new FormData()
  form.set("path", path)
  form.set("image", new File(["fake"], "fake.png", { type: "image/png" }))
  const upload = await server.fetch(
    new Request("http://localhost/api/cover-image", { method: "POST", body: form }),
  )
  expect(upload.status).toBe(400)
  expect(await upload.json()).toHaveProperty("error")
  const preview = await server.fetch(
    new Request(
      `http://localhost/api/cover-media?path=${encodeURIComponent(path)}&src=${encodeURIComponent("../secret.png")}`,
    ),
  )
  expect(preview.status).toBe(400)
})

test("normal save HTTP API forwards explicit cover updates and null without changing old omission", async () => {
  const content = await import("./content")
  const saved = spyOn(content, "savePost").mockResolvedValue("new-revision")
  try {
    const server = (await import("./index")).default
    for (const cover of [
      { image: "images/new.png", alt: "new", relative: true },
      null,
      undefined,
    ]) {
      const payload = {
        path,
        title: "Title",
        body: "Body",
        revision: "old-revision",
        ...(cover === undefined ? {} : { cover }),
      }
      const result = await server.fetch(
        new Request("http://localhost/api/post", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      )
      expect(result.status).toBe(200)
      expect(saved).toHaveBeenLastCalledWith(path, "Title", "Body", "old-revision", cover)
    }
  } finally {
    saved.mockRestore()
  }
})

test("cover-only saves leave untouched title syntax and body whitespace exactly intact", async () => {
  const root = fixture(
    "title: 'Original' # title\ncover: {image: old.png, alt: old, relative: true}\n",
  )
  const file = join(root, path)
  const original = (await Bun.file(file).text()).replace("Body\n", "Body  \n\n\n")
  writeFileSync(file, original)
  const post = await readPost(path, root)
  await savePost(
    path,
    post.title,
    post.body,
    post.revision,
    { image: "new.png", alt: "new", relative: true },
    root,
  )
  expect(await Bun.file(file).text()).toBe(
    original.replace("image: old.png", 'image: "new.png"').replace("alt: old", 'alt: "new"'),
  )
})

test("block scalar comments survive cover replacement", async () => {
  const root = fixture(
    "title: Original\ncover:\n  image: old.png\n  alt: |- # alt comment\n    old alt\n  relative: true\n  caption: keep # caption\n",
  )
  const file = join(root, path)
  const post = await readPost(path, root)
  await savePost(
    path,
    post.title,
    post.body,
    post.revision,
    { image: "new.png", alt: "new alt", relative: true },
    root,
  )
  expect(await Bun.file(file).text()).toContain('alt: "new alt" # alt comment')
  expect(await Bun.file(file).text()).toContain("caption: keep # caption")
})

test("malformed HTTP cover URLs produce content validation errors rather than internal server errors", () => {
  const root = fixture()
  for (const image of [
    "http://",
    "https://[bad]/a.png",
    "https://example.com/\\nimage.png",
    "https://example.com\\\\evil/a.png",
  ]) {
    expect(() =>
      coverModule.validateCoverForSave(path, { image, alt: "", relative: false }, root),
    ).toThrow(ContentError)
  }
})

test("cover metadata comments and flow syntax survive scalar updates", () => {
  for (const source of [
    "title: Original\ncover: {image: old.png, alt: old, relative: false, hiddenInList: true, hiddenInSingle: false} # flow\n",
    "title: Original\ncover: {image: old.png, caption: keep} # partial\n",
    "title: Original\ncover: {} # empty\n",
  ]) {
    const patched = coverModule.patchCoverFrontmatter(source, {
      image: "new.png",
      alt: "new",
      relative: true,
    })
    expect(parse(patched).cover).toMatchObject({ image: "new.png", alt: "new", relative: true })
    expect(patched).toContain(source.slice(source.indexOf(" #")))
  }
})

test("uploads and previews never follow escaping post, posts-root, or static-root symlinks", async () => {
  const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "a.png", {
    type: "image/png",
  })
  for (const kind of ["post", "posts", "static"]) {
    const root = fixture()
    const outside = fixture()
    if (kind === "static") {
      writeFileSync(join(outside, "a.png"), "outside")
      symlinkSync(outside, join(root, "static"))
      expect(() => coverModule.resolveCoverMediaPath(path, "/a.png", root)).toThrow(ContentError)
    } else {
      const target = kind === "post" ? join(root, path) : join(root, "content/posts")
      rmSync(target, { recursive: true })
      symlinkSync(kind === "post" ? join(outside, path) : join(outside, "content/posts"), target)
      await expect(coverModule.saveCoverImage(path, png, root)).rejects.toThrow(ContentError)
      expect(() => coverModule.resolveCoverMediaPath(path, "a.png", root)).toThrow(ContentError)
    }
  }
})

const roots: string[] = []
const path = "content/posts/example/index.md"
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture(frontmatter = "title: Original\n") {
  const root = realpathSync(mkdtempSync(join(process.env["TMPDIR"] ?? ".", "editor-cover-")))
  roots.push(root)
  mkdirSync(join(root, "content/posts/example"), { recursive: true })
  writeFileSync(join(root, path), `---\n${frontmatter}---\n\nBody\n`)
  writeFileSync(join(root, "hugo.yaml"), "baseURL: https://example.com\n")
  return root
}

test("cover contracts retain old save requests and constrain editable metadata", () => {
  const request = { path, title: "Title", body: "Body", revision: "rev" }
  expect(contracts.savePostRequestSchema.parse(request)).toEqual(request)
  expect(contracts.savePostRequestSchema.parse({ ...request, cover: null })).toHaveProperty(
    "cover",
    null,
  )
  expect(
    contracts.postCoverSchema.parse({ image: "images/a.png", alt: "Description", relative: true }),
  ).toEqual({ image: "images/a.png", alt: "Description", relative: true })
  expect(
    contracts.postCoverSchema.safeParse({ image: "a".repeat(2049), alt: "", relative: false })
      .success,
  ).toBe(false)
  expect(
    contracts.postCoverSchema.safeParse({ image: "a.png", alt: "a".repeat(1001), relative: false })
      .success,
  ).toBe(false)
})

test("readPost normalizes absent, empty and non-image covers without changing metadata", async () => {
  for (const cover of [
    "",
    "cover: legacy\n",
    "cover: {image: '', hidden: true}\n",
    "cover: {image: 42}\n",
  ]) {
    const root = fixture(`title: Original\n${cover}`)
    expect((await readPost(path, root)).cover).toBeNull()
  }
  const root = fixture("title: Original\ncover: {image: images/a.png, caption: preserved}\n")
  expect((await readPost(path, root)).cover).toEqual({
    image: "images/a.png",
    alt: "",
    relative: false,
  })
})
