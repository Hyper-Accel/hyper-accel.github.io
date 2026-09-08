import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { type Browser, chromium, type Page } from "playwright"
import { createServer, type ViteDevServer } from "vite"
import { AgentSessionStore } from "../server/agent/session-store"
import { prepareCommand } from "../server/process-command"
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
  let readySettled = false
  let resolveReady: () => void = () => undefined
  let rejectReady: (error: Error) => void = () => undefined
  const ready = new Promise<void>((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise
    rejectReady = rejectPromise
  })
  const child = Bun.spawn(
    prepareCommand([
      "bun",
      "-e",
      'const { default: options } = await import("./src/server/index.ts"); Bun.serve(options); process.send?.({ type: "ready" })',
    ]),
    {
      cwd: editorRoot,
      env: {
        ...process.env,
        TECHBLOG_EDITOR_API_PORT: String(apiPort),
        TECHBLOG_EDITOR_SESSION_DIR: sessionDirectory,
      },
      ipc(message) {
        if (
          !readySettled &&
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          message.type === "ready"
        ) {
          readySettled = true
          resolveReady()
        }
      },
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    },
  )
  void child.exited.then((exitCode) => {
    if (!readySettled) {
      readySettled = true
      rejectReady(new Error(`API가 준비되기 전에 종료되었습니다. (exit ${exitCode})`))
    }
  })
  return { child, ready }
}

async function withTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} 시간이 초과되었습니다.`)), timeoutMs)
        timeout.unref()
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

async function startWeb(): Promise<ViteDevServer> {
  const web = await withTimeout(
    createServer({
      configFile: false,
      root: editorRoot,
      server: {
        host: "127.0.0.1",
        port: webPort,
        strictPort: true,
        proxy: {
          "/api": `http://127.0.0.1:${apiPort}`,
        },
      },
    }),
    30_000,
    "Vite 생성",
  )
  try {
    await withTimeout(web.listen(), 30_000, "Vite 시작")
    return web
  } catch (error: unknown) {
    await withTimeout(web.close(), 5_000, "Vite 시작 실패 정리")
    throw error
  }
}

async function waitForApiReady(api: ReturnType<typeof startApi>, label: string): Promise<void> {
  await withTimeout(api.ready, 30_000, `${label} 준비`)
}

async function stopApi(child: ReturnType<typeof startApi>["child"]): Promise<void> {
  if (child.exitCode !== null) {
    return
  }
  child.kill()
  try {
    await withTimeout(child.exited, 5_000, "API 종료")
  } catch {
    child.kill(9)
    await withTimeout(child.exited, 5_000, "API 강제 종료")
  }
}

async function waitForHttp(
  process: Pick<ReturnType<typeof startApi>["child"], "exitCode" | "exited">,
  url: string,
  label: string,
): Promise<void> {
  const deadline = performance.now() + 30_000
  const exited = process.exited.then((exitCode) => ({ type: "exit" as const, exitCode }))
  let lastFailure = "응답 없음"
  while (performance.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`${label}가 준비되기 전에 종료되었습니다. (exit ${process.exitCode})`)
    }
    const requestTimeout = Math.max(1, Math.min(1_000, Math.ceil(deadline - performance.now())))
    const attempt = await Promise.race([
      fetch(url, { signal: AbortSignal.timeout(requestTimeout) })
        .then((response) => ({ type: "response" as const, response }))
        .catch((error: unknown) => ({ type: "error" as const, error })),
      exited,
    ])
    if (attempt.type === "exit") {
      throw new Error(`${label}가 준비되기 전에 종료되었습니다. (exit ${attempt.exitCode})`)
    }
    if (attempt.type === "response") {
      const { response } = attempt
      let ready = false
      if (response.ok) {
        try {
          const payload: unknown = await response.json()
          ready =
            typeof payload === "object" &&
            payload !== null &&
            "posts" in payload &&
            Array.isArray(payload.posts)
          lastFailure = ready ? lastFailure : "API 응답 형식이 올바르지 않습니다."
        } catch (error: unknown) {
          lastFailure = error instanceof Error ? error.message : String(error)
        }
      } else {
        lastFailure = `HTTP ${response.status}`
        await response.body?.cancel()
      }
      if (ready) {
        if (process.exitCode !== null) {
          throw new Error(`${label}가 준비되기 전에 종료되었습니다. (exit ${process.exitCode})`)
        }
        return
      }
    } else {
      lastFailure = attempt.error instanceof Error ? attempt.error.message : String(attempt.error)
    }
    await Bun.sleep(Math.max(0, Math.min(100, deadline - performance.now())))
  }
  throw new Error(`${label} 준비 시간이 초과되었습니다: ${lastFailure}`)
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

  let web: ViteDevServer | undefined
  let api: ReturnType<typeof startApi> | undefined
  let browser: Browser | undefined
  let operationFailure: unknown
  let cleanupFailures: unknown[] = []
  try {
    web = await startWeb()
    api = startApi(sessionDirectory)
    browser = await chromium.launch({ channel: "chrome", headless: true })
    await waitForApiReady(api, "API")
    await waitForHttp(api.child, `http://127.0.0.1:${apiPort}/api/posts`, "API")
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

    await stopApi(api.child)
    api = startApi(sessionDirectory)
    await waitForApiReady(api, "재시작 API")
    await waitForHttp(api.child, `http://127.0.0.1:${apiPort}/api/posts`, "재시작 API")
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
  } catch (error: unknown) {
    operationFailure = error
  } finally {
    const cleanup: Promise<unknown>[] = []
    if (browser) {
      cleanup.push(withTimeout(browser.close(), 5_000, "브라우저 종료"))
    }
    if (api) {
      cleanup.push(stopApi(api.child))
    }
    if (web) {
      cleanup.push(withTimeout(web.close(), 5_000, "Vite 종료"))
    }
    cleanup.push(
      withTimeout(
        rm(sessionDirectory, { recursive: true, force: true }),
        5_000,
        "세션 디렉터리 정리",
      ),
      withTimeout(rm(fixtureDirectory, { recursive: true, force: true }), 5_000, "fixture 정리"),
    )
    const results = await Promise.allSettled(cleanup)
    cleanupFailures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    )
  }
  const failures = operationFailure ? [operationFailure, ...cleanupFailures] : cleanupFailures
  if (failures.length === 1) {
    throw failures[0]
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, "E2E 실행 또는 리소스 정리에 실패했습니다.")
  }
}

await run()
