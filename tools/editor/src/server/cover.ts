import { lstatSync, mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { dirname, extname, join, relative, resolve, sep } from "node:path"
import { isMap, isScalar, parseDocument } from "yaml"
import { type ImageUploadResponse, type PostCover, postCoverSchema } from "../shared/contracts"
import { repositoryRoot, resolveContentPath } from "./content"
import { ContentError } from "./errors"

// Edit scalar source ranges from the YAML AST, never re-serialize unrelated metadata.
export function patchCoverFrontmatter(source: string, cover: PostCover | null): string {
  const document = parseDocument(source)
  if (document.errors.length || !isMap(document.contents))
    throw new ContentError("잘못된 YAML 프론트매터입니다.")
  const mapping = document.get("cover", true)
  if (mapping === undefined) {
    if (cover === null) return source
    if (document.contents.flow) throw new ContentError("인라인 루트 YAML은 지원하지 않습니다.")
    return `${source}${source.endsWith("\n") ? "" : "\n"}cover:\n  image: ${JSON.stringify(cover.image)}\n  alt: ${JSON.stringify(cover.alt)}\n  relative: ${cover.relative}\n`
  }
  if (!isMap(mapping) || mapping.anchor || !mapping.range)
    throw new ContentError("대표 이미지 메타데이터가 매핑 형식이 아닙니다.")
  const values = cover ?? { image: "", alt: "" }
  const edits: { start: number; end: number; text: string }[] = []
  const missing: string[] = []
  for (const [key, value] of Object.entries(values)) {
    const node = mapping.get(key, true)
    if (node === undefined) {
      missing.push(`${key}: ${JSON.stringify(value)}`)
      continue
    }
    if (!isScalar(node) || node.anchor || !node.range)
      throw new ContentError("대표 이미지 필드 형식이 올바르지 않습니다.")
    if (node.value === value) continue
    const original = source.slice(node.range[0], node.range[1])
    const comment = /^[|>][^\r\n]*?(#[^\r\n]*)/.exec(original)?.[1]
    const endOfLine = original.endsWith("\r\n") ? "\r\n" : original.endsWith("\n") ? "\n" : ""
    edits.push({
      start: node.range[0],
      end: node.range[1],
      text: JSON.stringify(value) + (comment ? ` ${comment}` : "") + endOfLine,
    })
  }
  if (missing.length) {
    const start = mapping.range[0]
    if (mapping.flow) {
      edits.push({
        start: start + 1,
        end: start + 1,
        text: missing.join(", ") + (mapping.items.length ? ", " : ""),
      })
    } else {
      const indent = " ".repeat(start - source.lastIndexOf("\n", start - 1) - 1)
      edits.push({ start, end: start, text: `${missing.join(`\n${indent}`)}\n${indent}` })
    }
  }
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source)
}

function assertWithin(parent: string, target: string): void {
  const child = relative(parent, target)
  if (child === ".." || child.startsWith(`..${sep}`) || resolve(parent, child) !== target)
    throw new ContentError("이미지 경로가 허용된 디렉터리 밖을 가리킵니다.")
}

function realBundle(contentPath: string, root: string): string {
  const realRoot = realpathSync(root)
  const posts = realpathSync(join(realRoot, "content/posts"))
  assertWithin(realRoot, posts)
  const post = resolveContentPath(realRoot, contentPath)
  const bundle = realpathSync(dirname(post))
  assertWithin(posts, bundle)
  assertWithin(bundle, realpathSync(post))
  if (!statSync(post).isFile()) throw new ContentError("글을 찾을 수 없습니다.")
  return bundle
}

export async function saveCoverImage(
  contentPath: string,
  image: File,
  root = repositoryRoot,
): Promise<ImageUploadResponse> {
  if (!image.size || image.size > 1024 * 1024)
    throw new ContentError("대표 이미지는 1MiB 이하여야 합니다.")
  const bytes = Buffer.from(await image.arrayBuffer())
  const signatures: Record<string, { extension: string; valid: boolean }> = {
    "image/png": {
      extension: "png",
      valid: bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    },
    "image/jpeg": {
      extension: "jpg",
      valid: bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    },
    "image/gif": {
      extension: "gif",
      valid: ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii")),
    },
    "image/webp": {
      extension: "webp",
      valid:
        bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
        bytes.subarray(8, 12).toString("ascii") === "WEBP",
    },
  }
  const format = signatures[image.type]
  if (!format?.valid)
    throw new ContentError("PNG, JPEG, GIF, WebP 이미지의 MIME 및 파일 서명이 일치해야 합니다.")
  const bundle = realBundle(contentPath, root)
  const directory = join(bundle, "images")
  mkdirSync(directory, { recursive: true })
  const realDirectory = realpathSync(directory)
  assertWithin(bundle, realDirectory)
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14)
  const name = `cover-${stamp.slice(0, 8)}-${stamp.slice(8)}-${crypto.randomUUID()}.${format.extension}`
  const markdownPath = `images/${name}`
  writeFileSync(join(realDirectory, name), bytes, { flag: "wx" })
  return {
    markdownPath,
    previewUrl: `/api/cover-media?path=${encodeURIComponent(contentPath)}&src=${encodeURIComponent(markdownPath)}`,
  }
}

