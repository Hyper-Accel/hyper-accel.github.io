import { existsSync } from "node:fs"
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path"
import { isScalar, parse, parseDocument } from "yaml"
import { z } from "zod"
import {
  type PostCover,
  type PostDocument,
  type PostSummary,
  postPathSchema,
} from "../shared/contracts"
import { normalizeCover, patchCoverFrontmatter, validateCoverForSave } from "./cover"
import { ContentError, HugoBuildError, RevisionConflictError } from "./errors"
import { prepareCommand } from "./process-command"

const frontmatterSchema = z
  .object({
    title: z.string().default("제목 없음"),
    draft: z.boolean().default(false),
    date: z.coerce.date().optional().catch(undefined),
  })
  .passthrough()

const imageExtensions = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const

type MarkdownParts = {
  readonly frontmatter: string
  readonly body: string
}

export function findRepositoryRoot(moduleDirectory: string, workingDirectory: string): string {
  const starts = [moduleDirectory, workingDirectory]
  for (const start of starts) {
    let candidate = resolve(start)
    while (dirname(candidate) !== candidate) {
      if (
        existsSync(join(candidate, "hugo.yaml")) &&
        existsSync(join(candidate, "content/posts"))
      ) {
        return candidate
      }
      candidate = dirname(candidate)
    }
  }
  throw new ContentError("Hugo 저장소 루트를 찾을 수 없습니다.")
}

export const repositoryRoot = findRepositoryRoot(import.meta.dir, process.cwd())

export function splitMarkdownDocument(source: string): MarkdownParts {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n(?:\r?\n)?/.exec(source)
  if (!match || match[1] === undefined) {
    throw new ContentError("YAML 프론트매터를 찾을 수 없습니다.")
  }
  return {
    frontmatter: `${match[1]}\n`,
    body: source.slice(match[0].length),
  }
}

