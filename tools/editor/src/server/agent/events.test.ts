import { describe, expect, test } from "bun:test"
import { parseHarnessEvent } from "./events"

describe("parseHarnessEvent", () => {
  test("normalizes Codex thread, message, command, and completion events", () => {
    expect(parseHarnessEvent("codex", { type: "thread.started", thread_id: "thread-1" })).toEqual({
      type: "session",
      sessionId: "thread-1",
    })
    expect(
      parseHarnessEvent("codex", {
        type: "item.completed",
        item: { type: "agent_message", text: "완료했습니다." },
      }),
    ).toEqual({ type: "message", text: "완료했습니다." })
    expect(
      parseHarnessEvent("codex", {
        type: "item.started",
        item: { type: "command_execution", command: "hugo --quiet" },
      }),
    ).toEqual({ type: "tool", label: "hugo --quiet", status: "running" })
    expect(parseHarnessEvent("codex", { type: "turn.completed" })).toEqual({
      type: "status",
      text: "작업을 완료했습니다.",
    })
  })

  test("normalizes OMO text deltas and session events", () => {
    expect(parseHarnessEvent("omo", { type: "session", id: "omo-1" })).toEqual({
      type: "session",
      sessionId: "omo-1",
    })
    expect(
      parseHarnessEvent("omo", {
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "수정 중" },
      }),
    ).toEqual({ type: "delta", text: "수정 중" })
  })

  test("normalizes Claude stream and tool events", () => {
    expect(
      parseHarnessEvent("claude", {
        type: "system",
        subtype: "init",
        session_id: "claude-1",
      }),
    ).toEqual({ type: "session", sessionId: "claude-1" })
    expect(
      parseHarnessEvent("claude", {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "제안" },
        },
      }),
    ).toEqual({ type: "delta", text: "제안" })
    expect(
      parseHarnessEvent("claude", {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Edit", input: { file_path: "index.md" } }],
        },
      }),
    ).toEqual({ type: "tool", label: "Edit · index.md", status: "running" })
  })
})
