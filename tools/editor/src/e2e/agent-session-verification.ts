import { join } from "node:path"
import type { Browser } from "playwright"
import {
  type AgentRouteState,
  artifactDirectory,
  installAgentRoutes,
  openFixture,
  sessionId,
} from "./agent-ui-fixture"
import { verifyTimeline } from "./agent-ui-verification"

export async function verifySessionHistory(
  browser: Browser,
  state: AgentRouteState,
): Promise<void> {
  if (!state.history) {
    throw new Error("제공자 목록 지연 검증에 사용할 세션 기록이 없습니다.")
  }
  state.history = { ...state.history, provider: "omo" }
  let releaseProviders: () => void = () => undefined
  state.providerGate = new Promise<void>((resolve) => {
    releaseProviders = resolve
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  try {
    await installAgentRoutes(page, state)
    await openFixture(page)
    await page.locator("#agent-tab").click()
    const sessionOption = page.locator(`#agent-session option[value="${sessionId}"]`)
    await sessionOption.waitFor({ state: "attached" })
    const sessionLabel = await sessionOption.textContent()
    if (!sessionLabel?.startsWith("문장을 자연스럽게 다듬어 주세요.")) {
      throw new Error(`대화 기록에서 요청 미리보기가 먼저 보이지 않습니다: ${sessionLabel}`)
    }
    await page.locator("#agent-session").selectOption(sessionId)
    if ((await page.locator(".agent-message--user").count()) !== 0) {
      throw new Error("제공자 목록이 준비되기 전에 세션 기록을 복원했습니다.")
    }
    releaseProviders()
    delete state.providerGate
    await page.locator(".agent-message--user").waitFor()
    if ((await page.locator("#agent-provider").inputValue()) !== "omo") {
      throw new Error("지연된 제공자 목록에서 저장 세션의 에이전트를 복원하지 못했습니다.")
    }
    await verifyTimeline(page)
    if (
      (await page.locator(".agent-proposal-open").count()) !== 1 ||
      (await page.locator("#merge-workspace").isVisible())
    ) {
      throw new Error("저장된 수정 제안을 조용히 불러오거나 다시 열 수 없습니다.")
    }
    if (
      (await page.locator("#agent-thread").getAttribute("role")) !== "log" ||
      (await page.locator("#agent-thread").getAttribute("tabindex")) !== "0" ||
      (await page.locator("#agent-thread").getAttribute("aria-live")) !== "off"
    ) {
      throw new Error("복원된 대화 기록의 키보드 탐색 또는 라이브 영역 상태가 올바르지 않습니다.")
    }
    await page.locator(".agent-proposal-open").click()
    await page.locator("#merge-workspace").waitFor()
    await page.locator("#merge-close").click()
    await page.locator("#agent-new-session").click()
    await page.locator("#agent-empty").waitFor()
    if (
      (await page.locator("#agent-session").inputValue()) !== "" ||
      (await page.locator(".agent-message--user").count()) !== 0
    ) {
      throw new Error("새 대화 전환 뒤 과거 세션 선택이나 메시지가 남아 있습니다.")
    }
    await page.locator("#agent-session").selectOption(sessionId)
    await page.locator(".agent-message--user").waitFor()
    await page.screenshot({
      path: join(artifactDirectory, "session-history-1280.png"),
      fullPage: true,
    })
    await page.locator("#agent-prompt").fill("이어서 제목도 다듬어 주세요.")
    await page.locator("#agent-send").click()
    await page.locator("#merge-workspace").waitFor()
    if (state.resumeCount !== 1 || state.requests.length !== 2) {
      throw new Error(`저장 세션 이어하기 요청이 올바르지 않습니다: ${JSON.stringify(state)}`)
    }
    await page.locator("#merge-close").click()
    await page.locator("#agent-new-session").click()
    await page.locator("#agent-session").selectOption(sessionId)
    await page.locator(".agent-message--user").nth(1).waitFor()
    const restoredRoles = await page
      .locator(".agent-message")
      .evaluateAll((messages) =>
        messages.map((message) =>
          message.classList.contains("agent-message--user")
            ? "user"
            : message.classList.contains("agent-message--tool")
              ? "tool"
              : "assistant",
        ),
      )
    const turnRoles = ["user", "tool", "assistant", "tool", "assistant", "assistant", "tool"]
    if (JSON.stringify(restoredRoles) !== JSON.stringify([...turnRoles, ...turnRoles])) {
      throw new Error(`다중 턴 기록 순서가 깨졌습니다: ${JSON.stringify(restoredRoles)}`)
    }
    if (!state.history) {
      throw new Error("다중 턴 경계 검증에 사용할 세션 기록이 없습니다.")
    }
    state.history = {
      ...state.history,
      entries: [
        { type: "user", text: "첫 요청", at: "2026-08-27T03:00:00.000Z" },
        {
          type: "event",
          event: { type: "delta", text: "첫 답변" },
          at: "2026-08-27T03:00:01.000Z",
        },
        { type: "user", text: "둘째 요청", at: "2026-08-27T03:01:00.000Z" },
        {
          type: "event",
          event: { type: "delta", text: "둘째 답변" },
          at: "2026-08-27T03:01:01.000Z",
        },
      ],
    }
    await page.locator("#agent-new-session").click()
    await page.locator("#agent-session").selectOption(sessionId)
    await page.locator(".agent-message--user").nth(1).waitFor()
    const boundaryText = await page
      .locator(".agent-message")
      .evaluateAll((messages) => messages.map((message) => message.textContent?.trim()))
    if (
      JSON.stringify(boundaryText) !==
      JSON.stringify(["첫 요청", "첫 답변", "둘째 요청", "둘째 답변"])
    ) {
      throw new Error(
        `연속 delta 세션의 사용자 턴 경계가 깨졌습니다: ${JSON.stringify(boundaryText)}`,
      )
    }
    await page.locator("#agent-provider").selectOption("claude")
    await page.getByText("에이전트를 바꿔 새 대화를 시작했습니다.").waitFor()
    if (
      (await page.locator("#agent-session").inputValue()) !== "" ||
      !(await page.locator("#agent-empty").isVisible())
    ) {
      throw new Error("에이전트 변경 뒤 새 대화 상태와 안내가 표시되지 않았습니다.")
    }
    await page.locator("#agent-session").selectOption(sessionId)
    await page.locator(".agent-message--user").nth(1).waitFor()
    state.resumeError = "저장된 에이전트를 실행할 수 없습니다."
    await page.locator("#agent-prompt").fill("실패를 알려 주세요.")
    await page.locator("#agent-send").click()
    await page.getByText(state.resumeError).waitFor()
    if (
      (await page.locator("#agent-prompt").inputValue()) !== "실패를 알려 주세요." ||
      (await page.locator("#agent-send").isDisabled())
    ) {
      throw new Error("세션 재개 실패 뒤 요청 입력과 전송 상태가 복구되지 않았습니다.")
    }
  } finally {
    await page.close()
  }
}
