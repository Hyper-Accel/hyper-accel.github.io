import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { chromium, type Page } from "playwright"
import { AgentSessionStore } from "../server/agent/session-store"
import type { AgentSessionHistory } from "../shared/agent-contracts"

const repositoryRoot = resolve(import.meta.dir, "../../../..")
const editorRoot = resolve(import.meta.dir, "../..")
const fixtureDirectory = join(repositoryRoot, "content/posts/session-restart-e2e-fixture")
const fixturePath = join(fixtureDirectory, "index.md")
const postPath = "content/posts/session-restart-e2e-fixture/index.md"
const sessionId = "10000000-0000-4000-8000-000000000088"
const webPort = 4273
const apiPort = 4274

const source = `---
date: '2026-08-27T12:00:00+09:00'
draft: false
title: '세션 재시작 검증 글'
authors: ["Test"]
tags: ["session-e2e"]
categories: ["Test"]
---

# 세션 기록

서버 재시작 뒤에도 이 글의 대화를 불러옵니다.
`

function startApi(sessionDirectory: string) {
  return Bun.spawn(["bun", "src/server/index.ts"], {
    cwd: editorRoot,
    env: {
      ...process.env,
      TECHBLOG_EDITOR_API_PORT: String(apiPort),
      TECHBLOG_EDITOR_SESSION_DIR: sessionDirectory,
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
  })
}

function startWeb() {
  return Bun.spawn(["bunx", "vite", "--host", "127.0.0.1"], {
    cwd: editorRoot,
    env: {
      ...process.env,
      TECHBLOG_EDITOR_API_PORT: String(apiPort),
      TECHBLOG_EDITOR_WEB_PORT: String(webPort),
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
  })
}

async function waitForOutput(
  stream: ReadableStream<Uint8Array>,
  pattern: RegExp,
  label: string,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let ready = false
  const found = new Promise<void>((resolveReady, rejectReady) => {
    void (async () => {
      while (true) {
        const result = await reader.read()
        if (result.done) {
          throw new Error(`${label}가 준비되기 전에 종료되었습니다.`)
        }
        buffer += decoder.decode(result.value, { stream: true })
        if (!ready && pattern.test(buffer)) {
          ready = true
          resolveReady()
        }
      }
    })().catch((error: unknown) => {
      if (!ready) {
        rejectReady(error)
      }
    })
  })
  const timeout = AbortSignal.timeout(30_000)
  await Promise.race([
    found,
    new Promise<never>((_resolve, reject) => {
      timeout.addEventListener(
        "abort",
        () => reject(new Error(`${label} 준비 시간이 초과되었습니다.`)),
        { once: true },
      )
    }),
  ])
}

async function openHistory(page: Page): Promise<void> {
  await page.goto(`http://127.0.0.1:${webPort}`, { waitUntil: "networkidle" })
  const fixture = page.locator(`[data-path="${postPath}"]`)
  await fixture.waitFor()
  if ((await fixture.getAttribute("data-selected")) !== "true") {
    await fixture.click()
  }
  await page.locator("#agent-tab").click()
  await page.locator(`#agent-session option[value="${sessionId}"]`).waitFor({
    state: "attached",
  })
  await page.locator("#agent-session").selectOption(sessionId)
  await page.locator(".agent-message--user").waitFor()
}

async function run(): Promise<void> {
  const sessionDirectory = await mkdtemp(join(tmpdir(), "techblog-session-restart-"))
  await mkdir(fixtureDirectory, { recursive: true })
  await writeFile(fixturePath, source, "utf8")
  const history: AgentSessionHistory = {
    id: sessionId,
    provider: "codex",
    path: postPath,
    createdAt: "2026-08-27T10:00:00.000Z",
    updatedAt: "2026-08-27T10:01:00.000Z",
    entries: [
      {
        type: "user",
        text: "이전 대화를 불러와줘",
        at: "2026-08-27T10:00:00.000Z",
      },
      {
        type: "event",
        event: { type: "tool", label: "Read: index.md", status: "completed" },
        at: "2026-08-27T10:00:01.000Z",
      },
      {
        type: "event",
        event: { type: "message", text: "저장된 대화를 불러왔습니다." },
        at: "2026-08-27T10:00:02.000Z",
      },
    ],
  }
  await new AgentSessionStore(sessionDirectory).save(history)

  const web = startWeb()
  let api = startApi(sessionDirectory)
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    await Promise.all([
      waitForOutput(web.stdout, /Local:/, "Vite"),
      waitForOutput(api.stdout, /Started.*server/i, "API"),
    ])
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openHistory(page)
    const firstRoles = await page
      .locator(".agent-message")
      .evaluateAll((messages) =>
        messages.map((message) =>
          message.classList.contains("agent-message--user")
            ? "user"
            : message.classList.contains("agent-message--tool")
              ? "tool"
              : "assistant",
        ),
      )

    api.kill()
    await api.exited
    api = startApi(sessionDirectory)
    await waitForOutput(api.stdout, /Started.*server/i, "재시작 API")
    await openHistory(page)
    const secondRoles = await page
      .locator(".agent-message")
      .evaluateAll((messages) =>
        messages.map((message) =>
          message.classList.contains("agent-message--user")
            ? "user"
            : message.classList.contains("agent-message--tool")
              ? "tool"
              : "assistant",
        ),
      )
    const expected = ["user", "tool", "assistant"]
    if (
      JSON.stringify(firstRoles) !== JSON.stringify(expected) ||
      JSON.stringify(secondRoles) !== JSON.stringify(expected)
    ) {
      throw new Error(
        `서버 재시작 전후 세션 순서가 다릅니다: ${JSON.stringify({ firstRoles, secondRoles })}`,
      )
    }
    console.info(JSON.stringify({ serverRestarts: 1, restoredRoles: secondRoles }))
  } finally {
    await browser.close()
    api.kill()
    web.kill()
    await Promise.all([api.exited, web.exited])
    await rm(sessionDirectory, { recursive: true, force: true })
    await rm(fixtureDirectory, { recursive: true, force: true })
  }
}

await run()
