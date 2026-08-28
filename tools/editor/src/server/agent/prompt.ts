import { dirname, join } from "node:path/posix"
import type { AgentContext, AgentHistoryEntry } from "../../shared/agent-contracts"

function contextLines(
  postPath: string,
  context: AgentContext | undefined,
  bodyLineOffset: number,
): readonly string[] {
  if (!context) {
    return []
  }
  if (context.kind === "image") {
    return [
      "",
      "사용자가 편집기에서 선택한 이미지가 작업공간에 첨부되었습니다.",
      `선택 이미지 파일: ${join(dirname(postPath), context.path)}`,
      "이 파일을 이미지 도구로 직접 열어 요청의 문맥으로 사용하세요.",
    ]
  }
  const startLine = bodyLineOffset + context.startLine
  const endLine = bodyLineOffset + context.endLine
  const lineReference =
    startLine === endLine ? `${postPath}:L${startLine}` : `${postPath}:L${startLine}-L${endLine}`
  return [
    "",
    "사용자가 편집기에서 다음 부분을 선택했습니다.",
    `선택 위치: ${lineReference}`,
    "<selected_text>",
    context.text,
    "</selected_text>",
    "위 선택 영역을 우선 문맥으로 사용하되, 요청에 필요하면 글 전체도 확인하세요.",
  ]
}

export function bodyLineOffset(source: string, body: string): number {
  const prefixLength = source.length - body.length
  return (source.slice(0, prefixLength).match(/\n/g) ?? []).length
}

function historyLines(entries: readonly AgentHistoryEntry[]): readonly string[] {
  const lines: string[] = []
  for (const entry of entries.slice(-40)) {
    if (entry.type === "user") {
      lines.push("[사용자]", entry.text.slice(0, 8_000))
      continue
    }
    const event = entry.event
    switch (event.type) {
      case "delta":
      case "message":
        lines.push("[도우미]", event.text.slice(0, 8_000))
        break
      case "tool":
        lines.push("[도구]", `${event.status === "running" ? "실행 중" : "완료"}: ${event.label}`)
        break
      case "status":
        lines.push("[상태]", event.text)
        break
      case "error":
        lines.push("[오류]", event.message)
        break
      case "proposal":
        lines.push("[수정 제안]", event.title)
        break
      case "session":
      case "done":
        break
    }
  }
  return lines.length > 0
    ? ["", "이전 대화 기록은 다음과 같습니다.", ...lines, "이전 대화 기록 끝."]
    : []
}

export function buildAgentPrompt(
  postPath: string,
  instruction: string,
  context?: AgentContext,
  lineOffset = 0,
  history: readonly AgentHistoryEntry[] = [],
): string {
  return [
    "현재 작업공간은 Tech Blog Editor가 만든 격리 Git worktree입니다.",
    `수정 대상 글은 ${postPath} 입니다.`,
    "사용자의 로컬 설정, 스킬, MCP와 도구를 평소처럼 사용하세요.",
    "요청을 완료하기 위해 파일을 직접 수정하되 git commit은 만들지 마세요.",
    "대상 글과 관련 없는 파일은 수정하지 마세요.",
    ...historyLines(history),
    ...contextLines(postPath, context, lineOffset),
    "",
    `사용자 요청: ${instruction}`,
  ].join("\n")
}
