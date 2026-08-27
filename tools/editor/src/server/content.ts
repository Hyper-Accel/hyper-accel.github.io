import { basename, dirname, extname, join, relative, resolve, sep } from "node:path"
import { parse } from "yaml"
import { z } from "zod"
import { type PostDocument, type PostSummary, postPathSchema } from "../shared/contracts"
import { ContentError, HugoBuildError, RevisionConflictError } from "./errors"

const frontmatterSchema = z
  .object({
    title: z.string().default("제목 없음"),
    draft: z.boolean().default(false),
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

export const repositoryRoot = resolve(import.meta.dir, "../../../..")

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
  const line = new RegExp(`^${key}:.*$`, "m")
  if (!line.test(frontmatter)) {
    throw new ContentError(`프론트매터에 ${key} 필드가 없습니다.`)
  }
  return frontmatter.replace(line, `${key}: ${JSON.stringify(value)}`)
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

export async function listPosts(): Promise<readonly PostSummary[]> {
  const glob = new Bun.Glob("content/posts/*/index*.md")
  const posts: PostSummary[] = []
  for await (const path of glob.scan({ cwd: repositoryRoot, onlyFiles: true })) {
    const source = await Bun.file(join(repositoryRoot, path)).text()
    const parts = splitMarkdownDocument(source)
    const metadata = frontmatterSchema.parse(parse(parts.frontmatter))
    const stats = await Bun.file(join(repositoryRoot, path)).stat()
    posts.push({
      path,
      slug: basename(dirname(path)),
      language: languageOf(basename(path)),
      title: metadata.title,
      draft: metadata.draft,
      modifiedAt: stats.mtime.toISOString(),
    })
  }
  return posts.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
}

export async function readPost(contentPath: string): Promise<PostDocument> {
  const absolute = resolveContentPath(repositoryRoot, contentPath)
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
  }
}

async function validateHugoBuild(): Promise<void> {
  const process = Bun.spawn(["hugo", "--renderToMemory", "--quiet", "--noBuildLock"], {
    cwd: repositoryRoot,
    stdout: "pipe",
    stderr: "pipe",
  })
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
): Promise<string> {
  const absolute = resolveContentPath(repositoryRoot, contentPath)
  const original = await Bun.file(absolute).text()
  if (revisionOf(original) !== expectedRevision) {
    throw new RevisionConflictError()
  }
  const parts = splitMarkdownDocument(original)
  const frontmatter = patchFrontmatterScalar(parts.frontmatter, "title", title)
  const next = `---\n${frontmatter}---\n\n${body.trimEnd()}\n`
  await Bun.write(absolute, next)
  try {
    await validateHugoBuild()
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
