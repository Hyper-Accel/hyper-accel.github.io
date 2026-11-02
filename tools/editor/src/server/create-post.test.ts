import { afterEach, describe, expect, spyOn, test } from "bun:test"
import * as fs from "node:fs"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "yaml"
import { splitMarkdownDocument } from "./content"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "create-post-"))
  roots.push(root)
  mkdirSync(join(root, "content/posts"), { recursive: true })
  mkdirSync(join(root, "content/authors/Jaewon Lim"), { recursive: true })
  writeFileSync(join(root, "content/authors/Jaewon Lim/_index.md"), "existing profile")
  return root
}

test("creates a bilingual bundle for a registered author without changing their profile", async () => {
  const { createPost, listAuthors } = await import("./create-post")
  const root = fixture()
  expect(await listAuthors(root)).toEqual(["Jaewon Lim"])
  expect(
    await createPost({ directory: "new-post", title: "새 제목", author: "Jaewon Lim" }, root),
  ).toEqual({ path: "content/posts/new-post/index.md" })
  for (const file of ["index.md", "index.en.md"]) {
    const parts = splitMarkdownDocument(
      readFileSync(join(root, "content/posts/new-post", file), "utf8"),
    )
    expect(parse(parts.frontmatter)).toEqual({
      title: "새 제목",
      authors: ["Jaewon Lim"],
      date: expect.stringMatching(/T\d\d:\d\d:\d\d\.\d{3}\+09:00$/),
      comments: true,
      cover: { image: "", alt: "", relative: true },
      tags: [],
      categories: [],
      summary: "",
    })
    expect(parts.body.trim()).toBe("")
  }
  expect(readFileSync(join(root, "content/authors/Jaewon Lim/_index.md"), "utf8")).toBe(
    "existing profile",
  )
})

import * as contracts from "../shared/contracts"

test("registers a new author with both localized profiles and YAML-safe input", async () => {
  const { createPost, listAuthors } = await import("./create-post")
  const root = fixture()
  const title = '제목\n---\ndraft: true\n"quoted"'
  const author = "새 작성자"
  const profile = {
    bioKo: "소개\nadmin: true",
    bioEn: "Engineer: yes",
    github: "https://github.com/example",
    image: "",
    linkedin: "",
  }
  await createPost({ directory: "registered", title, author, profile }, root)
  expect(await listAuthors(root)).toEqual(expect.arrayContaining([author]))
  for (const [file, bio] of [
    ["_index.md", profile.bioKo],
    ["_index.en.md", profile.bioEn],
  ]) {
    const source = readFileSync(join(root, "content/authors", author, file ?? ""), "utf8")
    expect(parse(splitMarkdownDocument(source).frontmatter)).toEqual({
      title: author,
      bio,
      github: profile.github,
      image: "",
      linkedin: "",
    })
  }
  const metadata = parse(
    splitMarkdownDocument(readFileSync(join(root, "content/posts/registered/index.md"), "utf8"))
      .frontmatter,
  )
  expect(metadata.title).toBe(title)
  expect(metadata.draft).toBeUndefined()
})

test("standalone registration persists bilingual profiles without creating or requiring posts", async () => {
  const { registerAuthor, listAuthors, createPost } = await import("./create-post")
  const root = fixture()
  rmSync(join(root, "content/posts"), { recursive: true })
  const author = "새 작성자"
  const profile = {
    bioKo: '소개\n---\nadmin: true\n"quoted"',
    bioEn: "Engineer: yes",
    github: "https://github.com/example",
  }
  expect(await registerAuthor({ author, profile }, root)).toEqual({ author })
  expect(await listAuthors(root)).toContain(author)
  expect(existsSync(join(root, "content/posts"))).toBe(false)
  for (const [file, bio] of [
    ["_index.md", profile.bioKo],
    ["_index.en.md", profile.bioEn],
  ]) {
    const parts = splitMarkdownDocument(
      readFileSync(join(root, "content/authors", author, file ?? ""), "utf8"),
    )
    expect(parse(parts.frontmatter)).toEqual({
      title: author,
      bio,
      github: profile.github,
      image: "",
      linkedin: "",
    })
    expect(parts.body.trim()).toBe("")
  }
  mkdirSync(join(root, "content/posts"))
  expect(readdirSync(join(root, "content/posts"))).toEqual([])
  await createPost({ directory: "later", title: "Later post", author }, root)
  expect(await listAuthors(root)).toContain(author)
})

