import type { PostBundle } from "../../shared/onsite/document"
import type { DraftPullRequest, GitHubAdapter } from "../../shared/onsite/github"
import { h } from "../composer/dom"
import {
  approveGate,
  describeGitHubError,
  publishGate,
  reviewRequestGate,
  shortSha,
  type Validate,
} from "../review/gates"

export interface ReviewFlowOptions {
  /** The post's authors and editors move it through review; anyone else reviews it. */
  readonly role: "author" | "reviewer"
  readonly github: GitHubAdapter
  readonly bundle: () => PostBundle | null
  readonly validate: Validate
  readonly isPublished: (slug: string, pullNumber: number) => Promise<boolean>
  /** Review saves validate content and clear Hugo draft before returning the saved PR. */
  readonly save?: (purpose?: "review") => Promise<DraftPullRequest>
  readonly status: (text: string) => void
}

const POLL_MS = 5000
const POLL_LIMIT = 60

/**
 * Review happens in the editor, not on a separate screen: in the dock the authors request review
 * and, once approved, publish; anyone else reads the same editor read-only, comments and approves.
 */
export class ReviewFlow {
  /** The dock's review controls: the main button and, while in review, 초안으로 되돌리기. */
  readonly element: HTMLElement
  private readonly button: HTMLButtonElement
  private readonly revert: HTMLButtonElement
  private pr: DraftPullRequest | null = null
  private approvedSha: string | null = null
  private busy = false
  private stage: "idle" | "deploying" | "published" = "idle"
  private disposed = false

  constructor(private readonly options: ReviewFlowOptions) {
    this.button = h(
      "button",
      {
        type: "button",
        class: "composer-button composer-button--primary",
        "data-action": options.role === "author" ? "request-review" : "approve",
      },
      "",
    )
    this.revert = h(
      "button",
      {
        type: "button",
        class: "composer-button",
        "data-action": "back-to-draft",
        title: "리뷰 요청을 거두고 초안으로 되돌립니다.",
        hidden: true,
      },
      "초안으로 되돌리기",
    )
    this.element = h("div", { class: "review-flow" }, this.revert, this.button)
    this.button.addEventListener("click", () => void this.act())
    this.revert.addEventListener("click", () => void this.backToDraft())
    // A reviewer may approve while the author has the editor open: look again on return.
    window.addEventListener("focus", this.onFocus)
    this.render()
  }

  dispose(): void {
    this.disposed = true
    window.removeEventListener("focus", this.onFocus)
  }

  private readonly onFocus = (): void => {
    void this.refresh()
  }

  /** Reads the post's open draft pull request and whether its current head is approved. */
  async refresh(): Promise<void> {
    const slug = this.options.bundle()?.slug
    if (!slug || this.busy || this.stage !== "idle") {
      this.render()
      return
    }
    const drafts = await this.options.github.listDrafts()
    if (this.disposed) return
    const found = drafts.ok
      ? drafts.value.find((draft) => draft.slug === slug && draft.state === "open")
      : undefined
    const pr = found ? { ...found } : null
    let approvedSha: string | null = null
    if (pr) {
      const state = await this.options.github.getPullState?.(pr.number)
      if (this.disposed) return
      if (state?.ok) {
        pr.headSha = state.value.headSha
        pr.draft = state.value.draft
        if (state.value.merged) pr.state = "merged"
        if (state.value.approvedHeadShas.includes(state.value.headSha))
          approvedSha = state.value.headSha
      }
    }
    this.pr = pr
    this.approvedSha = approvedSha
    this.render()
  }

  private render(): void {
    const { pr, approvedSha } = this
    const set = (label: string, enabled: boolean, title = ""): void => {
      this.button.textContent = label
      this.button.disabled = !enabled || this.busy
      this.button.title = title
    }
    // A pull request in review (or approved, not yet published) can go back to draft.
    this.revert.hidden =
      this.options.role !== "author" ||
      this.stage !== "idle" ||
      !pr ||
      pr.draft ||
      pr.state !== "open"
    this.revert.disabled = this.busy
    if (this.options.role === "reviewer") {
      this.button.hidden = pr === null
      if (!pr) {
        this.button.disabled = true
        return
      }
      const gate = approveGate(pr, approvedSha)
      set(
        approvedSha === pr.headSha ? "승인됨" : "승인",
        gate.allowed,
        gate.allowed ? "이 버전을 게시해도 된다고 승인합니다." : gate.reasons.join(" "),
      )
      return
    }
    if (this.stage === "deploying") set("배포 중…", false)
    else if (this.stage === "published") set("게시됨", false)
    else if (pr && !pr.draft && approvedSha === pr.headSha)
      set("게시", true, "main에 반영해 블로그에 공개합니다.")
    else if (pr && !pr.draft) set("리뷰 중", false, "승인되면 게시할 수 있습니다.")
    else set("리뷰 요청", true, "저장하고 리뷰를 요청합니다.")
  }

