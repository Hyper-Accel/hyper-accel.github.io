import type { CommitCheck, GitHubAdapter } from "../../shared/onsite/github"
import { h } from "../composer/dom"
import { describeGitHubError } from "../review/gates"
import "./ci-status.css"

/** Screen-reader names; the icon carries the state visually. */
const LABELS: Readonly<Record<CommitCheck["state"], string>> = {
  queued: "대기",
  running: "진행 중",
  success: "통과",
  failure: "실패",
  cancelled: "취소",
  neutral: "중립",
  skipped: "건너뜀",
  unknown: "확인 필요",
}

type Icon = "success" | "failure" | "running" | "queued" | "skipped" | "unknown"
const ICON_OF: Readonly<Record<CommitCheck["state"], Icon>> = {
  queued: "queued",
  running: "running",
  success: "success",
  failure: "failure",
  cancelled: "skipped",
  neutral: "skipped",
  skipped: "skipped",
  unknown: "unknown",
}
const SVG: Readonly<Record<Icon, string>> = {
  success:
    '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  failure:
    '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  running:
    '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="2"/><path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  queued:
    '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="4" fill="currentColor"/></svg>',
  skipped:
    '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.2 11.8l7.6-7.6" stroke="currentColor" stroke-width="1.6"/></svg>',
  unknown:
    '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
}
const REFRESH =
  '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

function icon(name: Icon, large = false): HTMLSpanElement {
  const element = h("span", {
    class: `site-ci-icon${large ? " site-ci-icon--large" : ""}`,
    "data-icon": name,
    "aria-hidden": "true",
  })
  element.innerHTML = SVG[name]
  return element
}

function seconds(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000))
  return total < 60 ? `${total}초` : `${Math.floor(total / 60)}분 ${total % 60}초`
}

function description(check: CommitCheck): string {
  const took = check.durationMs === null ? null : seconds(check.durationMs)
  switch (check.state) {
    case "success":
      return took ? `${took} 만에 성공` : "성공"
    case "failure":
      return check.title || (took ? `${took} 후 실패` : "실패")
    case "running":
      return "실행 중…"
    case "queued":
      return "대기 중"
    case "cancelled":
      return "취소됨"
    case "neutral":
      return "중립 결과"
    case "skipped":
      return "실행하지 않음"
    case "unknown":
      return "상태를 확인할 수 없음"
  }
}

const pending = (check: CommitCheck): boolean => ["queued", "running"].includes(check.state)
const failed = (check: CommitCheck): boolean => ["failure", "cancelled"].includes(check.state)
const rank = (check: CommitCheck): number => (failed(check) ? 0 : pending(check) ? 1 : 2)

/** CI belongs to the immutable saved version, never to unsaved edits or a previous head. */
export class SiteChecks {
  readonly button = h("button", {
    type: "button",
    class: "composer-button composer-ci",
    "data-site-checks": "",
    "aria-expanded": "false",
  })
  private readonly refreshButton = h("button", {
    type: "button",
    class: "site-ci-tool",
    "aria-label": "새로고침",
    title: "새로고침",
  })
  private readonly closeButton = h(
    "button",
    { type: "button", class: "site-ci-tool", "aria-label": "CI 닫기" },
    "✕",
  )
  private readonly heading = h("div", { class: "site-ci-heading" })
  private readonly content = h("div", { class: "site-ci-content" })
  private readonly panel = h("section", {
    class: "composer-comment-popover site-ci-panel",
    role: "dialog",
    "aria-label": "CI 검사",
    hidden: true,
  })
  private head: string | null = null
  private checks: readonly CommitCheck[] | null = null
  private error: string | null = null
  private request: { readonly sha: string; readonly promise: Promise<void> } | null = null
  private generation = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private disposed = false

