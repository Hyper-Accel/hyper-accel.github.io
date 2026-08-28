import { mkdir, readdir, rename } from "node:fs/promises"
import { join } from "node:path"
import {
  type AgentSessionHistory,
  type AgentSessionSummary,
  agentSessionHistorySchema,
} from "../../shared/agent-contracts"

type SessionWriter = (path: string, content: string) => Promise<unknown>

function summaryOf(session: AgentSessionHistory): AgentSessionSummary {
  const preview = session.entries.find((entry) => entry.type === "user")?.text.trim() || "새 대화"
  return {
    id: session.id,
    provider: session.provider,
    path: session.path,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    preview,
    entryCount: session.entries.length,
  }
}

export class AgentSessionStore {
  private readonly writes = new Map<string, Promise<void>>()

  constructor(
    private readonly directory: string,
    private readonly writeFile: SessionWriter = (path, content) => Bun.write(path, content),
  ) {}

  private filePath(id: string): string {
    return join(this.directory, `${id}.json`)
  }

  async save(value: AgentSessionHistory): Promise<void> {
    const session = agentSessionHistorySchema.parse(value)
    const previous = this.writes.get(session.id) ?? Promise.resolve()
    const next = previous.then(
      () => this.write(session),
      () => this.write(session),
    )
    this.writes.set(session.id, next)
    try {
      await next
    } finally {
      if (this.writes.get(session.id) === next) {
        this.writes.delete(session.id)
      }
    }
  }

  private async write(session: AgentSessionHistory): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const temporary = join(this.directory, `${session.id}.${crypto.randomUUID()}.tmp`)
    await this.writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`)
    await rename(temporary, this.filePath(session.id))
  }

  async get(id: string): Promise<AgentSessionHistory | undefined> {
    const file = Bun.file(this.filePath(id))
    if (!(await file.exists())) {
      return undefined
    }
    return agentSessionHistorySchema.parse(await file.json())
  }

  async list(postPath: string): Promise<readonly AgentSessionSummary[]> {
    let names: string[]
    try {
      names = (await readdir(this.directory)).filter((name) => name.endsWith(".json"))
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return []
      }
      throw error
    }
    const sessions = await Promise.all(
      names.map(async (name) => {
        try {
          return agentSessionHistorySchema.parse(await Bun.file(join(this.directory, name)).json())
        } catch (error: unknown) {
          console.warn(`세션 기록을 읽지 못했습니다: ${name}`, error)
          return undefined
        }
      }),
    )
    return sessions
      .filter((session): session is AgentSessionHistory => session?.path === postPath)
      .map(summaryOf)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }
}