function validateLocalSource(source: string): void {
  if (
    !source ||
    source.length > 2048 ||
    source !== source.trim() ||
    /[\\\\:%?#\p{Cc}]/u.test(source) ||
    source.startsWith("//") ||
    source.split("/").includes("..")
  )
    throw new ContentError("안전하지 않은 대표 이미지 경로입니다.")
  if (
    ![".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"].includes(
      extname(source).toLowerCase(),
    )
  )
    throw new ContentError("지원하지 않는 대표 이미지 형식입니다.")
}

// Check each existing component, including a symlink preceding a missing leaf.
function scopedFile(base: string, source: string): string | null {
  let candidate = base
  for (const part of source.split("/").filter((part) => part && part !== ".")) {
    candidate = join(candidate, part)
    try {
      lstatSync(candidate)
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
      throw error
    }
    try {
      assertWithin(base, realpathSync(candidate))
    } catch (error) {
      if (error instanceof ContentError) throw error
      throw new ContentError("대표 이미지 링크를 확인할 수 없습니다.")
    }
  }
  if (!statSync(candidate).isFile()) throw new ContentError("대표 이미지 파일이 아닙니다.")
  return realpathSync(candidate)
}

export function resolveCoverMediaPath(
  contentPath: string,
  source: string,
  root = repositoryRoot,
): string {
  validateLocalSource(source)
  const bundle = realBundle(contentPath, root)
  if (!source.startsWith("/")) {
    const bundled = scopedFile(bundle, source)
    if (bundled) return bundled
  }
  const realRoot = realpathSync(root)
  const staticDirectory = join(realRoot, "static")
  try {
    lstatSync(staticDirectory)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      throw new ContentError("이미지를 찾을 수 없습니다.", 404)
    throw error
  }
  const realStatic = realpathSync(staticDirectory)
  assertWithin(realRoot, realStatic)
  const file = scopedFile(realStatic, source.replace(/^\//, ""))
  if (!file) throw new ContentError("이미지를 찾을 수 없습니다.", 404)
  return file
}

export function validateCoverForSave(
  contentPath: string,
  cover: PostCover | null,
  root = repositoryRoot,
): void {
  realBundle(contentPath, root)
  if (cover === null) return
  postCoverSchema.parse(cover)
  if (!cover.image) return
  if (/^https?:\/\//i.test(cover.image)) {
    const url = URL.parse(cover.image)
    if (!url?.hostname || /[\\\\\p{Cc}]/u.test(cover.image) || cover.image !== cover.image.trim())
      throw new ContentError("안전하지 않은 대표 이미지 URL입니다.")
    return
  }
  try {
    resolveCoverMediaPath(contentPath, cover.image, root)
  } catch (error) {
    // A broken but safe reference remains editable; never permit an escaping path.
    if (error instanceof ContentError && error.status === 404) return
    throw error
  }
}

export function normalizeCover(value: unknown): PostCover | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("image" in value) ||
    typeof value.image !== "string" ||
    !value.image.trim()
  )
    return null
  const parsed = postCoverSchema.safeParse({
    image: value.image,
    alt: "alt" in value && typeof value.alt === "string" ? value.alt : "",
    relative: "relative" in value && typeof value.relative === "boolean" ? value.relative : false,
  })
  return parsed.success ? parsed.data : null
}
