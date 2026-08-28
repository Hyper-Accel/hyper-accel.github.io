import type { AgentEvent, AgentProvider } from "../../shared/agent-contracts"
import { CodexAppServerHarness } from "./app-server"
import { ClaudeHarness } from "./claude"
import { OmoCliHarness } from "./omo"

export type EmitAgentEvent = (event: AgentEvent) => void | Promise<void>

export interface Harness {
  run(prompt: string, emit: EmitAgentEvent): Promise<void>
  interrupt(): Promise<void>
  dispose(): Promise<void>
}

export type HarnessOptions = {
  readonly provider: AgentProvider
  readonly cwd: string
}

export function buildHarnessCommand(options: HarnessOptions): readonly string[] {
  switch (options.provider) {
    case "codex":
      return ["codex", "app-server"]
    case "omo":
      return ["omo"]
    case "claude":
      return [Bun.which("claude") ?? "claude"]
  }
}

export function createHarness(options: HarnessOptions): Harness {
  const command = buildHarnessCommand(options)
  if (options.provider === "claude") {
    return new ClaudeHarness(options.cwd, command[0] ?? "claude")
  }
  if (options.provider === "omo") {
    return new OmoCliHarness(options.cwd, command[0] ?? "omo")
  }
  return new CodexAppServerHarness("codex", options.cwd, command)
}

export async function detectAgentProviders(): Promise<
  readonly {
    readonly id: AgentProvider
    readonly label: string
    readonly available: boolean
    readonly version: string | null
  }[]
> {
  const definitions = [
    { id: "codex" as const, label: "Codex", binary: "codex" },
    { id: "claude" as const, label: "Claude", binary: "claude" },
    { id: "omo" as const, label: "OMO", binary: "omo" },
  ]
  return Promise.all(
    definitions.map(async (definition) => {
      const executable = Bun.which(definition.binary)
      if (!executable) {
        return { id: definition.id, label: definition.label, available: false, version: null }
      }
      const process = Bun.spawn([executable, "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      })
      const [exitCode, stdout] = await Promise.all([
        process.exited,
        new Response(process.stdout).text(),
      ])
      return {
        id: definition.id,
        label: definition.label,
        available: exitCode === 0,
        version: exitCode === 0 ? (stdout.trim().split("\n")[0] ?? null) : null,
      }
    }),
  )
}