const request = { directory: "safe-post", title: "Title", author: "Jaewon Lim" }
const profile = { bioKo: "작성자 소개", bioEn: "Author biography" }

describe("standalone author registration", () => {
  test.each(["registered", "empty", "partial", "file", "symlink", "profile-symlink"])(
    "rejects an existing %s author entry without overwriting it",
    async (kind) => {
      const { registerAuthor } = await import("./create-post")
      const root = fixture()
      const author = kind === "registered" ? "Jaewon Lim" : "Occupied"
      const directory = join(root, "content/authors", author)
      const existing = join(root, "content/authors/Jaewon Lim/_index.md")
      if (kind === "file") writeFileSync(directory, "keep file")
      else if (kind === "symlink") symlinkSync(join(root, "content/authors/Jaewon Lim"), directory)
      else if (kind !== "registered") {
        mkdirSync(directory)
        if (kind === "partial") writeFileSync(join(directory, "_index.en.md"), "keep profile")
        if (kind === "profile-symlink") symlinkSync(existing, join(directory, "_index.md"))
      }
      await expect(registerAuthor({ author, profile }, root)).rejects.toMatchObject({ status: 409 })
      expect(readFileSync(existing, "utf8")).toBe("existing profile")
      if (kind === "file") expect(readFileSync(directory, "utf8")).toBe("keep file")
      if (kind === "partial")
        expect(readFileSync(join(directory, "_index.en.md"), "utf8")).toBe("keep profile")
      if (kind === "empty") expect(readdirSync(directory)).toEqual([])
      if (kind === "symlink") expect(fs.lstatSync(directory).isSymbolicLink()).toBe(true)
      if (kind === "profile-symlink")
        expect(fs.lstatSync(join(directory, "_index.md")).isSymbolicLink()).toBe(true)
      expect(readdirSync(join(root, "content/posts"))).toEqual([])
    },
  )

  test.each(["case", "unicode"])("rejects %s-normalized name collisions", async (kind) => {
    const { registerAuthor, listAuthors } = await import("./create-post")
    const root = fixture()
    let author = "jaewon lim"
    if (kind === "unicode") {
      mkdirSync(join(root, "content/authors/Élodie"))
      const name = readdirSync(join(root, "content/authors")).find(
        (entry) => entry !== "Jaewon Lim",
      )
      if (!name) throw new Error("Missing fixture author")
      author = name === name.normalize("NFC") ? name.normalize("NFD") : name.normalize("NFC")
      expect(author).not.toBe(name)
    }
    const before = readdirSync(join(root, "content/authors"))
    await expect(registerAuthor({ author, profile }, root)).rejects.toMatchObject({ status: 409 })
    expect(readdirSync(join(root, "content/authors"))).toEqual(before)
    expect(await listAuthors(root)).toEqual(["Jaewon Lim"])
    expect(readdirSync(join(root, "content/posts"))).toEqual([])
  })

  test.each(["content", "authors"])("rejects a symlinked %s parent", async (name) => {
    const { registerAuthor } = await import("./create-post")
    const root = fixture()
    const outside = fixture()
    const path = name === "content" ? join(root, name) : join(root, "content", name)
    rmSync(path, { recursive: true })
    symlinkSync(
      name === "content" ? join(outside, "content") : join(outside, "content", name),
      path,
    )
    await expect(registerAuthor({ author: "New Author", profile }, root)).rejects.toMatchObject({
      status: 400,
    })
    expect(readdirSync(join(outside, "content/authors"))).toEqual(["Jaewon Lim"])
    expect(readdirSync(join(outside, "content/posts"))).toEqual([])
  })

  test("concurrent duplicate registrations have exactly one winner", async () => {
    const { registerAuthor } = await import("./create-post")
    const root = fixture()
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => registerAuthor({ author: "New Author", profile }, root)),
    )
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    for (const result of results)
      if (result.status === "rejected") expect(result.reason).toMatchObject({ status: 409 })
    expect(readdirSync(join(root, "content/authors/New Author")).sort()).toEqual([
      "_index.en.md",
      "_index.md",
    ])
    expect(readdirSync(join(root, "content/posts"))).toEqual([])
  })

  test("rejects missing or invalid profiles and unsafe names before writing", async () => {
    const { registerAuthor } = await import("./create-post")
    const root = fixture()
    const invalid: unknown[] = [
      { author: "Unknown" },
      { author: "Unknown", profile: null },
      { author: "Unknown", profile: {} },
    ]
    for (const author of ["../escape", "a/b", "a\\b", "..", "CON", "a\u0000b"])
      invalid.push({ author, profile })
    for (const key of ["bioKo", "bioEn"])
      for (const value of [undefined, "", " ", "a".repeat(1001)])
        invalid.push({ author: "Unknown", profile: { ...profile, [key]: value } })
    for (const key of ["image", "github", "linkedin"])
      for (const value of [
        "javascript:alert(1)",
        "file:///tmp/avatar",
        "relative/path",
        "not a URL",
      ])
        invalid.push({ author: "Unknown", profile: { ...profile, [key]: value } })
    for (const input of invalid) {
      expect(contracts.registerAuthorRequestSchema.safeParse(input).success).toBe(false)
      await expect(
        registerAuthor(input as contracts.RegisterAuthorRequest, root),
      ).rejects.toMatchObject({
        status: 400,
      })
    }
    expect(
      contracts.registerAuthorRequestSchema.parse({ author: " New Author ", profile }),
    ).toEqual({
      author: "New Author",
      profile,
    })
    expect(readdirSync(join(root, "content/authors"))).toEqual(["Jaewon Lim"])
    expect(readdirSync(join(root, "content/posts"))).toEqual([])
  })

  test("rolls back both localized profiles when the second write fails", async () => {
    const { registerAuthor } = await import("./create-post")
    const root = fixture()
    const original = fs.writeFileSync
    let writes = 0
    const mocked = spyOn(fs, "writeFileSync").mockImplementation(
      (...args: Parameters<typeof fs.writeFileSync>) => {
        writes += 1
        if (writes === 2) throw new Error("injected profile failure")
        return original(...args)
      },
    )
    try {
      await expect(registerAuthor({ author: "New Author", profile }, root)).rejects.toThrow(
        "injected profile failure",
      )
    } finally {
      mocked.mockRestore()
    }
    expect(readdirSync(join(root, "content/authors"))).toEqual(["Jaewon Lim"])
    expect(readFileSync(join(root, "content/authors/Jaewon Lim/_index.md"), "utf8")).toBe(
      "existing profile",
    )
    expect(readdirSync(join(root, "content/posts"))).toEqual([])
  })

  test("preserves foreign files and reports registration and rollback failures together", async () => {
    const { registerAuthor } = await import("./create-post")
    const root = fixture()
    const directory = join(root, "content/authors/New Author")
    const original = fs.writeFileSync
    const failure = new Error("injected profile failure")
    let writes = 0
    const mocked = spyOn(fs, "writeFileSync").mockImplementation(
      (...args: Parameters<typeof fs.writeFileSync>) => {
        writes += 1
        if (writes === 2) {
          original(join(directory, "foreign.txt"), "keep foreign file")
          throw failure
        }
        return original(...args)
      },
    )
    try {
      let caught: unknown
      try {
        await registerAuthor({ author: "New Author", profile }, root)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(AggregateError)
      const errors = (caught as AggregateError).errors
      expect(errors).toHaveLength(2)
      expect(errors[0]).toBe(failure)
      expect(errors[1]).toMatchObject({ code: "ENOTEMPTY" })
    } finally {
      mocked.mockRestore()
    }
    expect(readdirSync(directory)).toEqual(["foreign.txt"])
    expect(readFileSync(join(directory, "foreign.txt"), "utf8")).toBe("keep foreign file")
    expect(readdirSync(join(root, "content/posts"))).toEqual([])
  })

  test("a later failed post creation cannot roll back an already registered author", async () => {
    const { registerAuthor, createPost, listAuthors } = await import("./create-post")
    const root = fixture()
    const author = "New Author"
    await registerAuthor({ author, profile }, root)
    const korean = readFileSync(join(root, "content/authors", author, "_index.md"), "utf8")
    const mocked = spyOn(fs, "writeFileSync").mockImplementation(() => {
      throw new Error("injected post failure")
    })
    try {
      await expect(createPost({ ...request, author }, root)).rejects.toThrow(
        "injected post failure",
      )
    } finally {
      mocked.mockRestore()
    }
    expect(await listAuthors(root)).toContain(author)
    expect(readFileSync(join(root, "content/authors", author, "_index.md"), "utf8")).toBe(korean)
    expect(readdirSync(join(root, "content/authors", author)).sort()).toEqual([
      "_index.en.md",
      "_index.md",
    ])
    expect(readdirSync(join(root, "content/posts"))).toEqual([])
  })
})

