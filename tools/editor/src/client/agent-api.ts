import {
  type AgentEvent,
  type AgentInfo,
  type AgentProvider,
  agentEventSchema,
  agentListResponseSchema,
  createAgentSessionResponseSchema,
} from "../shared/agent-contracts"

async function errorFrom(response: Response): Promise<Error> {
  const payload: unknown = await response.json().catch(() => undefined)
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const message = (payload as { error?: unknown }).error
    if (typeof message === "string") {
      return new Error(message)
    }
  }
  return new Error(`에이전트 요청이 실패했습니다. (${response.status})`)
}

export async function fetchAgentProviders(): Promise<readonly AgentInfo[]> {
  const response = await fetch("/api/agent/providers")
  if (!response.ok) {
    throw await errorFrom(response)
  }
  return agentListResponseSchema.parse(await response.json()).agents
}

export async function createAgentSession(provider: AgentProvider, path: string): Promise<string> {
  const response = await fetch("/api/agent/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider, path }),
  })
  if (!response.ok) {
    throw await errorFrom(response)
  }
  return createAgentSessionResponseSchema.parse(await response.json()).sessionId
}

export async function streamAgentMessage(
  sessionId: string,
  prompt: string,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/agent/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal,
  })
  if (!response.ok || !response.body) {
    throw await errorFrom(response)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const result = await reader.read()
    if (result.done) {
      break
    }
    buffer += decoder.decode(result.value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (line.trim()) {
        onEvent(agentEventSchema.parse(JSON.parse(line) as unknown))
      }
    }
  }
}

export async function cancelAgentSession(sessionId: string): Promise<void> {
  await fetch(`/api/agent/sessions/${sessionId}/cancel`, { method: "POST" })
}

export async function disposeAgentSession(sessionId: string): Promise<void> {
  await fetch(`/api/agent/sessions/${sessionId}`, { method: "DELETE" })
}
