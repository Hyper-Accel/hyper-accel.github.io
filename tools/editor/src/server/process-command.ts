import { Buffer } from "node:buffer"
import { existsSync } from "node:fs"
import { extname, isAbsolute, join, resolve } from "node:path"

type CommandResolver = (executable: string) => string | null

function resolveExecutable(executable: string, which: CommandResolver): string {
  return isAbsolute(executable) ? executable : (which(executable) ?? executable)
}

function windowsPowerShellPath(): string {
  const systemRoot = process.env["SystemRoot"] ?? "C:\\Windows"
  return join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
}

function windowsScriptCommand(command: readonly string[]): string[] {
  const sourceWrapper = resolve(import.meta.dir, "../../bin/run-command.ps1")
  const bundledWrapper = resolve(import.meta.dir, "../bin/run-command.ps1")
  const wrapper = [sourceWrapper, bundledWrapper].find(existsSync) ?? sourceWrapper
  const payload = Buffer.from(JSON.stringify(command), "utf8").toString("base64")
  return [
    windowsPowerShellPath(),
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    wrapper,
    "-Payload",
    payload,
  ]
}

export function prepareCommand(
  command: readonly string[],
  platform: NodeJS.Platform = process.platform,
  which: CommandResolver = Bun.which,
): string[] {
  const [requestedExecutable, ...args] = command
  if (!requestedExecutable) {
    throw new TypeError("실행할 명령이 비어 있습니다.")
  }
  const executable = resolveExecutable(requestedExecutable, which)
  const resolved = [executable, ...args]
  if (platform === "win32" && [".bat", ".cmd"].includes(extname(executable).toLowerCase())) {
    return windowsScriptCommand(resolved)
  }
  return resolved
}
