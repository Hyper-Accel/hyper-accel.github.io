import { renderAssistantMarkdown } from "./assistant-markdown"

type TimelineRole = "assistant" | "tool"

export type TimelineTarget = {
  innerHTML: string
  textContent: string | null
}

export class AgentTimeline {
  private activeAssistant:
    | {
        readonly target: TimelineTarget
        markdown: string
      }
    | undefined

  constructor(private readonly append: (role: TimelineRole) => TimelineTarget) {}

  appendDelta(text: string): void {
    if (!this.activeAssistant) {
      this.activeAssistant = { target: this.append("assistant"), markdown: "" }
    }
    this.activeAssistant.markdown += text
    this.activeAssistant.target.innerHTML = renderAssistantMarkdown(this.activeAssistant.markdown)
  }

  appendMessage(markdown: string): void {
    this.boundary()
    this.append("assistant").innerHTML = renderAssistantMarkdown(markdown)
  }

  appendTool(text: string): void {
    this.boundary()
    this.append("tool").textContent = text
  }

  boundary(): void {
    this.activeAssistant = undefined
  }
}
