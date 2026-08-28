import type { Editor } from "@tiptap/core"
import { createBlogEditor } from "./editor"
import { prepareMarkdown } from "./markdown"
import {
  applyMergeChoices,
  createMergeSegments,
  type MergeChoice,
  type MergeSegment,
  splitMarkdownBlocks,
} from "./merge"

type MergeViewOptions = {
  readonly currentTitle: string
  readonly currentBody: string
  readonly proposedTitle: string
  readonly proposedBody: string
  readonly postPath: string
  readonly mediaUrl: (source: string) => string
  readonly onApply: (title: string, body: string) => void
  readonly onClose: () => void
}

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`병합 화면 요소를 찾을 수 없습니다: ${selector}`)
  }
  return element
}

export class MergeView {
  private readonly workspace = requiredElement<HTMLElement>("#merge-workspace")
  private readonly grid = requiredElement<HTMLElement>("#merge-grid")
  private readonly summary = requiredElement<HTMLElement>("#merge-summary")
  private readonly rendererHost = document.createElement("div")
  private readonly renderer: Editor
  private readonly choices = new Map<string, MergeChoice>()
  private segments: readonly MergeSegment[] = []
  private options: MergeViewOptions | undefined

  constructor() {
    this.renderer = createBlogEditor(this.rendererHost, {
      mediaUrl: (source) => this.options?.mediaUrl(source) ?? source,
      editable: false,
      onChange: () => undefined,
      onImage: async () => undefined,
    })
    this.grid.addEventListener("click", (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>("[data-merge-choice]")
      const id = button?.dataset["mergeId"]
      const choice = button?.dataset["mergeChoice"] as MergeChoice | undefined
      if (id && choice) {
        this.choices.set(id, choice)
        this.updateChoice(id)
      }
    })
    requiredElement("#merge-accept-all").addEventListener("click", () => {
      this.chooseAll("proposed")
    })
    requiredElement("#merge-keep-all").addEventListener("click", () => {
      this.chooseAll("current")
    })
    requiredElement("#merge-apply").addEventListener("click", () => this.apply())
    requiredElement("#merge-close").addEventListener("click", () => this.close())
  }

  open(options: MergeViewOptions): void {
    this.options = options
    this.segments = createMergeSegments(
      splitMarkdownBlocks(options.currentBody),
      splitMarkdownBlocks(options.proposedBody),
    )
    this.choices.clear()
    for (const segment of this.segments) {
      if (segment.kind === "change") {
        this.choices.set(segment.id, "current")
      }
    }
    if (options.currentTitle !== options.proposedTitle) {
      this.choices.set("merge-title", "current")
    }
    const changes = this.segments.filter((segment) => segment.kind === "change").length
    const titleChanges = options.currentTitle === options.proposedTitle ? 0 : 1
    this.summary.textContent = `제안된 변경 ${changes + titleChanges}개를 검토한 뒤 적용할 내용을 선택하세요.`
    requiredElement("#article-canvas").hidden = true
    requiredElement("#welcome").hidden = true
    this.workspace.hidden = false
    this.renderRows()
    window.scrollTo(0, 0)
  }

  private renderMarkdown(markdown: string): string {
    if (!markdown) {
      return '<p class="merge-empty">이 영역에는 내용이 없습니다.</p>'
    }
    const prepared = prepareMarkdown(markdown, this.options?.postPath ?? "")
    this.renderer.commands.setContent(prepared.markdown, { contentType: "markdown" })
    return this.rendererHost.querySelector(".ProseMirror")?.innerHTML ?? ""
  }

  private createPane(markdown: string, side: "current" | "proposed"): HTMLElement {
    const pane = document.createElement("article")
    pane.className = `merge-pane post-content merge-pane--${side}`
    pane.ariaLabel = side === "current" ? "현재 글" : "AI 제안"
    pane.innerHTML = this.renderMarkdown(markdown)
    return pane
  }

