import { describe, expect, test } from "bun:test"
import { AgentTimeline, type TimelineTarget } from "./agent-timeline"

type FakeTarget = TimelineTarget & { readonly role: string }

describe("AgentTimeline", () => {
  test("keeps assistant segments around a tool call in event order", () => {
    const targets: FakeTarget[] = []
    const timeline = new AgentTimeline((role) => {
      const target: FakeTarget = { role, innerHTML: "", textContent: "" }
      targets.push(target)
      return target
    })

    timeline.appendDelta("첫 **답변**")
    timeline.appendTool("완료: Read index.md")
    timeline.appendDelta("두 번째 답변")

    expect(targets.map((target) => target.role)).toEqual(["assistant", "tool", "assistant"])
    expect(targets[0]?.innerHTML).toContain("<strong>답변</strong>")
    expect(targets[1]?.textContent).toBe("완료: Read index.md")
    expect(targets[2]?.innerHTML).toContain("두 번째 답변")
  })

  test("renders each complete assistant message as a new timeline item", () => {
    const roles: string[] = []
    const timeline = new AgentTimeline((role) => {
      roles.push(role)
      return { innerHTML: "", textContent: "" }
    })

    timeline.appendMessage("첫 답변")
    timeline.appendMessage("두 번째 답변")

    expect(roles).toEqual(["assistant", "assistant"])
  })
})
