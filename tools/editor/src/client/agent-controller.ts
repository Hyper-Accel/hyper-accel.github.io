import type { AgentEvent, AgentProvider } from "../shared/agent-contracts"
import type { PostDocument } from "../shared/contracts"
import {
  cancelAgentSession,
  createAgentSession,
  disposeAgentSession,
  fetchAgentProviders,
  streamAgentMessage,
} from "./agent-api"
import { MergeView } from "./merge-view"

type AgentControllerOptions = {
  readonly getDocument: () => PostDocument | undefined
  readonly ensureSaved: () => Promise<boolean>
  readonly applyMerged: (title: string, body: string) => void
  readonly mediaUrl: (source: string) => string
  readonly showToast: (message: string, tone: "success" | "error") => void
}

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`AI 화면 요소를 찾을 수 없습니다: ${selector}`)
  }
  return element
}

export function setupAgentController(options: AgentControllerOptions) {
  const postsTab = requiredElement<HTMLButtonElement>("#posts-tab")
  const agentTab = requiredElement<HTMLButtonElement>("#agent-tab")
  const postsPanel = requiredElement<HTMLElement>("#posts-panel")
  const agentPanel = requiredElement<HTMLElement>("#agent-panel")
  const provider = requiredElement<HTMLSelectElement>("#agent-provider")
  const thread = requiredElement<HTMLElement>("#agent-thread")
  const empty = requiredElement<HTMLElement>("#agent-empty")
  const form = requiredElement<HTMLFormElement>("#agent-form")
  const prompt = requiredElement<HTMLTextAreaElement>("#agent-prompt")
  const send = requiredElement<HTMLButtonElement>("#agent-send")
  const cancel = requiredElement<HTMLButtonElement>("#agent-cancel")
  const merge = new MergeView()

  let sessionId: string | undefined
  let sessionPath: string | undefined
  let sessionProvider: AgentProvider | undefined
  let abortController: AbortController | undefined
  let assistantMessage: HTMLElement | undefined
  let proposalButton: HTMLButtonElement | undefined

  const switchPanel = (panel: "posts" | "agent"): void => {
    const agentSelected = panel === "agent"
    postsTab.setAttribute("aria-selected", String(!agentSelected))
    agentTab.setAttribute("aria-selected", String(agentSelected))
    postsPanel.hidden = agentSelected
    agentPanel.hidden = !agentSelected
  }

  const appendMessage = (role: "user" | "assistant" | "tool", text: string): HTMLElement => {
    empty.hidden = true
    const message = document.createElement("div")
    message.className = `agent-message agent-message--${role}`
    message.textContent = text
    thread.append(message)
    thread.scrollTop = thread.scrollHeight
    return message
  }

  const appendDelta = (text: string): void => {
    if (!assistantMessage) {
      assistantMessage = appendMessage("assistant", "")
    }
    assistantMessage.textContent = `${assistantMessage.textContent ?? ""}${text}`
    thread.scrollTop = thread.scrollHeight
  }

  const closeSession = async (): Promise<void> => {
    if (sessionId) {
      await disposeAgentSession(sessionId).catch(() => undefined)
    }
    sessionId = undefined
    sessionPath = undefined
    sessionProvider = undefined
  }

  const handleEvent = (event: AgentEvent): void => {
    switch (event.type) {
      case "delta":
        appendDelta(event.text)
        return
      case "message":
        if (!assistantMessage) {
          appendMessage("assistant", event.text)
        }
        return
      case "tool":
        appendMessage("tool", `${event.status === "running" ? "실행 중" : "완료"}: ${event.label}`)
        return
      case "status":
        appendMessage("tool", event.text)
        return
      case "proposal": {
        const currentDocument = options.getDocument()
        if (currentDocument) {
          if (proposalButton) {
            proposalButton.disabled = true
          }
          const proposalMessage = appendMessage("tool", "수정 제안이 준비되었습니다.")
          const reopenButton = document.createElement("button")
          reopenButton.type = "button"
          reopenButton.className = "agent-proposal-open"
          reopenButton.textContent = "수정 제안 다시 열기"
          proposalButton = reopenButton
          proposalMessage.append(reopenButton)
          merge.open({
            currentTitle: currentDocument.title,
            currentBody: currentDocument.body,
            proposedTitle: event.title,
            proposedBody: event.body,
            postPath: currentDocument.path,
            mediaUrl: options.mediaUrl,
            onApply: (title, body) => {
              reopenButton.disabled = true
              reopenButton.textContent = "수정 제안을 적용했습니다."
              options.applyMerged(title, body)
              void closeSession()
            },
            onClose: () => {
              requiredElement("#article-canvas").hidden = false
              requiredElement("#welcome").hidden = true
            },
          })
          reopenButton.addEventListener("click", () => merge.reopen())
        }
        return
      }
      case "error":
        options.showToast(event.message, "error")
        return
      case "session":
      case "done":
        return
    }
  }

  const run = async (): Promise<void> => {
    const document = options.getDocument()
    const instruction = prompt.value.trim()
    const selectedProvider = provider.value as AgentProvider
    if (!document || !instruction) {
      options.showToast("먼저 글을 선택하고 에이전트에게 요청할 내용을 입력하세요.", "error")
      return
    }
    if (!(await options.ensureSaved())) {
      return
    }
    if (!sessionId || sessionPath !== document.path || sessionProvider !== selectedProvider) {
      await closeSession()
      sessionId = await createAgentSession(selectedProvider, document.path)
      sessionPath = document.path
      sessionProvider = selectedProvider
    }
    appendMessage("user", instruction)
    prompt.value = ""
    assistantMessage = undefined
    send.disabled = true
    cancel.hidden = false
    abortController = new AbortController()
    try {
      await streamAgentMessage(sessionId, instruction, handleEvent, abortController.signal)
    } catch (error: unknown) {
      if (!abortController.signal.aborted) {
        options.showToast(error instanceof Error ? error.message : String(error), "error")
      }
    } finally {
      send.disabled = false
      cancel.hidden = true
      abortController = undefined
    }
  }

  postsTab.addEventListener("click", () => switchPanel("posts"))
  agentTab.addEventListener("click", () => switchPanel("agent"))
  provider.addEventListener("change", () => void closeSession())
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    void run()
  })
  cancel.addEventListener("click", () => {
    abortController?.abort()
    if (sessionId) {
      void cancelAgentSession(sessionId)
    }
  })

  void fetchAgentProviders()
    .then((agents) => {
      provider.replaceChildren()
      for (const agent of agents) {
        const option = document.createElement("option")
        option.value = agent.id
        option.textContent = `${agent.label}${agent.available ? "" : " · 설치되지 않음"}`
        option.disabled = !agent.available
        provider.append(option)
      }
    })
    .catch((error: unknown) => {
      options.showToast(error instanceof Error ? error.message : String(error), "error")
    })

  return {
    reset: async (): Promise<void> => {
      merge.reset()
      await closeSession()
      thread.replaceChildren(empty)
      empty.hidden = false
      proposalButton = undefined
    },
  }
}
