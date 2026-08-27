import type { AgentProvider } from "../../shared/agent-contracts"
import { ContentError } from "../errors"
import {
  type JsonObject,
  objectValue,
  type PendingRequest,
  type RequestId,
  stringValue,
  type TurnWaiter,
} from "./app-server-protocol"
import { parseHarnessEvent } from "./events"
import type { EmitAgentEvent, Harness } from "./harness"

export class CodexAppServerHarness implements Harness {
  private readonly process: Bun.PipedSubprocess
  private readonly pending = new Map<RequestId, PendingRequest>()
  private readonly deltaItems = new Set<string>()
  private requestId = 0
  private threadId: string | undefined
  private turnId: string | undefined
  private skillCount = 0
  private stderrText = ""
  private turnWaiter: TurnWaiter | undefined
  private emit: EmitAgentEvent = () => undefined
  private initialized: Promise<void> | undefined
  private terminalError: Error | undefined

  constructor(
    private readonly provider: Exclude<AgentProvider, "claude">,
    private readonly cwd: string,
    command: readonly string[],
  ) {
    this.process = Bun.spawn([...command], {
      cwd,
      env: process.env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
    void this.readOutput()
    void this.readStderr()
  }

  private write(message: JsonObject): void {
    this.process.stdin.write(`${JSON.stringify(message)}\n`)
    this.process.stdin.flush()
  }

  private request(method: string, params: JsonObject): Promise<JsonObject> {
    if (this.terminalError) {
      return Promise.reject(this.terminalError)
    }
    const id = ++this.requestId
    return new Promise<JsonObject>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} 요청이 30초 안에 응답하지 않았습니다.`))
      }, 30_000)
      timeout.unref()
      this.pending.set(id, { resolve, reject, timeout })
      try {
        this.write({ id, method, params })
      } catch (error: unknown) {
        clearTimeout(timeout)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: { name: "techblog-editor", title: "Tech Blog Editor", version: "0.1.0" },
      capabilities: null,
    })
    this.write({ method: "initialized" })
    const skills = await this.request("skills/list", {
      cwds: [this.cwd],
      forceReload: true,
    })
    const data = Array.isArray(skills["data"]) ? skills["data"] : []
    this.skillCount = data.reduce((total, entry) => {
      const record = objectValue(entry)
      return total + (Array.isArray(record?.["skills"]) ? record["skills"].length : 0)
    }, 0)
  }

  private async readOutput(): Promise<void> {
    const reader = this.process.stdout.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    try {
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
            this.handleMessage(JSON.parse(line) as JsonObject)
          }
        }
      }
      const exitCode = await this.process.exited
      const error = new Error(
        this.stderrText.trim() ||
          `${this.provider} app-server가 예기치 않게 종료됐습니다. (${exitCode})`,
      )
      this.terminalError = error
      this.fail(error)
    } catch (error: unknown) {
      this.fail(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private async readStderr(): Promise<void> {
    const reader = this.process.stderr.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const result = await reader.read()
      if (result.done) {
        break
      }
      this.stderrText += decoder.decode(result.value, { stream: true })
      if (this.stderrText.length > 16_000) {
        this.stderrText = this.stderrText.slice(-16_000)
      }
    }
  }

  private handleMessage(message: JsonObject): void {
    const id = message["id"]
    const method = stringValue(message["method"])
    if ((typeof id === "number" || typeof id === "string") && !method) {
      const pending = this.pending.get(id)
      if (pending) {
        this.pending.delete(id)
        clearTimeout(pending.timeout)
        const error = objectValue(message["error"])
        if (error) {
          pending.reject(new Error(stringValue(error["message"]) ?? "app-server 요청 실패"))
        } else {
          pending.resolve(objectValue(message["result"]) ?? {})
        }
      }
      return
    }
    if ((typeof id === "number" || typeof id === "string") && method?.includes("requestApproval")) {
      void this.emit({ type: "status", text: "격리 작업공간의 도구 실행을 승인했습니다." })
      this.write({ id, result: { decision: "accept" } })
      return
    }
    if (method) {
      this.handleNotification(method, objectValue(message["params"]) ?? {})
    }
  }

  private handleNotification(method: string, params: JsonObject): void {
    if (method === "item/agentMessage/delta") {
      const itemId = stringValue(params["itemId"])
      const delta = stringValue(params["delta"])
      if (itemId) {
        this.deltaItems.add(itemId)
      }
      if (delta) {
        void this.emit({ type: "delta", text: delta })
      }
      return
    }
    if (method === "item/started" || method === "item/completed") {
      const item = objectValue(params["item"])
      const itemId = stringValue(item?.["id"])
      if (method === "item/completed" && itemId && this.deltaItems.has(itemId)) {
        return
      }
      const normalized = parseHarnessEvent(this.provider, {
        type: method === "item/started" ? "item.started" : "item.completed",
        item,
      })
      if (normalized) {
        void this.emit(normalized)
      }
      return
    }
    if (method === "turn/started") {
      const turn = objectValue(params["turn"])
      this.turnId = stringValue(turn?.["id"])
      void this.emit({ type: "status", text: "에이전트가 작업을 시작했습니다." })
      return
    }
    if (method === "turn/completed") {
      const turn = objectValue(params["turn"])
      const status = stringValue(turn?.["status"])
      if (status === "failed") {
        this.turnWaiter?.reject(new Error("에이전트 작업이 실패했습니다."))
      } else {
        void this.emit({ type: "status", text: "작업을 완료했습니다." })
        this.turnWaiter?.resolve()
      }
      this.turnWaiter = undefined
    }
  }

  private fail(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
    this.turnWaiter?.reject(error)
    this.turnWaiter = undefined
  }

  async run(prompt: string, emit: EmitAgentEvent): Promise<void> {
    this.emit = emit
    this.initialized ??= this.initialize()
    await this.initialized
    await emit({
      type: "status",
      text: `로컬 스킬 ${this.skillCount}개를 불러왔습니다.`,
    })
    if (!this.threadId) {
      const response = await this.request("thread/start", {
        cwd: this.cwd,
        ephemeral: true,
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
      })
      const thread = objectValue(response["thread"])
      this.threadId = stringValue(thread?.["id"])
      if (!this.threadId) {
        throw new ContentError("에이전트 thread를 시작하지 못했습니다.")
      }
      await emit({ type: "session", sessionId: this.threadId })
    }
    const completed = new Promise<void>((resolve, reject) => {
      this.turnWaiter = { resolve, reject }
    })
    await this.request("turn/start", {
      threadId: this.threadId,
      input: [{ type: "text", text: prompt, text_elements: [] }],
    })
    await completed
  }

  async interrupt(): Promise<void> {
    if (this.threadId && this.turnId) {
      await this.request("turn/interrupt", {
        threadId: this.threadId,
        turnId: this.turnId,
      }).then(() => undefined)
    }
  }

  async dispose(): Promise<void> {
    this.process.stdin.end()
    this.process.kill()
    await this.process.exited
  }
}