test("unknown author requires a profile and leaves no files", async () => {
  const { createPost } = await import("./create-post")
  const root = fixture()
  await expect(createPost({ ...request, author: "New Author" }, root)).rejects.toMatchObject({
    status: 400,
    message: expect.stringContaining("프로필"),
  })
  expect(readdirSync(join(root, "content/posts"))).toEqual([])
  expect(readdirSync(join(root, "content/authors"))).toEqual(["Jaewon Lim"])
})

test("registered author profile is not overwritten even when supplied", async () => {
  const { createPost } = await import("./create-post")
  const root = fixture()
  await createPost({ ...request, profile }, root)
  expect(readFileSync(join(root, "content/authors/Jaewon Lim/_index.md"), "utf8")).toBe(
    "existing profile",
  )
  expect(existsSync(join(root, "content/authors/Jaewon Lim/_index.en.md"))).toBe(false)
})

test("rejects incomplete and case-colliding authors without creating a bundle", async () => {
  const { createPost, listAuthors } = await import("./create-post")
  const root = fixture()
  mkdirSync(join(root, "content/authors/Incomplete"))
  writeFileSync(join(root, "content/authors/Incomplete/_index.en.md"), "keep me")
  for (const author of ["jaewon lim", "Incomplete"]) {
    await expect(createPost({ ...request, author, profile }, root)).rejects.toThrow()
    expect(readdirSync(join(root, "content/posts"))).toEqual([])
  }
  expect(await listAuthors(root)).toEqual(["Jaewon Lim"])
  expect(readFileSync(join(root, "content/authors/Incomplete/_index.en.md"), "utf8")).toBe(
    "keep me",
  )
})

