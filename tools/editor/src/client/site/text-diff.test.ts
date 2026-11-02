import { describe, expect, test } from "bun:test"
import { diffLines, diffTokens } from "./text-diff"

describe("text diff", () => {
  test("keeps common tokens and marks the rest", () => {
    expect(diffTokens(["a", "b", "c"], ["a", "x", "c"])).toEqual([
      { type: "same", value: "a" },
      { type: "del", value: "b" },
      { type: "add", value: "x" },
      { type: "same", value: "c" },
    ])
  })

  test("pairs a changed line and marks only the differing word", () => {
    const lines = diffLines("intro\nRemote edit here", "intro\nLocal edit here")
    expect(lines.map((line) => line.type)).toEqual(["same", "del", "add"])
    expect(lines[1]?.parts.filter((part) => part.type === "del")).toEqual([
      { type: "del", value: "Remote" },
    ])
    expect(lines[2]?.parts.filter((part) => part.type === "add")).toEqual([
      { type: "add", value: "Local" },
    ])
  })

  test("marks a run of changed words, spaces included, as one piece", () => {
    const [, added] = diffLines("a b", "a b x y z")
    expect(added?.parts.filter((part) => part.type === "add")).toEqual([
      { type: "add", value: " x y z" },
    ])
  })

  test("keeps added and removed lines whole when they have no partner", () => {
    const lines = diffLines("a\nb", "a\nb\nc\nd")
    expect(lines.map((line) => [line.type, line.parts.map((part) => part.value).join("")])).toEqual(
      [
        ["same", "a"],
        ["same", "b"],
        ["add", "c"],
        ["add", "d"],
      ],
    )
  })
})
