import type { z } from "zod"
import {
  type BundleFile,
  type BundleImage,
  type BundleLanguage,
  type DocumentCodec,
  type DocumentIssue,
  type FrontMatter,
  type Language,
  newSlugSchema,
  type ParseBundleInput,
  type ParseBundleResult,
  type PostBlock,
  type PostBundle,
  postBundleSchema,
  type SerializedBundle,
  slugSchema,
} from "../shared/onsite/document"
import type { BlockSourceEntry } from "../shared/onsite/render"
import { type BlockSegment, markerLine, splitBody } from "./blocks"
import { isAllowedCategory } from "./categories"
import {
  formatFrontMatter,
  normalizeSource,
  parseFrontMatter,
  patchFrontMatter,
  splitSource,
} from "./front-matter"
import { bundleImagePath, collectImageReferences } from "./images"

export const MAX_IMAGE_BYTES = 1_048_576
export const LANGUAGES = ["ko", "en"] as const
const LANGUAGE_LABEL: Record<Language, string> = { ko: "한국어", en: "영어" }

export interface ParsedLanguageSource {
  readonly head: string
  readonly rawFrontMatter: string
  readonly frontMatter: FrontMatter
  readonly segments: readonly BlockSegment[]
  readonly trailing: string
  readonly mode: "marked" | "legacy"
}

export type LanguageParseResult =
  | { readonly ok: true; readonly value: ParsedLanguageSource }
  | { readonly ok: false; readonly message: string }

export interface SerializedLanguage {
  readonly source: string
  readonly sourceMap: readonly BlockSourceEntry[]
}

export interface SerializedBundleWithSourceMap extends SerializedBundle {
  readonly sourceMap: readonly BlockSourceEntry[]
}

export interface NewPostFields {
  readonly slug: string
  readonly title: Readonly<Record<Language, string>>
  readonly date: string
  readonly authors: readonly string[]
  readonly category: string
  readonly tags: readonly string[]
  readonly series?: string
  readonly seriesIndex?: number
  readonly cover?: { readonly image: string; readonly alt: string; readonly caption?: string }
  readonly draft: boolean
}

export function languagePath(slug: string, language: Language): string {
  return `content/posts/${slug}/index${language === "en" ? ".en" : ""}.md`
}

export function newBlockId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return `b${Array.from(bytes, (byte) => byte.toString(36)).join("")}`
}

export function parseLanguageSource(source: string): LanguageParseResult {
  const split = splitSource(normalizeSource(source))
  if (!split) return { ok: false, message: "YAML front matter를 찾을 수 없습니다." }
  const frontMatter = parseFrontMatter(split.rawFrontMatter)
  if (!frontMatter.ok) return { ok: false, message: frontMatter.message }
  const body = splitBody(split.body)
  return {
    ok: true,
    value: {
      head: split.head,
      rawFrontMatter: split.rawFrontMatter,
      frontMatter: frontMatter.value,
      segments: body.segments,
      trailing: body.trailing,
      mode: body.mode,
    },
  }
}

function countLines(text: string): number {
  return text.split("\n").length - 1
}