test.each(["empty", "partial", "symlink"])(
  "rejects duplicate %s bundles without touching existing files or registering authors",
  async (kind) => {
    const { createPost } = await import("./create-post")
    const root = fixture()
    const bundle = join(root, "content/posts", request.directory)
    const target = join(root, "target")
    mkdirSync(target)
    writeFileSync(join(target, "sentinel"), "keep")
    if (kind === "symlink") symlinkSync(target, bundle)
    else {
      mkdirSync(bundle)
      if (kind === "partial") writeFileSync(join(bundle, "index.en.md"), "keep")
    }
    await expect(createPost({ ...request, author: "New", profile }, root)).rejects.toMatchObject({
      status: 409,
    })
    expect(existsSync(join(root, "content/authors/New"))).toBe(false)
    expect(readFileSync(join(target, "sentinel"), "utf8")).toBe("keep")
    if (kind === "partial") expect(readFileSync(join(bundle, "index.en.md"), "utf8")).toBe("keep")
  },
)

test("concurrent duplicate requests have exactly one winner", async () => {
  const { createPost } = await import("./create-post")
  const root = fixture()
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => createPost(request, root)),
  )
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
  expect(readdirSync(join(root, "content/posts/safe-post")).sort()).toEqual([
    "index.en.md",
    "index.md",
  ])
})

test("concurrent requests can share a newly registered exact author", async () => {
  const { createPost, listAuthors } = await import("./create-post")
  const root = fixture()
  await Promise.all(
    ["first", "second"].map((directory) =>
      createPost({ ...request, directory, author: "New", profile }, root),
    ),
  )
  expect(await listAuthors(root)).toContain("New")
  expect(readdirSync(join(root, "content/authors/New")).sort()).toEqual([
    "_index.en.md",
    "_index.md",
  ])
})

test.each(["content", "posts", "authors"])("rejects a symlinked %s parent", async (name) => {
  const { createPost, listAuthors } = await import("./create-post")
  const root = fixture()
  const outside = fixture()
  const path = name === "content" ? join(root, name) : join(root, "content", name)
  rmSync(path, { recursive: true })
  symlinkSync(name === "content" ? join(outside, "content") : join(outside, "content", name), path)
  await expect(createPost(request, root)).rejects.toThrow()
  if (name !== "posts") await expect(listAuthors(root)).rejects.toThrow()
  expect(readdirSync(join(outside, "content/posts"))).toEqual([])
})

