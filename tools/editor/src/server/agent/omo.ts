import { ContentError } from "../errors"
import { prepareCommand } from "../process-command"
import { parseHarnessEvent } from "./events"
import type { EmitAgentEvent, Harness } from "./harness"

type JsonObject = Record<string, unknown>

export class OmoCliHarness implements Harness {
  private readonly sessionId = crypto.randomUUID()
  private activeProcess: Bun.ReadableSubprocess | undefined
  private started = false

  constructor(
    private readonly cwd: string,
    private readonly executable: string,
  ) {}

  private command(prompt: string): readonly string[] {
    const sessionArgs = this.started
      ? ["--session", this.sessionId]
      : ["--session-id", this.sessionId]
    return [
      this.executable,
      "-p",
      "--mode",
      "json",
      "--permission-preset",
      "workspace",
      ...sessionArgs,
      prompt,
    ]
  }

  async run(prompt: string, emit: EmitAgentEvent): Promise<void> {
    await emit({ type: "status", text: "로컬 OMO 설정과 스킬을 불러왔습니다." })
    this.activeProcess = Bun.spawn([...prepareCommand(this.command(prompt))], {
      cwd: this.cwd,
      env: process.env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    const stderrText = new Response(this.activeProcess.stderr).text()
    const reader = this.activeProcess.stdout.getReader()
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
        if (!line.trim()) {
          continue
        }
        const event = parseHarnessEvent("omo", JSON.parse(line) as JsonObject)
        if (event) {
          await emit(event)
        }
      }
    }
    const [exitCode, stderr] = await Promise.all([this.activeProcess.exited, stderrText])
    if (exitCode !== 0) {
      throw new ContentError(stderr.trim() || `OMO가 종료 코드 ${exitCode}로 실패했습니다.`)
    }
    this.started = true
  }

  async interrupt(): Promise<void> {
    this.activeProcess?.kill()
  }

  async dispose(): Promise<void> {
    this.activeProcess?.kill()
    if (this.activeProcess) {
      await this.activeProcess.exited
    }
  }
}
