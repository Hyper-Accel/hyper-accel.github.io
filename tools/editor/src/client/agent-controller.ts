import type { AgentContext, AgentProvider, AgentSessionSummary } from "../shared/agent-contracts"
import type { PostDocument } from "../shared/contracts"
import {
  cancelAgentSession,
  createAgentSession,
  disposeAgentSession,
  fetchAgentProviders,
  fetchAgentSession,
  fetchAgentSessions,
  resumeAgentSession,
  streamAgentMessage,
} from "./agent-api"
import { AgentConversation, describeAgentContext } from "./agent-conversation"

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
  const sessionSelect = requiredElement<HTMLSelectElement>("#agent-session")
  const newSession = requiredElement<HTMLButtonElement>("#agent-new-session")
  const form = requiredElement<HTMLFormElement>("#agent-form")
  const prompt = requiredElement<HTMLTextAreaElement>("#agent-prompt")
  const contextPreview = requiredElement<HTMLElement>("#agent-context")
  const contextLabel = requiredElement<HTMLElement>("#agent-context-label")
  const contextRemove = requiredElement<HTMLButtonElement>("#agent-context-remove")
  const send = requiredElement<HTMLButtonElement>("#agent-send")
  const cancel = requiredElement<HTMLButtonElement>("#agent-cancel")

  let sessionId: string | undefined
  let sessionPath: string | undefined
  let sessionProvider: AgentProvider | undefined
  let runtimeActive = false
  let abortController: AbortController | undefined
  let attachedContext: AgentContext | undefined

  const setContext = (context: AgentContext | undefined): void => {
    attachedContext = context
    contextPreview.hidden = !context
    contextLabel.textContent = context ? describeAgentContext(context) : ""
  }

  const switchPanel = (panel: "posts" | "agent"): void => {
    const agentSelected = panel === "agent"
    postsTab.setAttribute("aria-selected", String(!agentSelected))
    agentTab.setAttribute("aria-selected", String(agentSelected))
    postsPanel.hidden = agentSelected
    agentPanel.hidden = !agentSelected
  }

  const closeSession = async (): Promise<void> => {
    if (sessionId && runtimeActive) {
      await disposeAgentSession(sessionId).catch(() => undefined)
    }
    sessionId = undefined
    sessionPath = undefined
    sessionProvider = undefined
    runtimeActive = false
  }

  const conversation = new AgentConversation({
    getDocument: options.getDocument,
    applyMerged: options.applyMerged,
    mediaUrl: options.mediaUrl,
    showToast: options.showToast,
    closeRuntime: () => void closeSession(),
  })
  const providersReady = fetchAgentProviders().then((agents) => {
    provider.replaceChildren()
    for (const agent of agents) {
      const option = document.createElement("option")
      option.value = agent.id
      option.textContent = `${agent.label}${agent.available ? "" : " · 설치되지 않음"}`
      option.disabled = !agent.available
      provider.append(option)
    }
  })

  const formatSession = (session: AgentSessionSummary): string => {
    const updated = new Date(session.updatedAt)
    const today = new Date()
    const sameDay = updated.toDateString() === today.toDateString()
    const date = new Intl.DateTimeFormat("ko", {
      ...(sameDay ? {} : { month: "long", day: "numeric" }),
      hour: "2-digit",
      minute: "2-digit",
    }).format(updated)
    const rawPreview = Array.from(session.preview.replace(/\s+/g, " ").trim() || "새 대화")
    const preview =
      rawPreview.length > 26 ? `${rawPreview.slice(0, 25).join("")}…` : rawPreview.join("")
    return `${preview} · ${date} · ${session.provider.toUpperCase()}`
  }

  const refreshSessions = async (postPath: string, selected = sessionId): Promise<void> => {
    const sessions = await fetchAgentSessions(postPath)
    sessionSelect.replaceChildren(new Option("새 대화", ""))
    for (const session of sessions) {
      const option = new Option(formatSession(session), session.id)
      option.title = `${session.provider.toUpperCase()} · ${session.preview}`
      sessionSelect.append(option)
    }
    sessionSelect.value =
      selected && sessions.some((session) => session.id === selected) ? selected : ""
  }

  const startNewConversation = async (clearContext = true): Promise<void> => {
    await closeSession()
    sessionSelect.value = ""
    conversation.reset()
    if (clearContext) {
      setContext(undefined)
    }
  }

  const loadSession = async (id: string): Promise<void> => {
    await closeSession()
    const history = await fetchAgentSession(id)
    await providersReady
    sessionId = id
    sessionPath = history.path
    sessionProvider = history.provider
    runtimeActive = false
    provider.value = history.provider
    sessionSelect.value = id
    conversation.load(history)
  }

  const run = async (): Promise<void> => {
    const post = options.getDocument()
    const instruction = prompt.value.trim()
    const context = attachedContext
    const selectedProvider = provider.value as AgentProvider
    if (!post || !instruction) {
      options.showToast("먼저 글을 선택하고 에이전트에게 요청할 내용을 입력하세요.", "error")
      return
    }
    if (!(await options.ensureSaved())) {
      return
    }
    if (!sessionId || sessionPath !== post.path || sessionProvider !== selectedProvider) {
      await closeSession()
      sessionId = await createAgentSession(selectedProvider, post.path)
      sessionPath = post.path
      sessionProvider = selectedProvider
      runtimeActive = true
      await refreshSessions(post.path, sessionId)
    } else if (!runtimeActive) {
      sessionProvider = await resumeAgentSession(sessionId)
      runtimeActive = true
    }
    conversation.appendUser(instruction, context)
    setContext(undefined)
    prompt.value = ""
    conversation.boundary()
    send.disabled = true
    cancel.hidden = false
    abortController = new AbortController()
    try {
      await streamAgentMessage(
        sessionId,
        instruction,
        context,
        (event) => conversation.handle(event),
        abortController.signal,
      )
    } catch (error: unknown) {
      if (!abortController.signal.aborted) {
        options.showToast(error instanceof Error ? error.message : String(error), "error")
      }
    } finally {
      send.disabled = false
      cancel.hidden = true
      abortController = undefined
      if (sessionPath) {
        await refreshSessions(sessionPath, sessionId).catch(() => undefined)
      }
    }
  }

  postsTab.addEventListener("click", () => switchPanel("posts"))
  agentTab.addEventListener("click", () => switchPanel("agent"))
  contextRemove.addEventListener("click", () => setContext(undefined))
  provider.addEventListener("change", () => {
    void startNewConversation(false)
      .then(() => {
        options.showToast(
          "에이전트를 바꿔 새 대화를 시작했습니다. 기존 기록은 대화 기록에서 다시 열 수 있습니다.",
          "success",
        )
      })
      .catch((error: unknown) => {
        options.showToast(error instanceof Error ? error.message : String(error), "error")
      })
  })
  newSession.addEventListener("click", () => void startNewConversation())
  sessionSelect.addEventListener("change", () => {
    const id = sessionSelect.value
    void (id ? loadSession(id) : startNewConversation()).catch((error: unknown) => {
      options.showToast(error instanceof Error ? error.message : String(error), "error")
    })
  })
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

  void providersReady.catch((error: unknown) => {
    options.showToast(error instanceof Error ? error.message : String(error), "error")
  })

  return {
    reset: async (): Promise<void> => {
      await closeSession()
      conversation.reset()
      sessionSelect.replaceChildren(new Option("새 대화", ""))
      setContext(undefined)
    },
    showPost: async (postPath: string): Promise<void> => {
      await refreshSessions(postPath).catch((error: unknown) => {
        options.showToast(error instanceof Error ? error.message : String(error), "error")
      })
    },
    attachContext: (context: AgentContext): void => {
      setContext(context)
      switchPanel("agent")
      prompt.focus()
    },
  }
}
