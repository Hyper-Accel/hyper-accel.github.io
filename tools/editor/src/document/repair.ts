import type {
  BundleImage,
  DocumentIssue,
  FrontMatter,
  Language,
  ParseBundleInput,
  ParseBundleResult,
  PostBundle,
} from "../shared/onsite/document"
import type { BlockSegment } from "./blocks"
import { assembleBundle, languagePath, pairSegments, parseBundle, parseLanguages } from "./codec"

export interface UnpairedLanguage {
  readonly language: Language
  readonly path: string
  readonly frontMatter: FrontMatter
  readonly rawFrontMatter: string
  readonly blocks: readonly string[]
}

export interface UnpairedBundle {
  readonly slug: string
  readonly headSha: string | null
  readonly images: readonly BundleImage[]
  readonly ko: UnpairedLanguage
  readonly en: UnpairedLanguage
}

export type RepairOperation =
  | { readonly type: "insert"; readonly language: Language; readonly index: number }
  | { readonly type: "remove"; readonly language: Language; readonly index: number }
  | { readonly type: "merge"; readonly language: Language; readonly index: number }
  | {
      readonly type: "move"
      readonly language: Language
      readonly index: number
      readonly direction: -1 | 1
    }

export interface RepairStatus {
  readonly ko: number
  readonly en: number
  readonly rows: number
  readonly aligned: boolean
}

export type EditableParse =
  | { readonly kind: "bundle"; readonly bundle: PostBundle; readonly migratedLegacy: boolean }
  | { readonly kind: "repair"; readonly unpaired: UnpairedBundle; readonly issue: DocumentIssue }
  | { readonly kind: "error"; readonly issues: readonly DocumentIssue[] }

export function parseUnpaired(
  input: ParseBundleInput,
):
  | { readonly ok: true; readonly value: UnpairedBundle }
  | { readonly ok: false; readonly issues: readonly DocumentIssue[] } {
  const languages = parseLanguages(input)
  if (!languages.ok) return { ok: false, issues: languages.issues }
  const build = (language: Language): UnpairedLanguage => {
    const parsed = languages.value[language]
    return {
      language,
      path: input.paths?.[language] ?? languagePath(input.slug, language),
      frontMatter: parsed.frontMatter,
      rawFrontMatter: parsed.rawFrontMatter,
      blocks: parsed.segments.map((segment) => segment.markdown),
    }
  }
  return {
    ok: true,
    value: {
      slug: input.slug,
      headSha: input.headSha,
      images: [...input.images],
      ko: build("ko"),
      en: build("en"),
    },
  }
}

export async function parseForEditing(input: ParseBundleInput): Promise<EditableParse> {
  const result = await parseBundle(input)
  if (result.ok)
    return { kind: "bundle", bundle: result.bundle, migratedLegacy: result.migratedLegacy }
  const [issue] = result.issues
  if (issue?.code !== "pairing" || result.issues.length !== 1) {
    return { kind: "error", issues: result.issues }
  }
  const unpaired = parseUnpaired(input)
  if (!unpaired.ok) return { kind: "error", issues: unpaired.issues }
  return { kind: "repair", unpaired: unpaired.value, issue }
}

export function repairStatus(unpaired: UnpairedBundle): RepairStatus {
  const ko = unpaired.ko.blocks.length
  const en = unpaired.en.blocks.length
  return { ko, en, rows: Math.max(ko, en), aligned: ko === en }
}

export function pairingIssueOf(unpaired: UnpairedBundle): DocumentIssue {
  const status = repairStatus(unpaired)
  return {
    code: "pairing",
    message: `블록 수가 다릅니다 (한국어 ${status.ko}, 영어 ${status.en}). 수동 짝 맞춤이 필요합니다.`,
  }
}

function joinBlocks(first: string, second: string): string {
  if (first.trim() === "") return second
  if (second.trim() === "") return first
  return `${first}\n\n${second}`
}

export function applyRepairToBlocks(
  blocks: readonly string[],
  operation: RepairOperation,
): readonly string[] {
  const next = [...blocks]
  switch (operation.type) {
    case "insert": {
      const index = Math.max(0, Math.min(next.length, operation.index))
      next.splice(index, 0, "")
      return next
    }
    case "remove": {
      const target = next[operation.index]
      if (target === undefined || target.trim() !== "") return blocks
      next.splice(operation.index, 1)
      return next
    }
    case "merge": {
      const first = next[operation.index]
      const second = next[operation.index + 1]
      if (first === undefined || second === undefined) return blocks
      next.splice(operation.index, 2, joinBlocks(first, second))
      return next
    }
    case "move": {
      const target = operation.index + operation.direction
      const moving = next[operation.index]
      const other = next[target]
      if (moving === undefined || other === undefined) return blocks
      next[target] = moving
      next[operation.index] = other
      return next
    }
  }
}

export function applyRepair(unpaired: UnpairedBundle, operation: RepairOperation): UnpairedBundle {
  const language = unpaired[operation.language]
  const blocks = applyRepairToBlocks(language.blocks, operation)
  if (blocks === language.blocks) return unpaired
  return { ...unpaired, [operation.language]: { ...language, blocks } }
}

export async function pairUnpaired(unpaired: UnpairedBundle): Promise<ParseBundleResult> {
  const status = repairStatus(unpaired)
  if (!status.aligned) return { ok: false, issues: [pairingIssueOf(unpaired)] }
  const segments = (language: Language): BlockSegment[] =>
    unpaired[language].blocks.map((markdown) => ({ prefix: "", id: null, markdown }))
  const pairing = pairSegments(unpaired.slug, segments("ko"), segments("en"))
  if (!pairing.ok) return { ok: false, issues: [pairing.issue] }
  const input: ParseBundleInput = {
    slug: unpaired.slug,
    ko: "",
    en: "",
    images: unpaired.images,
    headSha: unpaired.headSha,
    paths: { ko: unpaired.ko.path, en: unpaired.en.path },
  }
  const metadata = {
    ko: { frontMatter: unpaired.ko.frontMatter, rawFrontMatter: unpaired.ko.rawFrontMatter },
    en: { frontMatter: unpaired.en.frontMatter, rawFrontMatter: unpaired.en.rawFrontMatter },
  }
  return assembleBundle(input, metadata, { ko: pairing.value.ko, en: pairing.value.en }, true)
}
