import { LANGUAGES, type NewPostFields } from "../../document/codec"
import type { FrontMatter, Language, PostBundle } from "../../shared/onsite/document"

export interface PostMetadata {
  readonly slug: string
  readonly title: Readonly<Record<Language, string>>
  readonly authors: readonly string[]
  readonly category: string
  readonly tags: readonly string[]
  readonly series: string
  readonly seriesIndex: number | null
  readonly cover: { readonly image: string; readonly alt: string } | null
  readonly date: string
  readonly draft: boolean
  /** GitHub logins the authors allow to edit this post (`editors:` front matter). */
  readonly editors: readonly string[]
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function parseTags(text: string): string[] {
  const seen = new Set<string>()
  for (const part of text.split(/[,\n]/)) {
    const tag = part.trim()
    if (tag) seen.add(tag)
  }
  return [...seen]
}

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

export function formatLocalIso(date: Date): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? "+" : "-"
  const hours = pad(Math.floor(Math.abs(offset) / 60))
  const minutes = pad(Math.abs(offset) % 60)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${hours}:${minutes}`
}

export function toDateTimeLocal(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromDateTimeLocal(value: string, fallback: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : formatLocalIso(date)
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string")
  return typeof value === "string" && value ? [value] : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function metadataFromBundle(bundle: PostBundle): PostMetadata {
  const ko = bundle.ko.frontMatter
  const cover = ko["cover"]
  const seriesIndex = ko["series_idx"]
  return {
    slug: bundle.slug,
    title: { ko: ko.title, en: bundle.en.frontMatter.title },
    authors: ko.authors,
    category: ko.categories[0] ?? "",
    tags: ko.tags ?? [],
    series: stringList(ko["series"])[0] ?? "",
    seriesIndex: typeof seriesIndex === "number" ? seriesIndex : null,
    cover:
      isRecord(cover) && typeof cover["image"] === "string" && cover["image"]
        ? { image: cover["image"], alt: typeof cover["alt"] === "string" ? cover["alt"] : "" }
        : null,
    date: typeof ko.date === "string" ? ko.date : "",
    draft: ko.draft,
    editors: stringList(ko["editors"]),
  }
}

function applyToFrontMatter(
  frontMatter: FrontMatter,
  metadata: PostMetadata,
  language: Language,
): FrontMatter {
  const existingCover = isRecord(frontMatter["cover"]) ? frontMatter["cover"] : {}
  const next: Record<string, unknown> = {
    ...frontMatter,
    title: metadata.title[language],
    date: metadata.date || undefined,
    draft: metadata.draft,
    authors: [...metadata.authors],
    categories: metadata.category ? [metadata.category] : [],
    tags: [...metadata.tags],
    series: metadata.series ? [metadata.series] : undefined,
    series_idx: metadata.seriesIndex ?? undefined,
    editors: metadata.editors.length ? [...metadata.editors] : undefined,
    cover: metadata.cover
      ? {
          ...existingCover,
          image: metadata.cover.image,
          alt: metadata.cover.alt,
          relative: true,
        }
      : undefined,
  }
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
  return next as FrontMatter
}

export function applyMetadata(bundle: PostBundle, metadata: PostMetadata): PostBundle {
  const next = { ...bundle }
  for (const language of LANGUAGES) {
    next[language] = {
      ...bundle[language],
      frontMatter: applyToFrontMatter(bundle[language].frontMatter, metadata, language),
    }
  }
  return next
}

export function newPostFields(metadata: PostMetadata): NewPostFields {
  return {
    slug: metadata.slug,
    title: metadata.title,
    date: metadata.date,
    authors: metadata.authors,
    category: metadata.category,
    tags: metadata.tags,
    ...(metadata.series ? { series: metadata.series } : {}),
    ...(metadata.seriesIndex !== null ? { seriesIndex: metadata.seriesIndex } : {}),
    ...(metadata.cover ? { cover: metadata.cover } : {}),
    draft: metadata.draft,
  }
}

export function metadataErrors(metadata: PostMetadata, authors: readonly string[]): string[] {
  const errors: string[] = []
  if (!metadata.title.ko.trim()) errors.push("한국어 제목을 입력하세요.")
  if (!SLUG_PATTERN.test(metadata.slug)) {
    errors.push("슬러그는 소문자 영문, 숫자, 하이픈만 쓸 수 있습니다.")
  }
  if (metadata.authors.length === 0) errors.push("작성자를 한 명 이상 선택하세요.")
  if (metadata.authors.some((author) => !authors.includes(author))) {
    errors.push("작성자는 content/authors 목록에 있는 이름이어야 합니다.")
  }
  if (!metadata.category) errors.push("카테고리를 선택하세요.")
  if (metadata.cover && !metadata.cover.alt.trim())
    errors.push("커버 이미지의 대체 텍스트를 입력하세요.")
  return errors
}
