import { mkdir, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { type AgentEvent, type AgentProvider, agentEventSchema } from "../shared/agent-contracts"

const repositoryRoot = resolve(import.meta.dir, "../../../..")
const fixtureDirectory = join(repositoryRoot, "content/posts/agent-e2e-fixture")
const fixturePath = join(fixtureDirectory, "index.md")
const provider = (Bun.env["AGENT_PROVIDER"] ?? "codex") as AgentProvider
const expected = `AGENT_${provider.toUpperCase()}_DONE`

const source = `---
date: '2025-08-27T12:00:00+09:00'
draft: false
title: '에이전트 병합 검증'
authors: ["Test"]
tags: ["agent-e2e"]
categories: ["Test"]
---

# 에이전트 검증

이 문장은 자연스럽지 않다 AGENT_ORIGINAL.
`

async function readEvents(response: Response): Promise<readonly AgentEvent[]> {
  if (!response.ok || !response.body) {
    throw new Error(`에이전트 스트림 요청 실패: ${response.status}`)
  }
  const events: AgentEvent[] = []
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
        events.push(agentEventSchema.parse(JSON.parse(line) as unknown))
      }
    }
  }
  return events
}

async function run(): Promise<void> {
  await mkdir(fixtureDirectory, { recursive: true })
  await Bun.write(fixturePath, source)
  let sessionId: string | undefined
  let leakedWorkspace = false
  try {
    const created = await fetch("http://127.0.0.1:4174/api/agent/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider,
        path: "content/posts/agent-e2e-fixture/index.md",
      }),
    })
    if (!created.ok) {
      throw new Error(await created.text())
    }
    const payload = (await created.json()) as { sessionId: string }
    sessionId = payload.sessionId
    const skillInstruction =
      provider === "claude"
        ? "Load the local skills configured for this Claude environment."
        : "Use $fluent-korean for the prose edit."
    const response = await fetch(`http://127.0.0.1:4174/api/agent/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: `${skillInstruction} Replace the exact token AGENT_ORIGINAL with ${expected} in content/posts/agent-e2e-fixture/index.md. Keep every other byte unchanged.`,
      }),
      signal: AbortSignal.timeout(240_000),
    })
    const events = await readEvents(response)
    const proposal = events.find((event) => event.type === "proposal")
    const skillCount = events
      .filter((event) => event.type === "status")
      .map((event) => /로컬 스킬 (\d+)개/.exec(event.text)?.[1] ?? "")
      .map(Number)
      .find((count) => count > 0)
    const usedTool = events.some((event) => event.type === "tool")
    if (proposal?.type !== "proposal" || !proposal.body.includes(expected)) {
      const transcript = events
        .filter((event) => event.type === "delta" || event.type === "message")
        .map((event) => ("text" in event ? event.text : ""))
        .join("")
      throw new Error(
        `${provider}가 예상한 Markdown 제안을 만들지 못했습니다.\n${transcript}\n${JSON.stringify(events.slice(-12))}`,
      )
    }
    if (provider === "omo" ? !usedTool : !skillCount) {
      throw new Error(`${provider}가 로컬 스킬과 도구를 실제로 불러온 증거가 없습니다.`)
    }
    if ((await Bun.file(fixturePath).text()) !== source) {
      throw new Error("에이전트가 사용자의 실제 글을 직접 수정했습니다.")
    }
    console.info(
      JSON.stringify({
        provider,
        eventCount: events.length,
        expected,
        isolated: true,
      }),
    )
  } finally {
    if (sessionId) {
      await fetch(`http://127.0.0.1:4174/api/agent/sessions/${sessionId}`, {
        method: "DELETE",
      }).catch(() => undefined)
      const worktrees = Bun.spawn(["git", "worktree", "list", "--porcelain"], {
        cwd: repositoryRoot,
        stdout: "pipe",
      })
      await worktrees.exited
      leakedWorkspace = (await new Response(worktrees.stdout).text()).includes(sessionId)
    }
    await rm(fixtureDirectory, { recursive: true, force: true })
  }
  if (leakedWorkspace) {
    throw new Error(`${provider} 임시 worktree가 정리되지 않았습니다.`)
  }
}

await run()
