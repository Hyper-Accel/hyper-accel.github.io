import { existsSync, readFileSync, realpathSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import type {
  AgentContext,
  AgentEvent,
  AgentProvider,
  AgentSessionHistory,
} from "../../shared/agent-contracts"
import { repositoryRoot, resolveContentPath, splitMarkdownDocument } from "../content"
import { ContentError } from "../errors"
import { createHarness, detectAgentProviders, type Harness } from "./harness"
import { bodyLineOffset, buildAgentPrompt } from "./prompt"
import { AgentSessionStore } from "./session-store"
import {
  type AgentWorkspace,
  cleanupAgentWorkspace,
  createAgentWorkspace,
  readWorkspacePost,
} from "./workspace"

type SessionRecord = {
  readonly id: string
  readonly provider: AgentProvider
  readonly workspace: AgentWorkspace
  readonly harness: Harness
  readonly history: AgentSessionHistory
  replayHistory: boolean
  running: boolean
  cleanupTimer: ReturnType<typeof setTimeout>
}

type AgentSessionPersistence = Pick<AgentSessionStore, "get" | "list" | "save">

type AgentSessionDependencies = {
  readonly listProviders: typeof detectAgentProviders
  readonly createWorkspace: typeof createAgentWorkspace
  readonly createHarness: typeof createHarness
  readonly readWorkspacePost: typeof readWorkspacePost
  readonly cleanupWorkspace: typeof cleanupAgentWorkspace
}

const defaultDependencies: AgentSessionDependencies = {
  listProviders: detectAgentProviders,
  createWorkspace: createAgentWorkspace,
  createHarness,
  readWorkspacePost,
  cleanupWorkspace: cleanupAgentWorkspace,
}

export function resolveAgentSessionDirectory(root: string, configured: string | undefined): string {
  if (configured) {
    return configured
  }
  try {
    const dotGit = join(root, ".git")
    let gitDirectory = dotGit
    if (!statSync(dotGit).isDirectory()) {
      const pointer = /^gitdir:\s*(.+)$/i.exec(readFileSync(dotGit, "utf8").trim())?.[1]
      if (!pointer) {
        throw new Error(".git 파일에 gitdir 경로가 없습니다.")
      }
      gitDirectory = resolve(root, pointer)
    }
    const commonDirectoryFile = join(gitDirectory, "commondir")
    const commonDirectory = existsSync(commonDirectoryFile)
      ? resolve(gitDirectory, readFileSync(commonDirectoryFile, "utf8").trim())
      : gitDirectory
    return join(realpathSync(commonDirectory), "techblog-editor", "sessions")
  } catch (error: unknown) {
    throw new ContentError(
      error instanceof Error
        ? `Git 세션 저장소 경로를 확인하지 못했습니다: ${error.message}`
        : "Git 세션 저장소 경로를 확인하지 못했습니다.",
    )
  }
}

export async function emitAgentFailure(
  error: unknown,
  emit: (event: AgentEvent) => void | Promise<void>,
): Promise<void> {
  await emit({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  })
  await emit({ type: "done" })
}

export class AgentSessionManager {
  private readonly sessions = new Map<string, SessionRecord>()

  constructor(
    private readonly store: AgentSessionPersistence = new AgentSessionStore(
      resolveAgentSessionDirectory(repositoryRoot, Bun.env["TECHBLOG_EDITOR_SESSION_DIR"]),
    ),
    private readonly dependencies: AgentSessionDependencies = defaultDependencies,
  ) {}

  async listProviders() {
    return this.dependencies.listProviders()
  }

  private async activate(
    history: AgentSessionHistory,
    replayHistory: boolean,
  ): Promise<SessionRecord> {
    const { id, provider, path: postPath } = history
    resolveContentPath(repositoryRoot, postPath)
    const providers = await this.listProviders()
    if (!providers.find((candidate) => candidate.id === provider)?.available) {
      throw new ContentError(`${provider} 실행 파일을 찾을 수 없습니다.`)
    }
    const workspace = await this.dependencies.createWorkspace(repositoryRoot, postPath, id)
    const harness = this.dependencies.createHarness({ provider, cwd: workspace.root })
    const cleanupTimer = setTimeout(
      () => {
        void this.dispose(id)
      },
      30 * 60 * 1_000,
    )
    cleanupTimer.unref()
    const record = {
      id,
      provider,
      workspace,
      harness,
      history,
      replayHistory,
      running: false,
      cleanupTimer,
    }
    this.sessions.set(id, record)
    return record
  }

  async create(provider: AgentProvider, postPath: string): Promise<SessionRecord> {
    const now = new Date().toISOString()
    const history: AgentSessionHistory = {
      id: crypto.randomUUID(),
      provider,
      path: postPath,
      createdAt: now,
      updatedAt: now,
      entries: [],
    }
    await this.store.save(history)
    return this.activate(history, false)
  }

  async resume(id: string): Promise<SessionRecord> {
    const active = this.sessions.get(id)
    if (active) {
      return active
    }
    const history = await this.store.get(id)
    if (!history) {
      throw new ContentError("저장된 에이전트 세션을 찾을 수 없습니다.", 404)
    }
    return this.activate(history, true)
  }

  async list(postPath: string) {
    resolveContentPath(repositoryRoot, postPath)
    return this.store.list(postPath)
  }

  async history(id: string): Promise<AgentSessionHistory> {
    const active = this.sessions.get(id)?.history
    const history = active ?? (await this.store.get(id))
    if (!history) {
      throw new ContentError("저장된 에이전트 세션을 찾을 수 없습니다.", 404)
    }
    return history
  }

  get(id: string): SessionRecord {
    const session = this.sessions.get(id)
    if (!session) {
      throw new ContentError("에이전트 세션을 찾을 수 없습니다.", 404)
    }
    return session
  }

  async run(
    id: string,
    instruction: string,
    context: AgentContext | undefined,
    emit: (event: AgentEvent) => void | Promise<void>,
  ): Promise<void> {
    const session = this.get(id)
    if (session.running) {
      throw new ContentError("에이전트가 이미 작업 중입니다.", 409)
    }
    session.running = true
    const emitStored = async (event: AgentEvent): Promise<void> => {
      const at = new Date().toISOString()
      const last = session.history.entries.at(-1)
      if (event.type === "delta" && last?.type === "event" && last.event.type === "delta") {
        last.event.text += event.text
        last.at = at
      } else {
        session.history.entries.push({ type: "event", event, at })
      }
      session.history.updatedAt = at
      if (event.type !== "delta") {
        await this.store.save(session.history)
      }
      await emit(event)
    }
    try {
      const userAt = new Date().toISOString()
      session.history.entries.push({
        type: "user",
        text: instruction,
        ...(context ? { context } : {}),
        at: userAt,
      })
      session.history.updatedAt = userAt
      await this.store.save(session.history)
      const replayEntries = session.replayHistory ? session.history.entries.slice(0, -1) : []
      const source = await Bun.file(join(session.workspace.root, session.workspace.postPath)).text()
      const body = splitMarkdownDocument(source).body
      if (context?.kind === "image") {
        const image = Bun.file(
          join(session.workspace.root, dirname(session.workspace.postPath), context.path),
        )
        if (!(await image.exists())) {
          throw new ContentError("선택한 이미지 파일을 에이전트 작업공간에서 찾을 수 없습니다.")
        }
      }
      const prompt = buildAgentPrompt(
        session.workspace.postPath,
        instruction,
        context,
        bodyLineOffset(source, body),
        replayEntries,
      )
      await emitStored({ type: "status", text: `${session.provider} 작업공간을 준비했습니다.` })
      await session.harness.run(prompt, emitStored)
      session.replayHistory = false
      const proposal = await this.dependencies.readWorkspacePost(session.workspace)
      await emitStored({ type: "proposal", title: proposal.title, body: proposal.body })
      await emitStored({ type: "done" })
    } catch (error: unknown) {
      try {
        await emitAgentFailure(error, emitStored)
      } catch (storageError: unknown) {
        console.error(storageError)
        await emitAgentFailure(error, emit)
      }
    } finally {
      session.running = false
      await this.store.save(session.history)
    }
  }

  async interrupt(id: string): Promise<void> {
    await this.get(id).harness.interrupt()
  }

  async dispose(id: string): Promise<void> {
    const session = this.sessions.get(id)
    if (!session) {
      return
    }
    this.sessions.delete(id)
    clearTimeout(session.cleanupTimer)
    await session.harness.dispose().catch(() => undefined)
    await this.dependencies.cleanupWorkspace(session.workspace)
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.dispose(id)))
  }

  workspacePath(id: string): string {
    return join(this.get(id).workspace.root, this.get(id).workspace.postPath)
  }
}
