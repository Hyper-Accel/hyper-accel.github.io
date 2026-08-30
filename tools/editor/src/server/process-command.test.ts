import { describe, expect, test } from "bun:test"
import { Buffer } from "node:buffer"
import { basename } from "node:path"
import { prepareCommand } from "./process-command"

describe("prepareCommand", () => {
  test("resolves native executables without a shell", () => {
    const command = prepareCommand(
      ["git", "--version"],
      "win32",
      () => "C:\\Program Files\\Git\\cmd\\git.exe",
    )

    expect(command).toEqual(["C:\\Program Files\\Git\\cmd\\git.exe", "--version"])
  })

  test("wraps Windows command shims without interpolating their arguments", () => {
    const command = prepareCommand(
      ["omo", "prompt with %PATH% & metacharacters"],
      "win32",
      () => "C:\\Users\\writer\\AppData\\Roaming\\npm\\omo.cmd",
    )

    expect(basename(command[0] ?? "").toLowerCase()).toBe("powershell.exe")
    const wrapperIndex = command.indexOf("-File") + 1
    expect(basename(command[wrapperIndex] ?? "")).toBe("run-command.ps1")
    expect(command[wrapperIndex + 1]).toBe("-Payload")
    expect(JSON.parse(Buffer.from(command.at(-1) ?? "", "base64").toString("utf8"))).toEqual([
      "C:\\Users\\writer\\AppData\\Roaming\\npm\\omo.cmd",
      "prompt with %PATH% & metacharacters",
    ])
  })

  test("keeps POSIX commands as argument arrays", () => {
    expect(prepareCommand(["git", "status"], "linux", () => "/usr/bin/git")).toEqual([
      "/usr/bin/git",
      "status",
    ])
  })
})