test("does not list or follow symlinked author directories or profile files", async () => {
  const { createPost, listAuthors } = await import("./create-post")
  const root = fixture()
  symlinkSync(join(root, "content/authors/Jaewon Lim"), join(root, "content/authors/Linked"))
  mkdirSync(join(root, "content/authors/FileLinked"))
  symlinkSync(
    join(root, "content/authors/Jaewon Lim/_index.md"),
    join(root, "content/authors/FileLinked/_index.md"),
  )
  expect(await listAuthors(root)).toEqual(["Jaewon Lim"])
  for (const author of ["Linked", "FileLinked"])
    await expect(createPost({ ...request, author, profile }, root)).rejects.toThrow()
  expect(readdirSync(join(root, "content/posts"))).toEqual([])
})

test("rolls back only owned post and author files when a write fails", async () => {
  const { createPost } = await import("./create-post")
  const root = fixture()
  const original = fs.writeFileSync
  let writes = 0
  const mocked = spyOn(fs, "writeFileSync").mockImplementation(
    (...args: Parameters<typeof fs.writeFileSync>) => {
      writes += 1
      if (writes === 4) throw new Error("injected write failure")
      return original(...args)
    },
  )
  try {
    await expect(createPost({ ...request, author: "New", profile }, root)).rejects.toThrow(
      "injected write failure",
    )
  } finally {
    mocked.mockRestore()
  }
  expect(readdirSync(join(root, "content/posts"))).toEqual([])
  expect(readdirSync(join(root, "content/authors"))).toEqual(["Jaewon Lim"])
  expect(readFileSync(join(root, "content/authors/Jaewon Lim/_index.md"), "utf8")).toBe(
    "existing profile",
  )
})

test("HTTP API exposes authors and useful create validation errors", async () => {
  const { default: server } = await import("./index")
  const authors = await server.fetch(new Request("http://localhost/api/authors"))
  expect(authors.status).toBe(200)
  const data = contracts.authorListSchema.parse(await authors.json())
  expect(data.authors).toContain("Jaewon Lim")
  const response = await server.fetch(
    new Request("http://localhost/api/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, author: "Missing Author Test 7219" }),
    }),
  )
  expect(response.status).toBe(400)
  expect(contracts.apiErrorSchema.parse(await response.json()).error).toContain("프로필")
  const invalid = await server.fetch(
    new Request("http://localhost/api/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, directory: "../escape" }),
    }),
  )
  expect(invalid.status).toBe(400)
  expect(contracts.apiErrorSchema.safeParse(await invalid.json()).success).toBe(true)
  const malformed = await server.fetch(
    new Request("http://localhost/api/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
  )
  expect(malformed.status).toBe(400)
  expect(contracts.apiErrorSchema.safeParse(await malformed.json()).success).toBe(true)
})

