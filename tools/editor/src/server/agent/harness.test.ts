import { describe, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { basename, extname } from "node:path"
import { buildHarnessCommand } from "./harness"

describe("buildHarnessCommand", () => {
  test("uses the local Codex app server and OMO CLI", () => {
    expect(
      buildHarnessCommand({
        provider: "codex",
        cwd: tmpdir(),
      }),
    ).toEqual(["codex", "app-server"])
    expect(
      buildHarnessCommand({
        provider: "omo",
        cwd: tmpdir(),
      }),
    ).toEqual(["omo"])
  })

  test("uses the locally installed Claude executable", () => {
    const command = buildHarnessCommand({
      provider: "claude",
      cwd: tmpdir(),
    })
    expect(command).toHaveLength(1)
    const executable = command[0] ?? ""
    expect(basename(executable, extname(executable))).toBe("claude")
  })
})
