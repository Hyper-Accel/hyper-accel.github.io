import { describe, expect, test } from "bun:test"
import { buildAgentPrompt } from "./prompt"

const postPath = "content/posts/example/index.md"

describe("buildAgentPrompt", () => {
  test("includes the selected file, absolute line range, and text", () => {
    const prompt = buildAgentPrompt(
      postPath,
      "더 자연스럽게 고쳐줘",
      {
        kind: "text",
        text: "선택한 문장",
        startLine: 3,
        endLine: 4,
      },
      8,
    )

    expect(prompt).toContain(`${postPath}:L11-L12`)
    expect(prompt).toContain("<selected_text>\n선택한 문장\n</selected_text>")
    expect(prompt).toContain("사용자 요청: 더 자연스럽게 고쳐줘")
  })

  test("attaches the selected image as a workspace file", () => {
    const prompt = buildAgentPrompt(
      postPath,
      "그림 설명을 보완해줘",
      { kind: "image", path: "images/architecture.png" },
      8,
    )

    expect(prompt).toContain("선택 이미지 파일: content/posts/example/images/architecture.png")
    expect(prompt).toContain("이미지 도구로 직접 열어")
  })

  test("replays chronological conversation context when resuming", () => {
    const prompt = buildAgentPrompt(postPath, "그 수정에서 제목도 바꿔줘", undefined, 0, [
      {
        type: "user",
        text: "도입부를 다듬어줘",
        at: "2026-08-27T10:00:00.000Z",
      },
      {
        type: "event",
        event: { type: "message", text: "도입부를 수정했습니다." },
        at: "2026-08-27T10:00:01.000Z",
      },
      {
        type: "event",
        event: { type: "tool", label: "Read: index.md", status: "completed" },
        at: "2026-08-27T10:00:02.000Z",
      },
    ])

    expect(prompt).toContain("이전 대화 기록")
    expect(prompt).toContain("[사용자]\n도입부를 다듬어줘")
    expect(prompt).toContain("[도우미]\n도입부를 수정했습니다.")
    expect(prompt).toContain("[도구]\n완료: Read: index.md")
    expect(prompt.indexOf("[사용자]")).toBeLessThan(prompt.indexOf("[도우미]"))
    expect(prompt).toContain("사용자 요청: 그 수정에서 제목도 바꿔줘")
  })
})