export function patchFrontmatterScalar(frontmatter: string, key: "title", value: string): string {
  const document = parseDocument(frontmatter)
  const node = document.get(key, true)
  if (document.errors.length || !isScalar(node) || node.anchor || !node.range) {
    throw new ContentError(`프론트매터에 올바른 ${key} 필드가 없습니다.`)
  }
  if (node.value === value) return frontmatter
  const original = frontmatter.slice(node.range[0], node.range[1])
  const comment = /^[|>][^\r\n]*?(#[^\r\n]*)/.exec(original)?.[1]
  const endOfLine = original.endsWith("\r\n") ? "\r\n" : original.endsWith("\n") ? "\n" : ""
  return (
    frontmatter.slice(0, node.range[0]) +
    JSON.stringify(value) +
    (comment ? ` ${comment}` : "") +
    endOfLine +
    frontmatter.slice(node.range[1])
  )
}

export function resolveContentPath(root: string, contentPath: string): string {
  const parsedPath = postPathSchema.parse(contentPath)
  const absolute = resolve(root, parsedPath)
  const postsRoot = resolve(root, "content/posts")
  if (!absolute.startsWith(`${postsRoot}${sep}`)) {
    throw new ContentError("글 경로가 content/posts 밖을 가리킵니다.")
  }
  return absolute
}

export function buildImageName(mime: string, now: Date, suffix: string): string {
  const extension = imageExtensions[mime as keyof typeof imageExtensions]
  if (!extension) {
    throw new ContentError("PNG, JPEG, GIF, WebP 이미지만 붙여넣을 수 있습니다.")
  }
  const compact = now.toISOString().replace(/\D/g, "").slice(0, 14)
  const stamp = `${compact.slice(0, 8)}-${compact.slice(8)}`
  return `images/pasted-${stamp}-${suffix}.${extension}`
}

function revisionOf(source: string): string {
  return new Bun.CryptoHasher("sha256").update(source).digest("hex")
}

function languageOf(fileName: string): string {
  const match = /^index\.([a-z-]+)\.md$/.exec(fileName)
  return match?.[1] ?? "ko"
}

export function normalizeContentPath(scannedPath: string): string {
  return scannedPath.replaceAll("\\", "/")
}

type DatedPost = {
  readonly summary: PostSummary
  readonly publishedAt: string
}

export async function listPosts(): Promise<readonly PostSummary[]> {
  const glob = new Bun.Glob("content/posts/*/index*.md")
  const dated: DatedPost[] = []
  for await (const scanned of glob.scan({ cwd: repositoryRoot, onlyFiles: true })) {
    const path = normalizeContentPath(scanned)
    const source = await Bun.file(join(repositoryRoot, path)).text()
    const parts = splitMarkdownDocument(source)
    const metadata = frontmatterSchema.parse(parse(parts.frontmatter))
    const stats = await Bun.file(join(repositoryRoot, path)).stat()
    const modifiedAt = stats.mtime.toISOString()
    dated.push({
      summary: {
        path: postPathSchema.parse(path),
        slug: basename(dirname(path)),
        language: languageOf(basename(path)),
        title: metadata.title,
        draft: metadata.draft,
        modifiedAt,
      },
      publishedAt: metadata.date?.toISOString() ?? modifiedAt,
    })
  }
  return dated
    .sort(
      (left, right) =>
        right.publishedAt.localeCompare(left.publishedAt) ||
        left.summary.slug.localeCompare(right.summary.slug) ||
        left.summary.language.localeCompare(right.summary.language),
    )
    .map((entry) => entry.summary)
}

export async function readPost(contentPath: string, root = repositoryRoot): Promise<PostDocument> {
  const absolute = resolveContentPath(root, contentPath)
  const source = await Bun.file(absolute).text()
  const parts = splitMarkdownDocument(source)
  const metadata = frontmatterSchema.parse(parse(parts.frontmatter))
  return {
    path: postPathSchema.parse(contentPath),
    slug: basename(dirname(contentPath)),
    language: languageOf(basename(contentPath)),
    title: metadata.title,
    draft: metadata.draft,
    body: parts.body,
    revision: revisionOf(source),
    cover: normalizeCover(metadata["cover"]),
  }
}

async function validateHugoBuild(root = repositoryRoot): Promise<void> {
  const process = Bun.spawn(
    prepareCommand(["hugo", "--renderToMemory", "--quiet", "--noBuildLock"]),
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [exitCode, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new HugoBuildError(stderr.trim() || "알 수 없는 Hugo 오류")
  }
}

export async function savePost(
  contentPath: string,
  title: string,
  body: string,
  expectedRevision: string,
  cover?: PostCover | null,
  root = repositoryRoot,
): Promise<string> {
  const absolute = resolveContentPath(root, contentPath)
  const original = await Bun.file(absolute).text()
  if (revisionOf(original) !== expectedRevision) {
    throw new RevisionConflictError()
  }
  const frame = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n(?:\r?\n)?)/.exec(original)
  if (!frame?.[1] || frame[2] === undefined || !frame[3])
    throw new ContentError("YAML 프론트매터를 찾을 수 없습니다.")
  let frontmatter = patchFrontmatterScalar(frame[2], "title", title)
  if (cover !== undefined) {
    validateCoverForSave(contentPath, cover, root)
    frontmatter = patchCoverFrontmatter(frontmatter, cover)
  }
  const next = `${frame[1]}${frontmatter}${frame[3]}${body}`
  await Bun.write(absolute, next)
  try {
    await validateHugoBuild(root)
  } catch (error: unknown) {
    await Bun.write(absolute, original)
    if (error instanceof HugoBuildError) {
      throw error
    }
    throw new HugoBuildError(error instanceof Error ? error.message : String(error))
  }
  return revisionOf(next)
}

export async function saveImage(
  contentPath: string,
  image: File,
): Promise<{ readonly markdownPath: string; readonly absolutePath: string }> {
  if (image.size > 15 * 1024 * 1024) {
    throw new ContentError("이미지는 15MB보다 작아야 합니다.")
  }
  const postFile = resolveContentPath(repositoryRoot, contentPath)
  const suffix = crypto.randomUUID().slice(0, 6)
  const markdownPath = buildImageName(image.type, new Date(), suffix)
  const absolutePath = join(dirname(postFile), markdownPath)
  await Bun.write(absolutePath, image)
  return { markdownPath, absolutePath }
}

export function resolveMediaPath(contentPath: string, source: string): string {
  const postFile = resolveContentPath(repositoryRoot, contentPath)
  const postDirectory = dirname(postFile)
  const absolute = resolve(postDirectory, source)
  const relativePath = relative(postDirectory, absolute)
  if (relativePath.startsWith("..") || relativePath.includes(`${sep}..${sep}`)) {
    throw new ContentError("이미지 경로가 글 번들 밖을 가리킵니다.")
  }
  const extension = extname(absolute).toLowerCase()
  if (![".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(extension)) {
    throw new ContentError("지원하지 않는 미디어 형식입니다.")
  }
  return absolute
}
