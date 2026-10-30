import { readdir, realpath, stat } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { marked } from "marked"
import { parseDocument } from "yaml"
import { z } from "zod"

// Canonical English taxonomy terms from README / content/posts/AGENTS.md.
export const categories = [
  "AI Hardware",
  "Memory and Storage",
  "Compilers and Kernels",
  "LLM and Models",
  "Infra and DevOps",
  "Engineering Culture",
  "Conference Reports",
] as const

export type Check = "ko-en" | "authors" | "category"
export type Finding = {
  readonly check: Check
  readonly code: string
  readonly file: string
  readonly message: string
}
type Page = {
  readonly file: string
  readonly body: string
  readonly fields: Record<string, unknown>
}

export async function directories(path: string): Promise<string[]> {
  return (await readdir(path, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

export async function checkBundle(root: string, slug: string): Promise<Finding[]> {
  const bundle = resolve(root, "content/posts", slug)
  const files = await readdir(bundle)
  const findings: Finding[] = []
  const add = (check: Check, code: string, file: string, message: string) =>
    findings.push({ check, code, file: relative(root, file), message })
  const korean = files.includes("index.md") ? "index.md" : "index.ko.md"
  const pages: Page[] = []
  for (const name of [korean, "index.en.md"]) {
    const file = resolve(bundle, name)
    if (!files.includes(name)) {
      add("ko-en", "pair", file, `Missing ${name}; every changed bundle needs Korean and English.`)
      continue
    }
    const source = await Bun.file(file).text()
    const frontmatter = /^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source)
    if (!frontmatter?.[1]) {
      for (const check of ["ko-en", "authors", "category"] as const)
        add(check, "frontmatter", file, "Expected YAML front matter.")
      continue
    }
    const document = parseDocument(frontmatter[1])
    const metadata =
      document.errors.length === 0
        ? z.record(z.string(), z.unknown()).safeParse(document.toJS())
        : undefined
    if (!metadata?.success) {
      for (const check of ["ko-en", "authors", "category"] as const)
        add(check, "frontmatter", file, "Invalid YAML front matter mapping.")
      continue
    }
    const body = source.slice(frontmatter[0].length)
    const fields = metadata.data
    const page = { file, fields, body }
    pages.push(page)
    if (!z.string().trim().min(1).safeParse(fields["title"]).success)
      add("ko-en", "title", file, "Title must be a non-empty string.")
    if (!body.replace(/<!--[\s\S]*?-->/g, "").trim())
      add("ko-en", "body", file, "Body must be non-empty (comments do not count).")
    if (fields["draft"] === true || String(fields["draft"]).toLowerCase() === "true")
      add("ko-en", "draft", file, "draft: true cannot be published.")
    const authors = z.array(z.string().min(1)).min(1).safeParse(fields["authors"])
    const names = await directories(resolve(root, "content/authors"))
    if (!authors.success || authors.data.some((name) => !names.includes(name)))
      add(
        "authors",
        "authors",
        file,
        "Authors must be an array matching author directory names exactly.",
      )
    const category = z.array(z.enum(categories)).length(1).safeParse(fields["categories"])
    if (!category.success)
      add(
        "category",
        "category",
        file,
        `Categories must be an array with exactly one of: ${categories.join(", ")}.`,
      )
    for (const message of await checkImages(bundle, page)) add("ko-en", "images", file, message)
  }
  const sequences = pages.map((page) =>
    [
      ...page.body
        .replace(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?\1/g, "")
        .matchAll(/<!--\s*b:([^\s>]+)\s*-->/g),
    ].map((match) => match[1]),
  )
  if (
    sequences.some((ids) => ids.length > 0) &&
    (sequences.length !== 2 || JSON.stringify(sequences[0]) !== JSON.stringify(sequences[1]))
  )
    add(
      "ko-en",
      "blocks",
      resolve(bundle, "index.en.md"),
      "Korean and English block IDs must have the same sequence.",
    )
  return findings
}

async function checkImages(bundle: string, page: Page): Promise<string[]> {
  const references: string[] = []
  const tokens = marked.lexer(page.body)
  marked.walkTokens(tokens, (token) => {
    if (token.type === "image") references.push(token.href)
    if (token.type === "html" || token.type === "text") {
      for (const match of token.raw.matchAll(
        /(?:<img\b[^>]*?\bsrc\s*=\s*|{{[<%]\s*figure\b[^}]*?\bsrc\s*=\s*)(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi,
      )) {
        const target = match[1] ?? match[2] ?? match[3]
        if (target) references.push(target)
      }
    }
  })
  const cover = z.object({ image: z.string().optional() }).safeParse(page.fields["cover"])
  if (cover.success && cover.data.image) references.push(cover.data.image)
  const images = z.array(z.string()).safeParse(page.fields["images"])
  if (images.success) references.push(...images.data)
  const errors: string[] = []
  const canonicalBundle = await realpath(bundle)
  for (const reference of new Set(references)) {
    let target: string
    try {
      target = decodeURIComponent(reference.split(/[?#]/, 1)[0] ?? "")
    } catch (error) {
      if (!(error instanceof URIError)) throw error
      errors.push(`Invalid image URL encoding: ${reference}`)
      continue
    }
    const path = resolve(bundle, target)
    if (
      !target ||
      isAbsolute(target) ||
      relative(bundle, path).startsWith(`..${sep}`) ||
      relative(bundle, path) === ".." ||
      /^[a-z][a-z\d+.-]*:/i.test(target)
    ) {
      errors.push(`Image must be inside its post bundle: ${reference}`)
      continue
    }
    try {
      const canonical = await realpath(path)
      const info = await stat(canonical)
      if (!canonical.startsWith(`${canonicalBundle}${sep}`) || !info.isFile())
        errors.push(`Image must be a file inside its post bundle: ${reference}`)
      else if (info.size > 1_048_576)
        errors.push(`Image exceeds 1,048,576 bytes: ${reference} (${info.size})`)
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        errors.push(`Missing bundle image: ${reference}`)
      else throw error
    }
  }
  return errors
}
