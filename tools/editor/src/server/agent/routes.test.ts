import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import type {
  AgentContext,
  AgentEvent,
  AgentInfo,
  AgentProvider,
  AgentSessionHistory,
} from "../../shared/agent-contracts"
import { type AgentSessionService, createAgentRoutes } from "./routes"

const sessionId = "10000000-0000-4000-8000-000000000001"

class FakeAgentSessions implements AgentSessionService {
  readonly messages: string[] = []
  readonly contexts: (AgentContext | undefined)[] = []
  interrupted = false
  disposed = false
  readonly savedSession: AgentSessionHistory = {
    id: sessionId,
    provider: "omo",
    path: "content/posts/example/index.md",
    createdAt: "2026-08-27T10:00:00.000Z",
    updatedAt: "2026-08-27T10:01:00.000Z",
    entries: [
      {
        type: "user",
        text: "문장을 고쳐줘",
        at: "2026-08-27T10:00:00.000Z",
      },
    ],
  }

  async listProviders(): Promise<readonly AgentInfo[]> {
    return [{ id: "omo", label: "OMO", available: true, version: "5.0.0" }]
  }

  async create(
    provider: AgentProvider,
    _postPath: string,
  ): Promise<{ readonly id: string; readonly provider: AgentProvider }> {
    return { id: sessionId, provider }
  }

  async list(postPath: string) {
    return postPath === this.savedSession.path
      ? [
          {
            ...this.savedSession,
            preview: "문장을 고쳐줘",
            entryCount: this.savedSession.entries.length,
            entries: undefined,
          },
        ].map(({ entries: _entries, ...summary }) => summary)
      : []
  }

  async history(id: string): Promise<AgentSessionHistory> {
    if (id !== sessionId) {
      throw new Error("not found")
    }
    return this.savedSession
  }

  async resume(id: string): Promise<{ readonly id: string; readonly provider: AgentProvider }> {
    return { id, provider: this.savedSession.provider }
  }

  async run(
    _id: string,
    prompt: string,
    context: AgentContext | undefined,
    emit: (event: AgentEvent) => void | Promise<void>,
  ): Promise<void> {
    this.messages.push(prompt)
    this.contexts.push(context)
    await emit({ type: "delta", text: "수정 중" })
    await emit({ type: "proposal", title: "제안 제목", body: "제안 본문\n" })
    await emit({ type: "done" })
  }

  async interrupt(): Promise<void> {
    this.interrupted = true
  }

  async dispose(): Promise<void> {
    this.disposed = true
  }
}

describe("agent routes", () => {
  test("lists providers, creates a session, and streams NDJSON events", async () => {
    const sessions = new FakeAgentSessions()
    const app = new Hono().route("/api/agent", createAgentRoutes(sessions))

    const providers = await app.request("/api/agent/providers")
    expect(providers.status).toBe(200)
    expect(await providers.json()).toEqual({
      agents: [{ id: "omo", label: "OMO", available: true, version: "5.0.0" }],
    })

    const created = await app.request("/api/agent/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "omo",
        path: "content/posts/example/index.md",
      }),
    })
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ sessionId, provider: "omo" })

    const streamed = await app.request(`/api/agent/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "문장을 고쳐줘",
        context: { kind: "text", text: "이 문장", startLine: 2, endLine: 2 },
      }),
    })
    expect(streamed.status).toBe(200)
    expect(streamed.headers.get("content-type")).toContain("application/x-ndjson")
    const events = (await streamed.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as AgentEvent)
    expect(events).toEqual([
      { type: "delta", text: "수정 중" },
      { type: "proposal", title: "제안 제목", body: "제안 본문\n" },
      { type: "done" },
    ])
    expect(sessions.messages).toEqual(["문장을 고쳐줘"])
    expect(sessions.contexts).toEqual([{ kind: "text", text: "이 문장", startLine: 2, endLine: 2 }])

    const listed = await app.request(
      `/api/agent/sessions?path=${encodeURIComponent(sessions.savedSession.path)}`,
    )
    expect(listed.status).toBe(200)
    expect((await listed.json()).sessions[0].id).toBe(sessionId)

    const history = await app.request(`/api/agent/sessions/${sessionId}`)
    expect(history.status).toBe(200)
    expect(await history.json()).toEqual(sessions.savedSession)

    const resumed = await app.request(`/api/agent/sessions/${sessionId}/resume`, {
      method: "POST",
    })
    expect(resumed.status).toBe(200)
    expect(await resumed.json()).toEqual({ sessionId, provider: "omo" })
  })
})
