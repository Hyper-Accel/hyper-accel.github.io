import {
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { join, relative, sep } from "node:path"
import { stringify } from "yaml"
import {
  type CreatePostRequest,
  createPostRequestSchema,
  type RegisterAuthorRequest,
  registerAuthorRequestSchema,
} from "../shared/contracts"
import { repositoryRoot } from "./content"
import { ContentError } from "./errors"

function statIfPresent(path: string) {
  try {
    return lstatSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

function contentDirectory(root: string, name: "posts" | "authors"): string {
  const canonicalRoot = realpathSync(root)
  const content = join(canonicalRoot, "content")
  const path = join(content, name)
  for (const directory of [content, path]) {
    const stats = statIfPresent(directory)
    if (!stats?.isDirectory() || stats.isSymbolicLink()) {
      throw new ContentError("콘텐츠 디렉터리가 없거나 안전하지 않은 심볼릭 링크입니다.")
    }
    const contained = relative(canonicalRoot, realpathSync(directory))
    if (contained === ".." || contained.startsWith(`..${sep}`)) {
      throw new ContentError("콘텐츠 경로가 저장소 밖을 가리킵니다.")
    }
  }
  return path
}

function registeredAuthors(authorsRoot: string): string[] {
  return readdirSync(authorsRoot)
    .filter((name) => {
      const directory = statIfPresent(join(authorsRoot, name))
      if (!directory?.isDirectory() || directory.isSymbolicLink()) return false
      const profile = statIfPresent(join(authorsRoot, name, "_index.md"))
      return Boolean(profile?.isFile() && !profile.isSymbolicLink())
    })
    .sort((a, b) => a.localeCompare(b))
}

export async function listAuthors(root = repositoryRoot): Promise<string[]> {
  return registeredAuthors(contentDirectory(root, "authors"))
}

function authorState(authorsRoot: string, author: string, collisionStatus = 400) {
  const entries = readdirSync(authorsRoot)
  const collision = entries.find(
    (name) =>
      name !== author &&
      name.normalize("NFC").toLowerCase() === author.normalize("NFC").toLowerCase(),
  )
  if (collision)
    throw new ContentError(
      `이미 존재하는 작성자 이름 '${collision}'을 정확히 사용해 주세요.`,
      collisionStatus,
    )
  return {
    known: registeredAuthors(authorsRoot).includes(author),
    occupied: entries.includes(author),
  }
}

function markdown(metadata: Record<string, unknown>): string {
  return `---\n${stringify(metadata)}---\n\n`
}

type OwnedPath = { path: string; ino: number; dev: number; directory: boolean }
type CreationWriter = {
  directory: (path: string) => void
  file: (path: string, source: string) => void
}

// Keep each transaction synchronous. Exclusive mkdir/open also arbitrate other processes.
function withOwnedPaths<T>(operation: (writer: CreationWriter) => T, failureMessage: string): T {
  const owned: OwnedPath[] = []
  function directory(path: string) {
    mkdirSync(path)
    const stats = lstatSync(path)
    owned.push({ path, ino: stats.ino, dev: stats.dev, directory: true })
  }
  function file(path: string, source: string) {
    const fd = openSync(path, "wx")
    try {
      const stats = fstatSync(fd)
      owned.push({ path, ino: stats.ino, dev: stats.dev, directory: false })
      writeFileSync(fd, source, "utf8")
    } finally {
      closeSync(fd)
    }
  }
  try {
    return operation({ directory, file })
  } catch (error) {
    // Never recursively delete: remove only the exact inodes this transaction owns.
    const cleanupErrors: unknown[] = []
    for (const entry of owned.reverse()) {
      try {
        const stats = statIfPresent(entry.path)
        if (stats?.ino === entry.ino && stats.dev === entry.dev && !stats.isSymbolicLink()) {
          if (entry.directory) rmdirSync(entry.path)
          else unlinkSync(entry.path)
        }
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError)
      }
    }
    if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], failureMessage)
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new ContentError("같은 글 디렉터리 또는 작성자 디렉터리가 이미 존재합니다.", 409)
    }
    throw error
  }
}

function writeAuthor(
  writer: CreationWriter,
  authorsRoot: string,
  author: string,
  profile: RegisterAuthorRequest["profile"],
) {
  const authorDirectory = join(authorsRoot, author)
  writer.directory(authorDirectory)
  const common = {
    title: author,
    image: profile.image ?? "",
    github: profile.github ?? "",
    linkedin: profile.linkedin ?? "",
  }
  writer.file(join(authorDirectory, "_index.md"), markdown({ ...common, bio: profile.bioKo }))
  writer.file(join(authorDirectory, "_index.en.md"), markdown({ ...common, bio: profile.bioEn }))
}

export async function registerAuthor(
  request: RegisterAuthorRequest,
  root = repositoryRoot,
): Promise<{ author: string }> {
  const parsed = registerAuthorRequestSchema.safeParse(request)
  if (!parsed.success) throw new ContentError("작성자 이름 및 프로필 입력을 확인해 주세요.")
  const input = parsed.data
  const authorsRoot = contentDirectory(root, "authors")
  if (authorState(authorsRoot, input.author, 409).occupied) {
    throw new ContentError("작성자 디렉터리가 이미 존재합니다. 기존 이름을 확인해 주세요.", 409)
  }
  return withOwnedPaths((writer) => {
    writeAuthor(writer, authorsRoot, input.author, input.profile)
    return { author: input.author }
  }, "작성자 등록 및 정리 실패")
}

export async function createPost(
  request: CreatePostRequest,
  root = repositoryRoot,
): Promise<{ path: string }> {
  const parsed = createPostRequestSchema.safeParse(request)
  if (!parsed.success)
    throw new ContentError("디렉터리, 제목, 작성자 및 프로필 입력을 확인해 주세요.")
  const input = parsed.data
  const postsRoot = contentDirectory(root, "posts")
  const authorsRoot = contentDirectory(root, "authors")
  const { known, occupied } = authorState(authorsRoot, input.author)
  if (!known && occupied) {
    throw new ContentError(
      "작성자 디렉터리가 이미 있지만 프로필이 불완전합니다. 기존 파일을 확인해 주세요.",
      409,
    )
  }
  if (!known && !input.profile)
    throw new ContentError("등록되지 않은 작성자입니다. 작성자 프로필을 먼저 입력해 주세요.")
  const bundle = join(postsRoot, input.directory)
  return withOwnedPaths((writer) => {
    writer.directory(bundle)
    if (!known && input.profile) writeAuthor(writer, authorsRoot, input.author, input.profile)
    const date = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("Z", "+09:00")
    const source = markdown({
      title: input.title,
      authors: [input.author],
      date,
      comments: true,
      cover: { image: "", alt: "", relative: true },
      tags: [],
      categories: [],
      summary: "",
    })
    writer.file(join(bundle, "index.md"), source)
    writer.file(join(bundle, "index.en.md"), source)
    return { path: `content/posts/${input.directory}/index.md` }
  }, "글 생성 및 정리 실패")
}
