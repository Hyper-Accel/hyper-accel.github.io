import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AgentEvent, AgentSessionHistory } from "../../shared/agent-contracts"
import type { Harness } from "./harness"
import { AgentSessionManager, emitAgentFailure, resolveAgentSessionDirectory } from "./session"

const temporaryRoots: string[] = []

async function git(cwd: string, ...args: string[]): Promise<void> {
  const process = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" })
  const exitCode = await process.exited
  if (exitCode !== 0) {
    throw new Error(await new Response(process.stderr).text())
  }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })))
})

describe("emitAgentFailure", () => {
  test("ends a failed stream after reporting the error", async () => {
    const events: AgentEvent[] = []

    await emitAgentFailure(new Error("실패"), (event) => {
      events.push(event)
    })

    expect(events.map((event) => event.type)).toEqual(["error", "done"])
  })
})

describe("AgentSessionManager", () => {
  test("uses the common Git directory from a linked worktree", async () => {
    const parent = await mkdtemp(join(tmpdir(), "techblog-session-gitdir-"))
    temporaryRoots.push(parent)
    const repository = join(parent, "repository")
    const worktree = join(parent, "worktree")
    await mkdir(repository)
    await git(repository, "init")
    await git(repository, "config", "user.email", "editor@example.com")
    await git(repository, "config", "user.name", "Editor Test")
    await Bun.write(join(repository, "README.md"), "test")
    await git(repository, "add", ".")
    await git(repository, "commit", "-m", "base")
    await git(repository, "worktree", "add", "--detach", worktree)

    expect(resolveAgentSessionDirectory(worktree, undefined)).toBe(
      join(await realpath(join(repository, ".git")), "techblog-editor", "sessions"),
    )
  })

  test("reports preflight failures and keeps the session runnable", async () => {
    const root = await mkdtemp(join(tmpdir(), "techblog-session-manager-"))
    temporaryRoots.push(root)
    const postPath = "content/posts/arc-setup-guide/index.md"
    await mkdir(join(root, "content/posts/arc-setup-guide"), { recursive: true })
    await Bun.write(join(root, postPath), "---\ntitle: '기준 글'\ndraft: false\n---\n\n기준 본문\n")
    let history: AgentSessionHistory | undefined
    const store = {
      save: async (next: AgentSessionHistory): Promise<void> => {
        history = structuredClone(next)
      },
      get: async (): Promise<AgentSessionHistory | undefined> => history,
      list: async () => [],
    }
    const harness: Harness = {
      run: async () => undefined,
      interrupt: async () => undefined,
      dispose: async () => undefined,
    }
    const manager = new AgentSessionManager(store, {
      listProviders: async () => [{ id: "codex", label: "Codex", available: true, version: null }],
      createWorkspace: async (_repositoryRoot, workspacePostPath, id) => ({
        id,
        repositoryRoot: root,
        root,
        postPath: workspacePostPath,
      }),
      createHarness: () => harness,
      readWorkspacePost: async () => ({ title: "제안 글", body: "제안 본문" }),
      cleanupWorkspace: async () => undefined,
    })
    const session = await manager.create("codex", postPath)
    const eventTypes: string[] = []
    const context = { kind: "image" as const, path: "images/missing.png" }

    await manager.run(session.id, "그림을 검토해 주세요.", context, (event) => {
      eventTypes.push(event.type)
    })
    await manager.run(session.id, "다시 검토해 주세요.", context, (event) => {
      eventTypes.push(event.type)
    })

    expect(eventTypes).toEqual(["error", "done", "error", "done"])
    await manager.dispose(session.id)
  })

  test("replays stored history again after an interrupted first run", async () => {
    const root = await mkdtemp(join(tmpdir(), "techblog-session-manager-"))
    temporaryRoots.push(root)
    const postPath = "content/posts/arc-setup-guide/index.md"
    await mkdir(join(root, "content/posts/arc-setup-guide"), { recursive: true })
    await Bun.write(join(root, postPath), "---\ntitle: '기준 글'\ndraft: false\n---\n\n기준 본문\n")
    const now = new Date().toISOString()
    let history: AgentSessionHistory | undefined = {
      id: "10000000-0000-4000-8000-000000000071",
      provider: "codex",
      path: postPath,
      createdAt: now,
      updatedAt: now,
      entries: [{ type: "user", text: "저장된 요청", at: now }],
    }
    const store = {
      save: async (next: AgentSessionHistory): Promise<void> => {
        history = structuredClone(next)
      },
      get: async (): Promise<AgentSessionHistory | undefined> => history,
      list: async () => [],
    }
    const prompts: string[] = []
    let fail = true
    const harness: Harness = {
      run: async (prompt) => {
        prompts.push(prompt)
        if (fail) {
          fail = false
          throw new Error("중단됨")
        }
      },
      interrupt: async () => undefined,
      dispose: async () => undefined,
    }
    const manager = new AgentSessionManager(store, {
      listProviders: async () => [{ id: "codex", label: "Codex", available: true, version: null }],
      createWorkspace: async (_repositoryRoot, workspacePostPath, id) => ({
        id,
        repositoryRoot: root,
        root,
        postPath: workspacePostPath,
      }),
      createHarness: () => harness,
      readWorkspacePost: async () => ({ title: "제안 글", body: "제안 본문" }),
      cleanupWorkspace: async () => undefined,
    })
    await manager.resume(history.id)

    await manager.run(history.id, "첫 재개 요청", undefined, () => undefined)
    await manager.run(history.id, "두 번째 재개 요청", undefined, () => undefined)
    await manager.run(history.id, "세 번째 요청", undefined, () => undefined)

    expect(prompts[0]).toContain("저장된 요청")
    expect(prompts[1]).toContain("저장된 요청")
    expect(prompts[2]).not.toContain("이전 대화 기록")
    await manager.dispose(history.id)
  })
})