export function serializeLanguage(doc: BundleLanguage): SerializedLanguage {
  const head = `---\n${patchFrontMatter(doc.rawFrontMatter, doc.frontMatter)}---\n`
  if (doc.blocks.length === 0) return { source: head, sourceMap: [] }
  const parts: string[] = []
  const sourceMap: BlockSourceEntry[] = []
  let marker = countLines(head) + 2
  for (const block of doc.blocks) {
    const markdown = block.markdown.replace(/\n+$/, "")
    const lines = markdown.split("\n").length
    sourceMap.push({
      blockId: block.id,
      path: doc.path,
      startLine: marker + 1,
      endLine: marker + lines,
      text: markdown,
    })
    parts.push(`${markerLine(block.id)}\n${markdown}`)
    marker += lines + 2
  }
  return { source: `${head}\n${parts.join("\n\n")}\n`, sourceMap }
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

const blobShaCache = new WeakMap<Blob, Promise<string>>()

export function gitBlobSha(blob: Blob): Promise<string> {
  const cached = blobShaCache.get(blob)
  if (cached) return cached
  const computed = (async () => {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`)
    const payload = new Uint8Array(header.byteLength + bytes.byteLength)
    payload.set(header, 0)
    payload.set(bytes, header.byteLength)
    return hex(await crypto.subtle.digest("SHA-1", payload))
  })()
  blobShaCache.set(blob, computed)
  return computed
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  for (let offset = 0; offset < bytes.length; offset += 0x2000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x2000))
  }
  return btoa(binary)
}

async function snapshotHashOf(
  slug: string,
  sources: readonly { readonly path: string; readonly source: string }[],
  images: readonly BundleImage[],
): Promise<string> {
  const tuples: string[][] = sources.map((entry) => [entry.path, "utf-8", entry.source])
  for (const image of images) {
    const sha = image.status === "committed" ? image.sha : await gitBlobSha(image.blob)
    tuples.push([`content/posts/${slug}/${image.path}`, "git-blob-sha", sha])
  }
  tuples.sort((left, right) => {
    const a = left[0] ?? ""
    const b = right[0] ?? ""
    return a < b ? -1 : a > b ? 1 : 0
  })
  const payload = new TextEncoder().encode(JSON.stringify(tuples))
  return hex(await crypto.subtle.digest("SHA-256", payload))
}

export function computeSnapshotHash(bundle: PostBundle): Promise<string> {
  return snapshotHashOf(
    bundle.slug,
    LANGUAGES.map((language) => ({
      path: bundle[language].path,
      source: serializeLanguage(bundle[language]).source,
    })),
    bundle.images,
  )
}

export async function serializeBundle(bundle: PostBundle): Promise<SerializedBundleWithSourceMap> {
  const ko = serializeLanguage(bundle.ko)
  const en = serializeLanguage(bundle.en)
  const files: BundleFile[] = [
    { path: bundle.ko.path, encoding: "utf-8", content: ko.source },
    { path: bundle.en.path, encoding: "utf-8", content: en.source },
  ]
  for (const image of bundle.images) {
    if (image.status !== "pending") continue
    files.push({
      path: `content/posts/${bundle.slug}/${image.path}`,
      encoding: "base64",
      content: await blobToBase64(image.blob),
    })
  }
  const snapshotHash = await snapshotHashOf(
    bundle.slug,
    [
      { path: bundle.ko.path, source: ko.source },
      { path: bundle.en.path, source: en.source },
    ],
    bundle.images,
  )
  return { files, snapshotHash, sourceMap: [...ko.sourceMap, ...en.sourceMap] }
}

interface PairedBlocks {
  readonly ko: readonly PostBlock[]
  readonly en: readonly PostBlock[]
  readonly migrated: boolean
}

type PairingResult =
  | { readonly ok: true; readonly value: PairedBlocks }
  | { readonly ok: false; readonly issue: DocumentIssue }

function pairingIssue(message: string, language?: Language): PairingResult {
  return {
    ok: false,
    issue: language ? { code: "pairing", language, message } : { code: "pairing", message },
  }
}

function sameSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function legacyId(slug: string, position: number, used: ReadonlySet<string>): string {
  let id = `${slug}-${position}`
  for (let suffix = 1; used.has(id); suffix += 1) id = `${slug}-${position}-${suffix}`
  return id
}

function mergeMarked(ko: readonly BlockSegment[], en: readonly BlockSegment[]): PairingResult {
  const koIds = ko.map((segment) => segment.id ?? "")
  const enIds = en.map((segment) => segment.id ?? "")
  if (sameSequence(koIds, enIds)) {
    return {
      ok: true,
      value: {
        ko: ko.map((segment) => ({ id: segment.id ?? "", markdown: segment.markdown })),
        en: en.map((segment) => ({ id: segment.id ?? "", markdown: segment.markdown })),
        migrated: false,
      },
    }
  }
  const koSet = new Set(koIds)
  const enSet = new Set(enIds)
  const koCommon = koIds.filter((id) => enSet.has(id))
  const enCommon = enIds.filter((id) => koSet.has(id))
  if (!sameSequence(koCommon, enCommon)) {
    return pairingIssue("한국어와 영어의 공통 블록 순서가 다릅니다. 수동 짝 맞춤이 필요합니다.")
  }
  const koBlocks: PostBlock[] = []
  const enBlocks: PostBlock[] = []
  let i = 0
  let j = 0
  while (i < ko.length || j < en.length) {
    const left = ko[i]
    const right = en[j]
    if (left && !enSet.has(left.id ?? "")) {
      koBlocks.push({ id: left.id ?? "", markdown: left.markdown })
      enBlocks.push({ id: left.id ?? "", markdown: "" })
      i += 1
    } else if (right && !koSet.has(right.id ?? "")) {
      koBlocks.push({ id: right.id ?? "", markdown: "" })
      enBlocks.push({ id: right.id ?? "", markdown: right.markdown })
      j += 1
    } else if (left && right) {
      koBlocks.push({ id: left.id ?? "", markdown: left.markdown })
      enBlocks.push({ id: right.id ?? "", markdown: right.markdown })
      i += 1
      j += 1
    } else {
      break
    }
  }
  return { ok: true, value: { ko: koBlocks, en: enBlocks, migrated: true } }
}

export function pairSegments(
  slug: string,
  ko: readonly BlockSegment[],
  en: readonly BlockSegment[],
): PairingResult {
  for (const [language, segments] of [
    ["ko", ko],
    ["en", en],
  ] as const) {
    const ids = segments.map((segment) => segment.id).filter((id) => id !== null)
    if (new Set(ids).size !== ids.length) {
      return pairingIssue(`${LANGUAGE_LABEL[language]} 문서에 중복된 블록 ID가 있습니다.`, language)
    }
  }
  if (ko.length > 0 && en.length > 0 && ko.every((s) => s.id) && en.every((s) => s.id)) {
    return mergeMarked(ko, en)
  }
  const mirrored = ko.length === 0 || en.length === 0
  const source = ko.length === 0 ? en : ko
  const counterpart = ko.length === 0 ? ko : en
  if (!mirrored && ko.length !== en.length) {
    return pairingIssue(
      `블록 수가 다릅니다 (한국어 ${ko.length}, 영어 ${en.length}). 수동 짝 맞춤이 필요합니다.`,
    )
  }
  const used = new Set<string>()
  for (const segment of [...ko, ...en]) if (segment.id) used.add(segment.id)
  const koBlocks: PostBlock[] = []
  const enBlocks: PostBlock[] = []
  for (let index = 0; index < source.length; index += 1) {
    const first = source[index]
    const second = mirrored ? undefined : counterpart[index]
    const firstId = first?.id ?? null
    const secondId = second?.id ?? null
    if (firstId !== null && secondId !== null && firstId !== secondId) {
      return pairingIssue(`${index + 1}번째 블록의 ID가 다릅니다 (${firstId} / ${secondId}).`)
    }
    const id = firstId ?? secondId ?? legacyId(slug, index + 1, used)
    used.add(id)
    const koMarkdown = ko.length === 0 ? "" : (ko[index]?.markdown ?? "")
    const enMarkdown = en.length === 0 ? "" : (en[index]?.markdown ?? "")
    koBlocks.push({ id, markdown: koMarkdown })
    enBlocks.push({ id, markdown: enMarkdown })
  }
  return { ok: true, value: { ko: koBlocks, en: enBlocks, migrated: source.length > 0 } }
}

function frontMatterFromFields(fields: Readonly<Record<string, unknown>>): {
  readonly raw: string
  readonly value: FrontMatter
} {
  const raw = formatFrontMatter(fields)
  const parsed = parseFrontMatter(raw)
  if (!parsed.ok) throw new Error(`front matter 생성 실패: ${parsed.message}`)
  return { raw, value: parsed.value }
}

function translationStub(other: ParsedLanguageSource): ParsedLanguageSource {
  const generated = frontMatterFromFields({ ...other.frontMatter, title: "" })
  return {
    head: "",
    rawFrontMatter: generated.raw,
    frontMatter: generated.value,
    segments: [],
    trailing: "",
    mode: "legacy",
  }
}

function issueFromZod(issue: z.core.$ZodIssue): DocumentIssue {
  const [first] = issue.path
  const language = first === "ko" || first === "en" ? first : undefined
  const code: DocumentIssue["code"] = issue.path.includes("blocks")
    ? "pairing"
    : first === "images"
      ? "image"
      : "frontMatter"
  const message = `${issue.path.join(".") || "bundle"}: ${issue.message}`
  return language ? { code, language, message } : { code, message }
}

export interface ParsedLanguages {
  readonly ko: ParsedLanguageSource
  readonly en: ParsedLanguageSource
  readonly missing: readonly Language[]
}

export type ParsedLanguagesResult =
  | { readonly ok: true; readonly value: ParsedLanguages }
  | { readonly ok: false; readonly issues: readonly DocumentIssue[] }

export function parseLanguages(input: ParseBundleInput): ParsedLanguagesResult {
  if (!slugSchema.safeParse(input.slug).success) {
    return {
      ok: false,
      issues: [
        {
          code: "legacy",
          message: `슬러그 "${input.slug}"는 소문자 영문, 숫자, 하이픈만 쓸 수 있습니다.`,
        },
      ],
    }
  }
  const issues: DocumentIssue[] = []
  const parsed: Partial<Record<Language, ParsedLanguageSource>> = {}
  const missing: Language[] = []
  for (const language of LANGUAGES) {
    const source = language === "ko" ? input.ko : input.en
    if (source.trim() === "") {
      missing.push(language)
      continue
    }
    const result = parseLanguageSource(source)
    if (result.ok) parsed[language] = result.value
    else issues.push({ code: "frontMatter", language, message: result.message })
  }
  if (issues.length > 0) return { ok: false, issues }
  if (missing.length === LANGUAGES.length) {
    return {
      ok: false,
      issues: [{ code: "legacy", message: "한국어와 영어 문서가 모두 비어 있습니다." }],
    }
  }
  const ko = parsed.ko ?? (parsed.en ? translationStub(parsed.en) : undefined)
  const en = parsed.en ?? (parsed.ko ? translationStub(parsed.ko) : undefined)
  if (!ko || !en)
    return { ok: false, issues: [{ code: "legacy", message: "문서를 읽을 수 없습니다." }] }
  return { ok: true, value: { ko, en, missing } }
}

export interface LanguageMetadata {
  readonly frontMatter: FrontMatter
  readonly rawFrontMatter: string
}

export async function assembleBundle(
  input: ParseBundleInput,
  metadata: Readonly<Record<Language, LanguageMetadata>>,
  blocks: Readonly<Record<Language, readonly PostBlock[]>>,
  migratedLegacy: boolean,
): Promise<ParseBundleResult> {
  const docs: Record<Language, BundleLanguage> = {
    ko: {
      language: "ko",
      path: input.paths?.ko ?? languagePath(input.slug, "ko"),
      frontMatter: metadata.ko.frontMatter,
      rawFrontMatter: metadata.ko.rawFrontMatter,
      blocks: [...blocks.ko],
    },
    en: {
      language: "en",
      path: input.paths?.en ?? languagePath(input.slug, "en"),
      frontMatter: metadata.en.frontMatter,
      rawFrontMatter: metadata.en.rawFrontMatter,
      blocks: [...blocks.en],
    },
  }
  const snapshotHash = await snapshotHashOf(
    input.slug,
    LANGUAGES.map((language) => ({
      path: docs[language].path,
      source: serializeLanguage(docs[language]).source,
    })),
    input.images,
  )
  const bundle: PostBundle = {
    slug: input.slug,
    ko: docs.ko,
    en: docs.en,
    images: [...input.images],
    headSha: input.headSha,
    snapshotHash,
  }
  const check = postBundleSchema.safeParse(bundle)
  if (!check.success) return { ok: false, issues: check.error.issues.map(issueFromZod) }
  return { ok: true, bundle, migratedLegacy }
}

export async function parseBundle(input: ParseBundleInput): Promise<ParseBundleResult> {
  const languages = parseLanguages(input)
  if (!languages.ok) return { ok: false, issues: languages.issues }
  const { ko, en, missing } = languages.value
  const pairing = pairSegments(input.slug, ko.segments, en.segments)
  if (!pairing.ok) return { ok: false, issues: [pairing.issue] }
  return assembleBundle(
    input,
    { ko, en },
    { ko: pairing.value.ko, en: pairing.value.en },
    pairing.value.migrated || missing.length > 0,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function coverImageOf(frontMatter: FrontMatter): string | undefined {
  const cover = frontMatter["cover"]
  if (isRecord(cover) && typeof cover["image"] === "string") return cover["image"]
  return undefined
}

export function validateBundle(
  bundle: PostBundle,
  purpose: "save" | "review" | "publish",
): readonly DocumentIssue[] {
  const issues: DocumentIssue[] = []
  const schema = postBundleSchema.safeParse(bundle)
  if (!schema.success) issues.push(...schema.error.issues.map(issueFromZod))
  if (purpose === "save") return issues
  for (const language of LANGUAGES) {
    const label = LANGUAGE_LABEL[language]
    const frontMatter = bundle[language].frontMatter
    if (frontMatter.title.trim() === "") {
      issues.push({ code: "frontMatter", language, message: `${label} 제목이 비어 있습니다.` })
    }
    if (frontMatter.authors.length === 0) {
      issues.push({ code: "frontMatter", language, message: `${label} 글의 작성자를 선택하세요.` })
    }
    const [category] = frontMatter.categories
    if (frontMatter.categories.length !== 1 || category === undefined) {
      issues.push({
        code: "frontMatter",
        language,
        message: `${label} 글의 카테고리는 정확히 하나여야 합니다.`,
      })
    } else if (!isAllowedCategory(category)) {
      issues.push({
        code: "frontMatter",
        language,
        message: `${label} 글의 카테고리가 허용 목록에 없습니다: ${category}`,
      })
    }
    if (purpose === "publish" && frontMatter.draft) {
      issues.push({
        code: "frontMatter",
        language,
        message: `${label} 글이 draft: true 상태입니다. 게시해도 사이트에 보이지 않습니다.`,
      })
    }
  }
  if (bundle.ko.blocks.length === 0 && bundle.en.blocks.length === 0) {
    issues.push({ code: "emptyTranslation", message: "본문 블록이 없습니다." })
  }
  const pairs = Math.min(bundle.ko.blocks.length, bundle.en.blocks.length)
  for (let index = 0; index < pairs; index += 1) {
    const ko = bundle.ko.blocks[index]
    const en = bundle.en.blocks[index]
    if (!ko || !en) continue
    const koEmpty = ko.markdown.trim() === ""
    const enEmpty = en.markdown.trim() === ""
    if (koEmpty && enEmpty) {
      issues.push({
        code: "emptyTranslation",
        blockId: ko.id,
        message: `${index + 1}번째 블록이 양쪽 모두 비어 있습니다.`,
      })
    } else if (koEmpty || enEmpty) {
      const language: Language = koEmpty ? "ko" : "en"
      issues.push({
        code: "emptyTranslation",
        language,
        blockId: ko.id,
        message: `${index + 1}번째 블록의 ${LANGUAGE_LABEL[language]} 번역이 비어 있습니다.`,
      })
    }
  }
  const available = new Set(bundle.images.map((image) => image.path))
  for (const language of LANGUAGES) {
    const doc = bundle[language]
    const cover = coverImageOf(doc.frontMatter)
    const coverPath = cover ? bundleImagePath(cover) : null
    if (coverPath && !available.has(coverPath)) {
      issues.push({
        code: "image",
        language,
        message: `커버 이미지 ${coverPath}가 번들에 없습니다.`,
      })
    }
    for (const block of doc.blocks) {
      for (const reference of collectImageReferences(block.markdown)) {
        const path = bundleImagePath(reference)
        if (path && !available.has(path)) {
          issues.push({
            code: "image",
            language,
            blockId: block.id,
            message: `이미지 ${path}가 번들에 없습니다.`,
          })
        }
      }
    }
  }
  for (const image of bundle.images) {
    if (image.status === "pending" && image.blob.size > MAX_IMAGE_BYTES) {
      issues.push({
        code: "image",
        message: `${image.path}가 ${MAX_IMAGE_BYTES.toLocaleString("en-US")}바이트를 초과합니다 (${image.blob.size.toLocaleString("en-US")}).`,
      })
    }
    if (!image.mime.startsWith("image/")) {
      issues.push({ code: "image", message: `${image.path}의 MIME 형식이 이미지가 아닙니다.` })
    }
  }
  return issues
}

export async function createBundle(
  fields: NewPostFields,
  blockIds: readonly string[] = [],
  images: readonly BundleImage[] = [],
): Promise<PostBundle> {
  const slug = newSlugSchema.parse(fields.slug)
  const build = (language: Language): BundleLanguage => {
    const generated = frontMatterFromFields({
      date: fields.date,
      title: fields.title[language],
      cover: fields.cover
        ? {
            image: fields.cover.image,
            alt: fields.cover.alt,
            caption: fields.cover.caption ?? "",
            relative: true,
          }
        : undefined,
      authors: [...fields.authors],
      tags: [...fields.tags],
      categories: [fields.category],
      series: fields.series ? [fields.series] : undefined,
      series_idx: fields.seriesIndex,
      comments: true,
      draft: fields.draft,
    })
    return {
      language,
      path: languagePath(slug, language),
      frontMatter: generated.value,
      rawFrontMatter: generated.raw,
      blocks: blockIds.map((id) => ({ id, markdown: "" })),
    }
  }
  const ko = build("ko")
  const en = build("en")
  const snapshotHash = await snapshotHashOf(
    slug,
    [
      { path: ko.path, source: serializeLanguage(ko).source },
      { path: en.path, source: serializeLanguage(en).source },
    ],
    images,
  )
  return { slug, ko, en, images: [...images], headSha: null, snapshotHash }
}

export const documentCodec: DocumentCodec = {
  parse: parseBundle,
  serialize: serializeBundle,
  validate: validateBundle,
}