  private createControls(id: string): HTMLElement {
    const controls = document.createElement("div")
    controls.className = "merge-hunk-controls"
    const proposed = document.createElement("button")
    proposed.type = "button"
    proposed.dataset["mergeId"] = id
    proposed.dataset["mergeChoice"] = "proposed"
    proposed.dataset["selected"] = String(this.choices.get(id) === "proposed")
    proposed.setAttribute("aria-pressed", String(this.choices.get(id) === "proposed"))
    proposed.ariaLabel = "AI 제안 선택"
    proposed.title = "AI 제안 선택"
    proposed.innerHTML =
      '<i class="ph ph-arrow-right merge-icon-desktop"></i><i class="ph ph-arrow-down merge-icon-mobile"></i><span>AI 제안 선택</span>'
    const current = document.createElement("button")
    current.type = "button"
    current.dataset["mergeId"] = id
    current.dataset["mergeChoice"] = "current"
    current.dataset["selected"] = String(this.choices.get(id) === "current")
    current.setAttribute("aria-pressed", String(this.choices.get(id) === "current"))
    current.ariaLabel = "현재 글 선택"
    current.title = "현재 글 선택"
    current.innerHTML =
      '<i class="ph ph-arrow-left merge-icon-desktop"></i><i class="ph ph-arrow-up merge-icon-mobile"></i><span>현재 글 선택</span>'
    controls.append(proposed, current)
    return controls
  }

  private renderRows(): void {
    const options = this.options
    if (!options) {
      return
    }
    this.grid.replaceChildren()
    if (options.currentTitle !== options.proposedTitle) {
      const row = document.createElement("div")
      row.className = "merge-row merge-row--change"
      row.dataset["selected"] = this.choices.get("merge-title") ?? "current"
      row.append(
        this.createPane(`# ${options.currentTitle}`, "current"),
        this.createControls("merge-title"),
        this.createPane(`# ${options.proposedTitle}`, "proposed"),
      )
      this.grid.append(row)
    }
    for (const segment of this.segments) {
      const row = document.createElement("div")
      row.className = `merge-row merge-row--${segment.kind}`
      if (segment.kind === "change") {
        row.dataset["selected"] = this.choices.get(segment.id) ?? "current"
      }
      const current = segment.current.join("\n\n")
      const proposed = segment.proposed.join("\n\n")
      row.append(
        this.createPane(current, "current"),
        segment.kind === "change"
          ? this.createControls(segment.id)
          : document.createElement("span"),
        this.createPane(proposed, "proposed"),
      )
      this.grid.append(row)
    }
  }

  private updateChoice(id: string): void {
    const choice = this.choices.get(id)
    const buttons = [
      ...this.grid.querySelectorAll<HTMLButtonElement>("[data-merge-choice]"),
    ].filter((button) => button.dataset["mergeId"] === id)
    const row = buttons[0]?.closest<HTMLElement>(".merge-row--change")
    if (row && choice) {
      row.dataset["selected"] = choice
    }
    for (const button of buttons) {
      const selected = button.dataset["mergeChoice"] === choice
      button.dataset["selected"] = String(selected)
      button.setAttribute("aria-pressed", String(selected))
    }
  }

  private chooseAll(choice: MergeChoice): void {
    for (const id of this.choices.keys()) {
      this.choices.set(id, choice)
      this.updateChoice(id)
    }
  }

  private apply(): void {
    const options = this.options
    if (!options) {
      return
    }
    const title =
      this.choices.get("merge-title") === "proposed" ? options.proposedTitle : options.currentTitle
    options.onApply(title, applyMergeChoices(this.segments, this.choices))
    this.hide()
    this.options = undefined
  }

  private show(): void {
    requiredElement("#article-canvas").hidden = true
    requiredElement("#welcome").hidden = true
    this.workspace.hidden = false
    window.scrollTo(0, 0)
  }

  private hide(): void {
    this.workspace.hidden = true
    this.options?.onClose()
  }

  reopen(): void {
    if (this.options) {
      this.show()
    }
  }

  close(): void {
    this.hide()
  }

  reset(): void {
    this.hide()
    this.options = undefined
    this.segments = []
    this.choices.clear()
  }
}
