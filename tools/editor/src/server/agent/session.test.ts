import { describe, expect, test } from "bun:test"
import type { AgentEvent } from "../../shared/agent-contracts"
import { emitAgentFailure } from "./session"

describe("emitAgentFailure", () => {
  test("ends a failed stream after reporting the error", async () => {
    const events: AgentEvent[] = []

    await emitAgentFailure(new Error("실패"), (event) => {
      events.push(event)
    })

    expect(events.map((event) => event.type)).toEqual(["error", "done"])
  })
})
