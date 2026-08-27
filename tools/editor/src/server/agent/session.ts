import { dirname, join } from "node:path"
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
    private readonly store = new AgentSessionStore(
      Bun.env["TECHBLOG_EDITOR_SESSION_DIR"] ??
        join(repositoryRoot, ".git", "techblog-editor", "sessions"),
    ),
  ) {}

  async listProviders() {
    return detectAgentProviders()
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
    const workspace = await createAgentWorkspace(repositoryRoot, postPath, id)
    const harness = createHarness({ provider, cwd: workspace.root })
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
    session.replayHistory = false
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
      await emitStored({ type: "status", text: `${session.provider} 작업공간을 준비했습니다.` })
      await session.harness.run(prompt, emitStored)
      const proposal = await readWorkspacePost(session.workspace)
      await emitStored({ type: "proposal", title: proposal.title, body: proposal.body })
      await emitStored({ type: "done" })
    } catch (error: unknown) {
      await emitAgentFailure(error, emitStored)
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
    await cleanupAgentWorkspace(session.workspace)
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.dispose(id)))
  }

  workspacePath(id: string): string {
    return join(this.get(id).workspace.root, this.get(id).workspace.postPath)
  }
}
