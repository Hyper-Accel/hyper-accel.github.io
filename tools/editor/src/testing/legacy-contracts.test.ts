import { expect, test } from "bun:test"
import { createGitHubAdapter } from "../client/github"
import {
  applyRepair,
  createBundle,
  documentCodec,
  pairUnpaired,
  parseForEditing,
} from "../document"
import {
  imagePathSchema,
  newSlugSchema,
  postBundleSchema,
  slugSchema,
} from "../shared/onsite/document"
import { startFakeGitHub } from "./fake-github"

test("loads and saves legacy filename, uppercase slug and root image without creating index.md", async () => {
  const fake = startFakeGitHub()
  const slug = "how-GPU-works"
  const koPath = `content/posts/${slug}/index.ko.md`
  const enPath = `content/posts/${slug}/index.en.md`
  const source = (title: string): string =>
    `---\ntitle: ${title}\nauthors: [Author]\ncategories: [AI Hardware]\ndraft: false\n---\n\n<!-- b:intro -->\n![diagram](cpuvstpu.webp)\n`
  fake.seed("main", {
    [koPath]: source("한국어"),
    [enPath]: source("English"),
    [`content/posts/${slug}/cpuvstpu.webp`]: new Uint8Array([1, 2, 3]),
  })
  const github = createGitHubAdapter({
    owner: "Hyper-Accel",
    repository: "hyper-accel.github.io",
    baseUrl: fake.url,
    tokenProvider: { getAccessToken: () => fake.defaultToken },
    expiresAt: () => Date.now() + 28_800_000,
    codec: documentCodec,
  })
  try {
    const loaded = await github.loadBundle(slug)
    if (!loaded.ok) throw new Error(loaded.error.message)
    expect(loaded.value.ko.path).toBe(koPath)
    expect(loaded.value.images[0]?.path).toBe("cpuvstpu.webp")
    expect(postBundleSchema.safeParse(loaded.value).success).toBe(true)
    const serialized = await documentCodec.serialize(loaded.value)
    expect(serialized.files.map((file) => file.path)).toEqual([koPath, enPath])
    const pull = await github.ensureDraftPR(slug, "Legacy post", serialized.files)
    if (!pull.ok) throw new Error(pull.error.message)
    const saved = await github.commitBundle(slug, pull.value.headSha, serialized.files)
    expect(saved.ok).toBe(true)
    const duplicate = await fetch(
      `${fake.url}/repos/Hyper-Accel/hyper-accel.github.io/contents/content/posts/${slug}/index.md?ref=post/${slug}`,
      {
        headers: { authorization: `Bearer ${fake.defaultToken}` },
      },
    )
    expect(duplicate.status).toBe(404)
    if (!saved.ok) throw new Error(saved.error.message)
    const renamed = await github.commitBundle(slug, saved.value.headSha, [
      {
        path: `content/posts/${slug}/index.md`,
        encoding: "utf-8",
        content: source("wrong filename"),
      },
    ])
    expect(renamed).toMatchObject({ ok: false, error: { kind: "validation", fields: ["path"] } })
    expect(fake.state.refs.get(`heads/post/${slug}`)).toBe(saved.value.headSha)
  } finally {
    fake.stop()
  }
})

test("permits existing slug case but rejects uppercase new posts and unsafe image paths", async () => {
  expect(slugSchema.safeParse("TPU-deep-dive").success).toBe(true)
  expect(newSlugSchema.safeParse("TPU-deep-dive").success).toBe(false)
  expect(imagePathSchema.safeParse("cpuvstpu.webp").success).toBe(true)
  expect(imagePathSchema.safeParse("../cpuvstpu.webp").success).toBe(false)
  await expect(
    createBundle({
      slug: "TPU-deep-dive",
      title: { ko: "제목", en: "Title" },
      date: "2026-10-27",
      authors: ["Author"],
      category: "AI Hardware",
      tags: [],
      draft: false,
    }),
  ).rejects.toThrow()
})

test("pairing repair retains the original Korean filename when completing legacy blocks", async () => {
  const head =
    "---\ntitle: Title\nauthors: [Author]\ncategories: [AI Hardware]\ndraft: false\n---\n\n"
  const parsed = await parseForEditing({
    slug: "TPU-deep-dive",
    ko: `${head}First paragraph.\n\nSecond paragraph.\n`,
    en: `${head}First paragraph.\n`,
    images: [],
    headSha: "a".repeat(40),
    paths: {
      ko: "content/posts/TPU-deep-dive/index.ko.md",
      en: "content/posts/TPU-deep-dive/index.en.md",
    },
  })
  if (parsed.kind !== "repair") throw new Error("Expected a legacy repair")
  expect(parsed.unpaired.ko.path).toBe("content/posts/TPU-deep-dive/index.ko.md")
  const repaired = await pairUnpaired(
    applyRepair(parsed.unpaired, { type: "insert", language: "en", index: 1 }),
  )
  if (!repaired.ok) throw new Error("Repair did not complete")
  expect(repaired.bundle.ko.path).toBe("content/posts/TPU-deep-dive/index.ko.md")
  expect(repaired.bundle.ko.blocks.map((block) => block.id)).toEqual(
    repaired.bundle.en.blocks.map((block) => block.id),
  )
})

test("adapter refuses a new uppercase slug before creating its branch", async () => {
  const fake = startFakeGitHub()
  const github = createGitHubAdapter({
    owner: "Hyper-Accel",
    repository: "hyper-accel.github.io",
    baseUrl: fake.url,
    tokenProvider: { getAccessToken: () => fake.defaultToken },
    expiresAt: () => Date.now() + 28_800_000,
    codec: documentCodec,
  })
  try {
    const result = await github.ensureDraftPR("New-UPPER", "New post", [
      {
        path: "content/posts/New-UPPER/index.md",
        encoding: "utf-8",
        content: "New post",
      },
    ])
    expect(result).toMatchObject({ ok: false, error: { kind: "validation", fields: ["slug"] } })
    expect(fake.state.refs.has("heads/post/New-UPPER")).toBe(false)
  } finally {
    fake.stop()
  }
})
