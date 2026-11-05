import type { CommitCheck, GitHubAdapter } from "../../shared/onsite/github"
import { h } from "../composer/dom"
import { describeGitHubError } from "../review/gates"
import "./ci-status.css"

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
const pending = (check: CommitCheck): boolean => ["queued", "running"].includes(check.state)
const failed = (check: CommitCheck): boolean => ["failure", "cancelled"].includes(check.state)

/** CI belongs to the immutable saved version, never to unsaved edits or a previous head. */
export class SiteChecks {
  readonly button = h(
    "button",
    {
      type: "button",
      class: "composer-button composer-ci",
      "data-site-checks": "",
      "aria-expanded": "false",
      "aria-live": "polite",
    },
    "CI",
  )
  private readonly refreshButton = h("button", { type: "button" }, "새로고침")
  private readonly closeButton = h("button", { type: "button", "aria-label": "CI 닫기" }, "✕")
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
    this.panel.append(
      h(
        "div",
        { class: "composer-comment-head" },
        h("strong", {}, "CI 검사"),
        this.refreshButton,
        this.closeButton,
      ),
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
    const checks = this.checks ?? []
    const failures = checks.filter(failed).length
    const waiting = checks.filter(pending).length
    const completed = checks.filter((check) => !pending(check)).length
    const summary = this.error
      ? "CI 조회 실패"
      : !this.head
        ? "CI 저장 후 확인"
        : this.request && this.checks === null
          ? "CI 확인 중"
          : checks.length === 0
            ? "CI 대기"
            : failures
              ? `CI 실패 ${failures}${waiting ? ` · 진행 ${waiting}` : ""}`
              : checks.some(pending)
                ? `CI 진행 중 ${completed}/${checks.length}`
                : checks.some((check) => check.state === "unknown")
                  ? "CI 상태 확인 필요"
                  : `CI 완료 ${checks.length}`
    this.button.textContent = summary
    this.button.disabled = !this.head
    this.button.dataset["state"] = this.error
      ? "error"
      : failures
        ? "failure"
        : checks.some(pending) || !checks.length
          ? "pending"
          : "complete"
    this.refreshButton.disabled = this.request !== null
    this.panel.setAttribute("aria-busy", String(this.request !== null))
    const previous = new Map(
      [...this.content.querySelectorAll<HTMLDetailsElement>("details[data-check-id]")].map(
        (node) => [node.dataset["checkId"], node.open],
      ),
    )
    const items = checks.map((check) =>
      h(
        "details",
        {
          "data-check-id": check.id,
          open: previous.get(check.id) ?? failed(check),
        },
        h(
          "summary",
          {},
          h("span", { class: "site-ci-state", "data-state": check.state }, LABELS[check.state]),
          h("span", {}, check.name),
        ),
        check.title ? h("strong", {}, check.title) : null,
        check.summary ? h("p", { class: "site-ci-message" }, check.summary) : null,
        check.text ? h("pre", { class: "site-ci-message" }, check.text) : null,
        ...check.annotations.map((annotation) =>
          h(
            "div",
            { class: "site-ci-annotation" },
            h("code", {}, `${annotation.path}:${annotation.line}`),
            h("p", { class: "site-ci-message" }, annotation.message),
          ),
        ),
        check.detailsUrl
          ? h(
              "a",
              {
                href: check.detailsUrl,
                target: "_blank",
                rel: "noopener noreferrer",
              },
              "실행 로그",
            )
          : null,
      ),
    )
    this.content.replaceChildren(
      h(
        "p",
        { class: "site-ci-version" },
        this.head ? `저장된 버전 ${this.head.slice(0, 7)}` : "저장 후 CI를 확인할 수 있습니다.",
      ),
      ...(this.error ? [h("p", { role: "alert" }, this.error)] : []),
      ...items,
      ...(!items.length && !this.error
        ? [
            h(
              "p",
              { role: "status" },
              this.request ? "검사 상태를 불러오는 중…" : "아직 보고된 검사가 없습니다.",
            ),
          ]
        : []),
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
