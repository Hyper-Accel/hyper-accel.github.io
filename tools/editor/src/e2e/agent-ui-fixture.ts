import { join, resolve } from "node:path"
import type { Page } from "playwright"
import {
  type AgentContext,
  type AgentEvent,
  type AgentSessionHistory,
  agentMessageRequestSchema,
} from "../shared/agent-contracts"

export const repositoryRoot = resolve(import.meta.dir, "../../../..")
export const fixtureDirectory = join(repositoryRoot, "content/posts/agent-ui-e2e-fixture")
export const fixturePath = join(fixtureDirectory, "index.md")
export const fixtureImagePath = join(fixtureDirectory, "images/context.png")
export const artifactDirectory = "/tmp/hyperaccel-blog-editor-agent-ui-e2e"
export const sessionId = "10000000-0000-4000-8000-000000000099"
export const currentParagraph = "현재 글에는 기존 문장이 있습니다."
export const proposedParagraph = "AI가 제안한 자연스러운 문장이 있습니다."
export const currentTail = "현재 글의 마지막 문단입니다."
export const proposedTail = "AI가 고친 마지막 문단입니다."

export const source = `---
date: '2025-08-27T12:00:00+09:00'
draft: false
title: '에이전트 UI 검증 글'
authors: ["Test"]
tags: ["agent-ui-e2e"]
categories: ["Test"]
---

# 시작 문단

${currentParagraph}

![에이전트 문맥 그림](images/context.png)

${currentTail}
`

function agentEvents(): readonly AgentEvent[] {
  return [
    { type: "status", text: "로컬 스킬 3개를 불러왔습니다." },
    { type: "delta", text: "## 첫 답변\n\n**핵심**을 확인했습니다." },
    { type: "tool", label: "Read: index.md", status: "completed" },
    { type: "delta", text: "도구 결과를 반영한 두 번째 답변입니다." },
    { type: "message", text: "별도 **완료 메시지**입니다." },
    {
      type: "proposal",
      title: "에이전트 UI 검증 글",
      body: `# 시작 문단\n\n${proposedParagraph}\n\n![에이전트 문맥 그림](images/context.png)\n\n${proposedTail}\n`,
    },
    { type: "done" },
  ]
}

type AgentRequest = {
  readonly prompt: string
  readonly context?: AgentContext | undefined
}

export type AgentRouteState = {
  readonly requests: AgentRequest[]
  history?: AgentSessionHistory
  providerGate?: Promise<void>
  resumeError?: string
  resumeCount: number
}

function recordTurn(state: AgentRouteState, request: AgentRequest): void {
  const turn = state.requests.length
  const at = new Date(Date.UTC(2026, 7, 27, 3, turn)).toISOString()
  state.history ??= {
    id: sessionId,
    provider: "codex",
    path: "content/posts/agent-ui-e2e-fixture/index.md",
    createdAt: at,
    updatedAt: at,
    entries: [],
  }
  state.history.entries.push({
    type: "user",
    text: request.prompt,
    ...(request.context ? { context: request.context } : {}),
    at,
  })
  for (const [index, event] of agentEvents().entries()) {
    state.history.entries.push({
      type: "event",
      event,
      at: new Date(Date.parse(at) + index + 1).toISOString(),
    })
  }
  state.history.updatedAt = at
}

export async function installAgentRoutes(page: Page, state: AgentRouteState): Promise<void> {
  await page.route("**/api/agent/providers", async (route) => {
    await state.providerGate
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        agents: [
          { id: "codex", label: "Codex", available: true, version: null },
          { id: "claude", label: "Claude", available: true, version: null },
          { id: "omo", label: "OMO", available: true, version: null },
        ],
      }),
    })
  })
  await page.route("**/api/agent/sessions**", async (route) => {
    if (route.request().method() === "GET") {
      const path = new URL(route.request().url()).searchParams.get("path")
      const sessions =
        state.history?.path === path
          ? [
              {
                id: state.history.id,
                provider: state.history.provider,
                path: state.history.path,
                createdAt: state.history.createdAt,
                updatedAt: state.history.updatedAt,
                preview:
                  state.history.entries.find((entry) => entry.type === "user")?.text ?? "새 대화",
                entryCount: state.history.entries.length,
              },
            ]
          : []
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessions }),
      })
      return
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ sessionId, provider: "codex" }),
    })
  })
  await page.route(`**/api/agent/sessions/${sessionId}/messages`, async (route) => {
    const request = agentMessageRequestSchema.parse(route.request().postDataJSON())
    state.requests.push(request)
    recordTurn(state, request)
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${agentEvents()
        .map((event) => JSON.stringify(event))
        .join("\n")}\n`,
    })
  })
  await page.route(`**/api/agent/sessions/${sessionId}/resume`, async (route) => {
    if (state.resumeError) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: state.resumeError }),
      })
      return
    }
    state.resumeCount += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessionId, provider: state.history?.provider ?? "codex" }),
    })
  })
  await page.route(`**/api/agent/sessions/${sessionId}`, async (route) => {
    if (route.request().method() === "GET" && state.history) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.history),
      })
      return
    }
    await route.fulfill({ status: 204, body: "" })
  })
}

export async function attachTextSelection(page: Page): Promise<void> {
  const paragraph = page.locator(".ProseMirror p").filter({ hasText: currentParagraph })
  await paragraph.evaluate((element) => {
    const editor = element.closest<HTMLElement>(".ProseMirror")
    const text = element.firstChild
    if (!editor || !text) {
      throw new Error("선택할 편집기 문장을 찾지 못했습니다.")
    }
    editor.focus()
    const range = document.createRange()
    range.selectNodeContents(text)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event("selectionchange"))
  })
  const attachment = page.locator(".selection-attach")
  await attachment.waitFor()
  await page.screenshot({
    path: join(artifactDirectory, "selection-attach-text.png"),
    fullPage: false,
  })
  await attachment.click()
  await page.locator("#agent-context").waitFor()
}

export async function attachImageSelection(page: Page): Promise<void> {
  const image = page.locator('.ProseMirror img[alt="에이전트 문맥 그림"]')
  await image.hover()
  const attachment = page.locator(".selection-attach")
  await attachment.waitFor()
  await page.screenshot({
    path: join(artifactDirectory, "selection-attach-image.png"),
    fullPage: false,
  })
  await attachment.click()
  await page.locator("#agent-context").waitFor()
}

export async function openFixture(page: Page): Promise<void> {
  await page.goto("http://127.0.0.1:4173", { waitUntil: "domcontentloaded" })
  const fixture = page.locator('[data-path="content/posts/agent-ui-e2e-fixture/index.md"]')
  await fixture.waitFor()
  if ((await fixture.getAttribute("data-selected")) !== "true") {
    await fixture.click()
  }
  await page
    .locator('[data-path="content/posts/agent-ui-e2e-fixture/index.md"][data-selected="true"]')
    .waitFor()
}

export async function requestProposal(page: Page): Promise<void> {
  await page.locator("#agent-provider").selectOption("codex")
  await page.locator("#agent-prompt").fill("문장을 자연스럽게 다듬어 주세요.")
  await page.locator("#agent-send").click()
  await page.locator("#merge-workspace").waitFor()
}
