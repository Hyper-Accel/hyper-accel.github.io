import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import type { AgentEvent, AgentInfo, AgentProvider } from "../../shared/agent-contracts"
import { type AgentSessionService, createAgentRoutes } from "./routes"

const sessionId = "10000000-0000-4000-8000-000000000001"

class FakeAgentSessions implements AgentSessionService {
  readonly messages: string[] = []
  interrupted = false
  disposed = false

  async listProviders(): Promise<readonly AgentInfo[]> {
    return [{ id: "omo", label: "OMO", available: true, version: "5.0.0" }]
  }

  async create(
    provider: AgentProvider,
    _postPath: string,
  ): Promise<{ readonly id: string; readonly provider: AgentProvider }> {
    return { id: sessionId, provider }
  }

  async run(
    _id: string,
    prompt: string,
    emit: (event: AgentEvent) => void | Promise<void>,
  ): Promise<void> {
    this.messages.push(prompt)
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
      body: JSON.stringify({ prompt: "문장을 고쳐줘" }),
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
  })
})