  constructor(
    private readonly options: {
      readonly github: GitHubAdapter
      readonly head: () => string | null
    },
  ) {
    this.refreshButton.innerHTML = REFRESH
    this.panel.append(
      h("div", { class: "site-ci-head" }, this.heading, this.refreshButton, this.closeButton),
      this.content,
    )
    document.body.append(this.panel)
    this.button.addEventListener("click", () => {
      this.panel.hidden = !this.panel.hidden
      this.button.setAttribute("aria-expanded", String(!this.panel.hidden))
      if (!this.panel.hidden) {
        this.position()
        this.closeButton.focus()
      }
    })
    this.closeButton.addEventListener("click", () => this.close())
    this.refreshButton.addEventListener("click", () => void this.refresh())
    document.addEventListener("mousedown", this.onOutside)
    document.addEventListener("keydown", this.onEscape)
    document.addEventListener("visibilitychange", this.onVisibility)
    window.addEventListener("focus", this.onVisibility)
    window.addEventListener("resize", this.position)
    window.addEventListener("scroll", this.position, { passive: true })
    void this.refresh()
  }

  refresh(): Promise<void> {
    clearTimeout(this.timer)
    if (this.disposed) return Promise.resolve()
    const sha = this.options.head()
    if (sha === this.request?.sha) return this.request.promise
    const generation = ++this.generation
    if (sha !== this.head) {
      this.head = sha
      this.checks = null
      this.error = null
    }
    if (!sha) {
      this.request = null
      this.render()
      return Promise.resolve()
    }
    const promise = this.options.github.getCommitChecks(sha).then((result) => {
      if (this.disposed || generation !== this.generation) return
      this.request = null
      this.checks = result.ok ? result.value : null
      this.error = result.ok
        ? null
        : result.error.kind === "forbidden"
          ? "CI를 조회할 수 없습니다. GitHub App의 Checks와 Commit statuses 읽기 권한을 확인해 주세요."
          : describeGitHubError(result.error)
      this.render()
      if (
        this.checks &&
        (this.checks.length === 0 || this.checks.some(pending)) &&
        !document.hidden
      ) {
        this.timer = setTimeout(() => void this.refresh(), 15_000)
      }
    })
    this.request = { sha, promise }
    this.render()
    return promise
  }