test("HTTP creation returns 201 and the created Korean path", async () => {
  const creator = await import("./create-post")
  const { default: server } = await import("./index")
  const mocked = spyOn(creator, "createPost").mockResolvedValue({
    path: "content/posts/safe-post/index.md",
  })
  try {
    const response = await server.fetch(
      new Request("http://localhost/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      }),
    )
    expect(response.status).toBe(201)
    expect(contracts.createPostResponseSchema.parse(await response.json())).toEqual({
      path: "content/posts/safe-post/index.md",
    })
    expect(mocked).toHaveBeenCalledWith(request)
  } finally {
    mocked.mockRestore()
  }
})

test("HTTP author registration persists profiles, returns 201, and reports 400/409 errors", async () => {
  const creator = await import("./create-post")
  const { default: server } = await import("./index")
  const root = fixture()
  const register = creator.registerAuthor
  const list = creator.listAuthors
  const registration = spyOn(creator, "registerAuthor").mockImplementation((input) =>
    register(input, root),
  )
  const listing = spyOn(creator, "listAuthors").mockImplementation(() => list(root))
  const input = { author: "HTTP Author", profile }
  const post = (body: string) =>
    server.fetch(
      new Request("http://localhost/api/authors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    )
  try {
    const response = await post(JSON.stringify(input))
    expect(response.status).toBe(201)
    expect(contracts.registerAuthorResponseSchema.parse(await response.json())).toEqual({
      author: input.author,
    })
    expect(registration).toHaveBeenCalledWith(input)
    expect(readdirSync(join(root, "content/authors", input.author)).sort()).toEqual([
      "_index.en.md",
      "_index.md",
    ])
    const authors = await server.fetch(new Request("http://localhost/api/authors"))
    expect(contracts.authorListSchema.parse(await authors.json()).authors).toContain(input.author)
    const duplicate = await post(JSON.stringify(input))
    expect(duplicate.status).toBe(409)
    expect(contracts.apiErrorSchema.safeParse(await duplicate.json()).success).toBe(true)
    for (const body of [
      "{",
      JSON.stringify({ author: "Missing Profile" }),
      JSON.stringify({
        author: "../escape",
        profile,
      }),
    ]) {
      const invalid = await post(body)
      expect(invalid.status).toBe(400)
      expect(contracts.apiErrorSchema.safeParse(await invalid.json()).success).toBe(true)
    }
    expect(readdirSync(join(root, "content/posts"))).toEqual([])
    expect(await list(root)).toEqual(["HTTP Author", "Jaewon Lim"])
  } finally {
    registration.mockRestore()
    listing.mockRestore()
  }
})

describe("create post contracts", () => {
  test.each([
    "../escape",
    "Upper",
    "has space",
    "a/b",
    "a\\b",
    "a--b",
    "-a",
    "a-",
    "a.b",
    "한글",
    "con",
    "nul",
    "com1",
    "lpt9",
    "a".repeat(81),
    "",
  ])("rejects unsafe directory %s", (directory) => {
    expect(contracts.createPostRequestSchema.safeParse({ ...request, directory }).success).toBe(
      false,
    )
  })
  test.each([
    "..",
    ".",
    "../name",
    "a/b",
    "a\\b",
    "a:b",
    "a?b",
    "a*b",
    "a<b",
    "a>b",
    'a"b',
    "a|b",
    "a\u0000b",
    "a\u007fb",
    "a\u0085b",
    "name.",
    "CON",
    "nul.txt",
    "COM1",
    "LPT9",
    "",
  ])("rejects unsafe author %s", (author) => {
    expect(contracts.createPostRequestSchema.safeParse({ ...request, author }).success).toBe(false)
  })
  test.each(["bioKo", "bioEn"])("requires nonempty bounded %s", (key) => {
    for (const value of ["", " ", "a".repeat(1001), undefined]) {
      expect(
        contracts.createPostRequestSchema.safeParse({
          ...request,
          profile: { ...profile, [key]: value },
        }).success,
      ).toBe(false)
    }
  })
  test.each(["image", "github", "linkedin"])("allows only optional empty or HTTP(S) %s", (key) => {
    for (const value of [undefined, "", "https://example.com/p", "http://example.com/"]) {
      expect(
        contracts.createPostRequestSchema.safeParse({
          ...request,
          profile: { ...profile, [key]: value },
        }).success,
      ).toBe(true)
    }
    for (const value of [
      "javascript:alert(1)",
      "file:///tmp/image",
      "ftp://example.com",
      "relative/path",
      "not a url",
    ]) {
      expect(
        contracts.createPostRequestSchema.safeParse({
          ...request,
          profile: { ...profile, [key]: value },
        }).success,
      ).toBe(false)
    }
  })
  test("enforces title bounds and accepts boundary values", () => {
    for (const title of ["", " ", "a".repeat(241)])
      expect(contracts.createPostRequestSchema.safeParse({ ...request, title }).success).toBe(false)
    expect(
      contracts.createPostRequestSchema.safeParse({
        ...request,
        directory: "a".repeat(80),
        title: "a".repeat(240),
        profile: { bioKo: "a".repeat(1000), bioEn: "a".repeat(1000) },
      }).success,
    ).toBe(true)
    expect(contracts.createPostResponseSchema.parse({ path: "content/posts/a/index.md" })).toEqual({
      path: "content/posts/a/index.md",
    })
  })
  test("validates and trims a minimal create request", () => {
    expect(
      contracts.createPostRequestSchema.parse({
        directory: "new-post",
        title: " 제목 ",
        author: " 임 재원 ",
      }),
    ).toEqual({ directory: "new-post", title: "제목", author: "임 재원" })
  })
})