  private async act(): Promise<void> {
    if (this.busy) return
    this.busy = true
    this.render()
    try {
      if (this.options.role === "reviewer") await this.approve()
      else if (this.pr && !this.pr.draft && this.approvedSha === this.pr.headSha)
        await this.publish()
      else await this.requestReview()
    } catch (error: unknown) {
      this.options.status(error instanceof Error ? error.message : String(error))
    } finally {
      this.busy = false
      this.render()
    }
  }

  /** Takes the pull request back from review to draft; 리뷰 요청 asks again later. */
  private async backToDraft(): Promise<void> {
    const pr = this.pr
    if (this.busy || !pr || pr.draft) return
    this.busy = true
    this.render()
    try {
      const result = await this.options.github.markDraft(pr.number, pr.headSha)
      if (!result.ok) {
        this.options.status(describeGitHubError(result.error))
        return
      }
      this.pr = result.value
      this.options.status("초안으로 되돌렸습니다. 다시 리뷰를 요청할 수 있습니다.")
    } finally {
      this.busy = false
      this.render()
    }
  }

  /** Saves the latest edits, then asks for review on the same pull request. */
  private async requestReview(): Promise<void> {
    const save = this.options.save
    if (!save) return
    const pr = await save("review")
    const bundle = this.options.bundle()
    if (!bundle) return
    this.pr = pr
    const gate = reviewRequestGate(bundle, pr, this.options.validate)
    if (!gate.allowed) {
      this.options.status(gate.reasons.join(" "))
      return
    }
    const result = await this.options.github.markReady(pr.number, pr.headSha)
    if (!result.ok) {
      this.options.status(describeGitHubError(result.error))
      return
    }
    this.pr = result.value
    this.approvedSha = null
    this.options.status("리뷰를 요청했습니다. 승인되면 게시할 수 있습니다.")
  }

  private async approve(): Promise<void> {
    const pr = this.pr
    if (!pr) return
    const gate = approveGate(pr, this.approvedSha)
    if (!gate.allowed) {
      this.options.status(gate.reasons.join(" "))
      return
    }
    const result = await this.options.github.approve(pr.number, pr.headSha)
    if (!result.ok) {
      this.options.status(describeGitHubError(result.error))
      return
    }
    this.approvedSha = pr.headSha
    this.options.status(`승인했습니다 (기준 커밋 ${shortSha(pr.headSha)}).`)
  }

  /** Squash-merges the approved head, then waits for the deployed page. */
  private async publish(): Promise<void> {
    const pr = this.pr
    const bundle = this.options.bundle()
    if (!pr || !bundle) return
    const gate = publishGate(bundle, pr, this.approvedSha, this.options.validate)
    if (!gate.allowed) {
      this.options.status(gate.reasons.join(" "))
      return
    }
    const result = await this.options.github.squashMerge(pr.number, pr.headSha)
    if (!result.ok) {
      this.options.status(describeGitHubError(result.error))
      return
    }
    this.pr = { ...pr, state: "merged" }
    this.stage = "deploying"
    this.options.status("main에 머지했습니다. 배포가 끝나면 공개됩니다.")
    this.render()
    for (let attempt = 0; attempt < POLL_LIMIT && !this.disposed; attempt += 1) {
      if (await this.options.isPublished(bundle.slug, pr.number).catch(() => false)) {
        this.stage = "published"
        this.options.status("공개되었습니다.")
        return
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }
    if (!this.disposed)
      this.options.status("배포 확인이 늦어지고 있습니다. 잠시 후 글을 확인하세요.")
  }
}