  private render(): void {
    const checks = [...(this.checks ?? [])].sort((a, b) => rank(a) - rank(b))
    const failures = checks.filter(failed).length
    const waiting = checks.filter(pending).length
    const passed = checks.filter((check) => check.state === "success").length
    const completed = checks.length - waiting
    const loading = this.request !== null && this.checks === null
    const summary = this.error
      ? "CI 조회 실패"
      : !this.head
        ? "CI 저장 후 확인"
        : loading
          ? "CI 확인 중"
          : checks.length === 0
            ? "CI 대기"
            : failures
              ? `CI 실패 ${failures}${waiting ? ` · 진행 ${waiting}` : ""}`
              : waiting
                ? `CI 진행 중 ${completed}/${checks.length}`
                : checks.some((check) => check.state === "unknown")
                  ? "CI 상태 확인 필요"
                  : `CI 완료 ${checks.length}`
    const overall: Icon = this.error
      ? "failure"
      : failures
        ? "failure"
        : waiting || loading || (this.head && checks.length === 0)
          ? waiting
            ? "running"
            : "queued"
          : checks.some((check) => check.state === "unknown") || !this.head
            ? "unknown"
            : "success"
    this.button.replaceChildren(icon(overall), "CI")
    this.button.setAttribute("aria-label", summary)
    this.button.title = summary
    this.button.disabled = !this.head
    this.button.dataset["state"] = this.error
      ? "error"
      : failures
        ? "failure"
        : waiting || !checks.length
          ? "pending"
          : "complete"
    this.refreshButton.disabled = this.request !== null
    this.panel.setAttribute("aria-busy", String(this.request !== null))

    const headline = this.error
      ? "CI를 불러오지 못했습니다"
      : !this.head
        ? "저장하면 CI가 시작됩니다"
        : loading
          ? "검사 상태를 불러오는 중"
          : checks.length === 0
            ? "아직 보고된 검사가 없습니다"
            : failures
              ? "일부 검사가 실패했습니다"
              : waiting
                ? "검사가 아직 끝나지 않았습니다"
                : "모든 검사를 통과했습니다"
    const counts = [
      failures ? `실패 ${failures}` : "",
      waiting ? `진행 중 ${waiting}` : "",
      passed ? `성공 ${passed}` : "",
      checks.length - failures - waiting - passed
        ? `기타 ${checks.length - failures - waiting - passed}`
        : "",
    ].filter(Boolean)
    this.heading.replaceChildren(
      icon(overall, true),
      h(
        "div",
        {},
        h("strong", {}, headline),
        h(
          "p",
          { class: "site-ci-version" },
          [...counts, this.head ? `저장된 버전 ${this.head.slice(0, 7)}` : ""]
            .filter(Boolean)
            .join(" · "),
        ),
      ),
    )

    const previous = new Map(
      [...this.content.querySelectorAll<HTMLDetailsElement>("details[data-check-id]")].map(
        (node) => [node.dataset["checkId"], node.open],
      ),
    )
    const items = checks.map((check) => {
      const row = [
        icon(ICON_OF[check.state]),
        h("span", { class: "site-ci-sr" }, LABELS[check.state]),
        h(
          "span",
          { class: "site-ci-name" },
          h("strong", {}, check.name),
          h("span", { class: "site-ci-description" }, description(check)),
        ),
        check.detailsUrl
          ? h(
              "a",
              {
                class: "site-ci-details",
                href: check.detailsUrl,
                target: "_blank",
                rel: "noopener noreferrer",
              },
              "자세히",
            )
          : null,
      ]
      const body: HTMLElement[] = [
        ...(check.summary ? [h("p", { class: "site-ci-message" }, check.summary)] : []),
        ...(check.text ? [h("pre", { class: "site-ci-message" }, check.text)] : []),
        ...check.annotations.map((annotation) =>
          h(
            "div",
            { class: "site-ci-annotation" },
            h("code", {}, `${annotation.path}:${annotation.line}`),
            h("p", { class: "site-ci-message" }, annotation.message),
          ),
        ),
      ]
      return body.length
        ? h(
            "details",
            {
              class: "site-ci-check",
              "data-check-id": check.id,
              "data-state": check.state,
              open: previous.get(check.id) ?? failed(check),
            },
            h("summary", { class: "site-ci-row" }, ...row),
            h("div", { class: "site-ci-body" }, ...body),
          )
        : h(
            "div",
            { class: "site-ci-check", "data-check-id": check.id, "data-state": check.state },
            h("div", { class: "site-ci-row" }, ...row),
          )
    })
    this.content.replaceChildren(
      ...(this.error ? [h("p", { role: "alert", class: "site-ci-error" }, this.error)] : []),
      ...items,
    )
    if (!this.panel.hidden) this.position()
  }

  private readonly position = (): void => {
    if (this.panel.hidden) return
    const rect = this.button.getBoundingClientRect()
    this.panel.style.maxHeight = `${Math.max(120, rect.top - 80)}px`
    this.panel.style.bottom = `${Math.max(8, innerHeight - rect.top + 8)}px`
    this.panel.style.left = `${Math.max(8, Math.min(rect.right - this.panel.offsetWidth, innerWidth - this.panel.offsetWidth - 8))}px`
  }

  private close(): void {
    this.panel.hidden = true
    this.button.setAttribute("aria-expanded", "false")
    this.button.focus()
  }

  private readonly onOutside = (event: MouseEvent): void => {
    if (this.panel.hidden || !(event.target instanceof Node)) return
    if (this.panel.contains(event.target) || this.button.contains(event.target)) return
    this.panel.hidden = true
    this.button.setAttribute("aria-expanded", "false")
  }
  private readonly onEscape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || event.defaultPrevented || this.panel.hidden) return
    event.preventDefault()
    this.close()
  }
  private readonly onVisibility = (): void => {
    if (!document.hidden) void this.refresh()
  }

  dispose(): void {
    this.disposed = true
    this.generation++
    clearTimeout(this.timer)
    document.removeEventListener("mousedown", this.onOutside)
    document.removeEventListener("keydown", this.onEscape)
    document.removeEventListener("visibilitychange", this.onVisibility)
    window.removeEventListener("focus", this.onVisibility)
    window.removeEventListener("resize", this.position)
    window.removeEventListener("scroll", this.position)
    this.panel.remove()
  }
}
