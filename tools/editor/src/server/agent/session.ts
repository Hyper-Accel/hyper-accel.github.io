import { join } from "node:path"
import type { AgentEvent, AgentProvider } from "../../shared/agent-contracts"
import { repositoryRoot, resolveContentPath } from "../content"
import { ContentError } from "../errors"
import { createHarness, detectAgentProviders, type Harness } from "./harness"
import {
  type AgentWorkspace,
  cleanupAgentWorkspace,
  createAgentWorkspace,
  readWorkspacePost,
  workspacePostLabel,
} from "./workspace"

type SessionRecord = {
  readonly id: string
  readonly provider: AgentProvider
  readonly workspace: AgentWorkspace
  readonly harness: Harness
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

  async listProviders() {
    return detectAgentProviders()
  }

  async create(provider: AgentProvider, postPath: string): Promise<SessionRecord> {
    resolveContentPath(repositoryRoot, postPath)
    const providers = await this.listProviders()
    if (!providers.find((candidate) => candidate.id === provider)?.available) {
      throw new ContentError(`${provider} 실행 파일을 찾을 수 없습니다.`)
    }
    const id = crypto.randomUUID()
    const workspace = await createAgentWorkspace(repositoryRoot, postPath, id)
    const harness = createHarness({ provider, cwd: workspace.root })
    const cleanupTimer = setTimeout(
      () => {
        void this.dispose(id)
      },
      30 * 60 * 1_000,
    )
    cleanupTimer.unref()
    const record = { id, provider, workspace, harness, running: false, cleanupTimer }
    this.sessions.set(id, record)
    return record
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
    emit: (event: AgentEvent) => void | Promise<void>,
  ): Promise<void> {
    const session = this.get(id)
    if (session.running) {
      throw new ContentError("에이전트가 이미 작업 중입니다.", 409)
    }
    session.running = true
    const target = workspacePostLabel(session.workspace)
    const prompt = [
      `현재 작업공간은 Tech Blog Editor가 만든 격리 Git worktree입니다.`,
      `수정 대상 글은 ${target} 입니다.`,
      "사용자의 로컬 설정, 스킬, MCP와 도구를 평소처럼 사용하세요.",
      "요청을 완료하기 위해 파일을 직접 수정하되 git commit은 만들지 마세요.",
      "대상 글과 관련 없는 파일은 수정하지 마세요.",
      "",
      `사용자 요청: ${instruction}`,
    ].join("\n")
    try {
      await emit({ type: "status", text: `${session.provider} 작업공간을 준비했습니다.` })
      await session.harness.run(prompt, emit)
      const proposal = await readWorkspacePost(session.workspace)
      await emit({ type: "proposal", title: proposal.title, body: proposal.body })
      await emit({ type: "done" })
    } catch (error: unknown) {
      await emitAgentFailure(error, emit)
    } finally {
      session.running = false
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
