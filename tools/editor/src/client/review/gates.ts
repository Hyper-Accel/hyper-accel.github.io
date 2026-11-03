import type { DocumentCodec, DocumentIssue, PostBundle } from "../../shared/onsite/document"
import type { DraftPullRequest, GitHubError } from "../../shared/onsite/github"

export type Validate = DocumentCodec["validate"]
export interface Gate {
  readonly allowed: boolean
  readonly reasons: readonly string[]
}
export type PublishStage = "awaiting" | "merging" | "deploying" | "published"
export type StepState = "done" | "current" | "todo"

const LANGUAGE_LABEL = { ko: "한국어", en: "영어" } as const
const STAGE_ORDER: readonly PublishStage[] = ["awaiting", "merging", "deploying", "published"]
export const PUBLISH_STEPS: readonly { readonly stage: PublishStage; readonly label: string }[] = [
  { stage: "awaiting", label: "승인 대기" },
  { stage: "merging", label: "머지 중" },
  { stage: "deploying", label: "배포 중" },
  { stage: "published", label: "공개 완료" },
]

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function issueReasons(issues: readonly DocumentIssue[]): string[] {
  return issues.map((issue) => issue.message)
}

export function translationReasons(bundle: PostBundle): string[] {
  const reasons: string[] = []
  for (const language of ["ko", "en"] as const) {
    const document = bundle[language]
    const label = LANGUAGE_LABEL[language]
    if (document.frontMatter.title.trim() === "") reasons.push(`${label} 제목이 없습니다.`)
    if (document.frontMatter.authors.length === 0) reasons.push(`${label} 작성자가 없습니다.`)
    if (document.frontMatter.categories.length === 0) reasons.push(`${label} 카테고리가 없습니다.`)
    const empty = document.blocks.filter((block) => block.markdown.trim() === "").length
    if (empty > 0) reasons.push(`${label} 본문이 비어 있는 블록이 ${empty}개 있습니다.`)
  }
  if (bundle.ko.blocks.length === 0) reasons.push("본문이 없습니다.")
  return reasons
}

function closedReason(pr: DraftPullRequest): string | null {
  if (pr.state === "merged") return "이미 게시된 글입니다."
  if (pr.state === "closed") return "닫힌 초안입니다."
  return null
}

export function reviewRequestGate(
  bundle: PostBundle,
  pr: DraftPullRequest,
  validate?: Validate,
): Gate {
  const closed = closedReason(pr)
  if (closed) return { allowed: false, reasons: [closed] }
  if (!pr.draft) return { allowed: false, reasons: ["이미 리뷰를 요청했습니다."] }
  const reasons = unique([
    ...translationReasons(bundle),
    ...issueReasons(validate?.(bundle, "review") ?? []),
  ])
  return { allowed: reasons.length === 0, reasons }
}

export function approveGate(pr: DraftPullRequest, approvedSha: string | null): Gate {
  const closed = closedReason(pr)
  if (closed) return { allowed: false, reasons: [closed] }
  if (pr.draft) return { allowed: false, reasons: ["리뷰 요청 후 승인할 수 있습니다."] }
  if (approvedSha === pr.headSha) return { allowed: false, reasons: ["이미 승인되었습니다."] }
  return { allowed: true, reasons: [] }
}

export function publishGate(
  bundle: PostBundle,
  pr: DraftPullRequest,
  approvedSha: string | null,
  validate?: Validate,
): Gate {
  const closed = closedReason(pr)
  if (closed) return { allowed: false, reasons: [closed] }
  if (pr.draft) return { allowed: false, reasons: ["리뷰 요청과 승인 후 게시할 수 있습니다."] }
  if (approvedSha !== pr.headSha)
    return { allowed: false, reasons: ["승인 후 게시할 수 있습니다."] }
  const reasons = unique([
    ...translationReasons(bundle),
    ...issueReasons(validate?.(bundle, "publish") ?? []),
  ])
  return { allowed: reasons.length === 0, reasons }
}

export function stepState(step: PublishStage, current: PublishStage, approved: boolean): StepState {
  const stepIndex = STAGE_ORDER.indexOf(step)
  const currentIndex = STAGE_ORDER.indexOf(current)
  if (stepIndex < currentIndex) return "done"
  if (stepIndex > currentIndex) return "todo"
  if (step === "published") return "done"
  if (step === "awaiting" && approved) return "done"
  return "current"
}

export function statusLabel(
  pr: DraftPullRequest,
  approvedSha: string | null,
  stage: PublishStage,
): string {
  if (stage === "published") return "공개 완료"
  if (pr.state === "merged" || stage === "deploying") return "배포 중"
  if (stage === "merging") return "머지 중"
  if (pr.state === "closed") return "닫힘"
  if (pr.draft) return "작성 중"
  if (approvedSha === pr.headSha) return "승인됨"
  return "리뷰 요청됨"
}

export function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : "없음"
}

export function describeGitHubError(error: GitHubError): string {
  switch (error.kind) {
    case "unauthorized":
      return "로그인이 만료되었습니다. 다시 로그인한 뒤 시도하세요."
    case "forbidden":
      return "이 저장소에 쓰기 권한이 없습니다."
    case "conflict":
      return `원격 브랜치가 바뀌었습니다 (예상 ${shortSha(error.expectedHeadSha)}, 실제 ${shortSha(
        error.actualHeadSha,
      )}). 화면을 다시 불러온 뒤 시도하세요.`
    case "rateLimited":
      return `GitHub 요청 한도를 초과했습니다. ${new Date(error.retryAt).toLocaleTimeString("ko-KR")} 이후 다시 시도하세요.`
    case "validation":
      return error.fields.length > 0
        ? `${error.message} (${error.fields.join(", ")})`
        : error.message
    case "network":
      return error.outcomeUnknown
        ? "네트워크 오류로 결과를 확인하지 못했습니다. 화면을 다시 불러와 상태를 확인하세요."
        : "네트워크 오류가 발생했습니다. 다시 시도하세요."
  }
}
