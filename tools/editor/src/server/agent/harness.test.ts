import { describe, expect, test } from "bun:test"
import { buildHarnessCommand } from "./harness"

describe("buildHarnessCommand", () => {
  test("uses the local Codex app server and OMO CLI", () => {
    expect(
      buildHarnessCommand({
        provider: "codex",
        cwd: "/tmp/worktree",
      }),
    ).toEqual(["codex", "app-server"])
    expect(
      buildHarnessCommand({
        provider: "omo",
        cwd: "/tmp/worktree",
      }),
    ).toEqual(["omo"])
  })

  test("uses the locally installed Claude executable", () => {
    const command = buildHarnessCommand({
      provider: "claude",
      cwd: "/tmp/worktree",
    })
    expect(command).toHaveLength(1)
    expect(command[0]?.endsWith("claude")).toBe(true)
  })
})
