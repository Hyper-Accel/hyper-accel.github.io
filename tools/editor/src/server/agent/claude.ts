import { type Options, query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { parseHarnessEvent } from "./events"
import type { EmitAgentEvent, Harness } from "./harness"

export class ClaudeHarness implements Harness {
  private sessionId: string | undefined
  private abortController: AbortController | undefined

  constructor(
    private readonly cwd: string,
    private readonly executable: string,
  ) {}

  async run(prompt: string, emit: EmitAgentEvent): Promise<void> {
    this.abortController = new AbortController()
    const options: Options = {
      cwd: this.cwd,
      pathToClaudeCodeExecutable: this.executable,
      settingSources: ["user", "project", "local"],
      includePartialMessages: true,
      includeHookEvents: true,
      permissionMode: "default",
      sandbox: {
        enabled: true,
        failIfUnavailable: true,
        autoAllowBashIfSandboxed: true,
        allowUnsandboxedCommands: false,
      },
      abortController: this.abortController,
      canUseTool: async (_toolName, _input, context) => ({
        behavior: "allow",
        toolUseID: context.toolUseID,
        decisionClassification: "user_temporary",
      }),
      ...(this.sessionId ? { resume: this.sessionId } : {}),
    }
    const stream = query({ prompt, options })
    for await (const message of stream) {
      const event = message as SDKMessage & Record<string, unknown>
      if (event["type"] === "system" && event["subtype"] === "init") {
        const sessionId = event["session_id"]
        if (typeof sessionId === "string") {
          this.sessionId = sessionId
        }
        const skills = Array.isArray(event["skills"]) ? event["skills"] : []
        await emit({ type: "status", text: `로컬 스킬 ${skills.length}개를 불러왔습니다.` })
      }
      const normalized = parseHarnessEvent("claude", event)
      if (normalized) {
        await emit(normalized)
      }
    }
  }

  async interrupt(): Promise<void> {
    this.abortController?.abort()
  }

  async dispose(): Promise<void> {
    this.abortController?.abort()
  }
}
