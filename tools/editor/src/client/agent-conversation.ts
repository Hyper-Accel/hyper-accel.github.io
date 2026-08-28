import type { AgentContext, AgentEvent, AgentSessionHistory } from "../shared/agent-contracts"
import type { PostDocument } from "../shared/contracts"
import { AgentTimeline } from "./agent-timeline"
import { MergeView } from "./merge-view"

type AgentConversationOptions = {
  readonly getDocument: () => PostDocument | undefined
  readonly applyMerged: (title: string, body: string) => void
  readonly mediaUrl: (source: string) => string
  readonly showToast: (message: string, tone: "success" | "error") => void
  readonly closeRuntime: () => void
}

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`AI 대화 요소를 찾을 수 없습니다: ${selector}`)
  }
  return element
}

export function describeAgentContext(context: AgentContext): string {
  return context.kind === "text"
    ? `선택 문장 · 본문 ${context.startLine}–${context.endLine}줄`
    : `선택 이미지 · ${context.path}`
}

export class AgentConversation {
  private readonly thread = requiredElement<HTMLElement>("#agent-thread")
  private readonly empty = requiredElement<HTMLElement>("#agent-empty")
  private readonly merge = new MergeView()
  private readonly timeline = new AgentTimeline((role) => this.appendMessage(role, ""))
  private proposalButton: HTMLButtonElement | undefined

  constructor(private readonly options: AgentConversationOptions) {}

  private appendMessage(role: "user" | "assistant" | "tool", text: string): HTMLElement {
    this.empty.hidden = true
    const message = document.createElement("div")
    message.className = `agent-message agent-message--${role}`
    message.textContent = text
    this.thread.append(message)
    this.thread.scrollTop = this.thread.scrollHeight
    return message
  }

  appendUser(text: string, context?: AgentContext, announce = true): void {
    if (announce) {
      this.thread.setAttribute("aria-live", "polite")
    }
    this.timeline.boundary()
    const message = this.appendMessage("user", text)
    if (context) {
      const reference = document.createElement("span")
      reference.className = "agent-message-context"
      reference.textContent = describeAgentContext(context)
      message.prepend(reference)
    }
  }

  private openProposal(
    event: Extract<AgentEvent, { type: "proposal" }>,
    openImmediately: boolean,
  ): void {
    if (!this.options.getDocument()) {
      return
    }
    if (openImmediately && this.proposalButton) {
      this.proposalButton.disabled = true
    }
    const message = this.appendMessage(
      "tool",
      openImmediately ? "수정 제안이 준비되었습니다." : `저장된 수정 제안 · ${event.title}`,
    )
    message.classList.add("agent-message--proposal")
    const reopen = document.createElement("button")
    reopen.type = "button"
    reopen.className = "agent-proposal-open"
    reopen.textContent = openImmediately ? "수정 제안 다시 열기" : "저장된 수정 제안 검토"
    if (openImmediately) {
      this.proposalButton = reopen
    }
    message.append(reopen)
    const open = (): void => {
      const current = this.options.getDocument()
      if (!current) {
        return
      }
      this.merge.open({
        currentTitle: current.title,
        currentBody: current.body,
        proposedTitle: event.title,
        proposedBody: event.body,
        postPath: current.path,
        mediaUrl: this.options.mediaUrl,
        onApply: (title, body) => {
          reopen.disabled = true
          reopen.textContent = "수정 제안을 적용했습니다."
          this.options.applyMerged(title, body)
          this.options.closeRuntime()
        },
        onClose: () => {
          requiredElement("#article-canvas").hidden = false
          requiredElement("#welcome").hidden = true
        },
      })
    }
    let opened = false
    reopen.addEventListener("click", () => {
      if (opened) {
        this.merge.reopen()
      } else {
        open()
        opened = true
      }
    })
    if (openImmediately) {
      open()
      opened = true
    }
  }

  handle(event: AgentEvent, live = true): void {
    switch (event.type) {
      case "delta":
        this.timeline.appendDelta(event.text)
        return
      case "message":
        this.timeline.appendMessage(event.text)
        return
      case "tool":
        this.timeline.appendTool(
          `${event.status === "running" ? "실행 중" : "완료"}: ${event.label}`,
        )
        return
      case "status":
        this.timeline.appendTool(event.text)
        return
      case "proposal":
        this.timeline.boundary()
        if (live) {
          this.openProposal(event, true)
        } else {
          this.openProposal(event, false)
        }
        return
      case "error":
        this.timeline.boundary()
        if (live) {
          this.options.showToast(event.message, "error")
        } else {
          this.timeline.appendTool(`오류 · ${event.message}`)
        }
        return
      case "done":
        this.timeline.boundary()
        return
      case "session":
        return
    }
  }

  load(history: AgentSessionHistory): void {
    this.reset()
    this.thread.setAttribute("aria-live", "off")
    this.thread.setAttribute("aria-busy", "true")
    try {
      for (const entry of history.entries) {
        if (entry.type === "user") {
          this.appendUser(entry.text, entry.context, false)
        } else {
          this.handle(entry.event, false)
        }
      }
    } finally {
      this.thread.setAttribute("aria-busy", "false")
    }
  }

  boundary(): void {
    this.timeline.boundary()
  }

  reset(): void {
    this.merge.reset()
    this.thread.replaceChildren(this.empty)
    this.empty.hidden = false
    this.thread.setAttribute("aria-live", "polite")
    this.thread.setAttribute("aria-busy", "false")
    this.proposalButton = undefined
    this.timeline.boundary()
  }
}
