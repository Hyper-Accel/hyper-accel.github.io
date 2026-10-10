import { join } from "node:path"
import type { Page } from "playwright"

export async function verifyTimeline(page: Page): Promise<void> {
  const messages = page.locator("#agent-thread > .agent-message")
  const roles = await messages.evaluateAll((elements) =>
    elements.map((element) => {
      if (element.classList.contains("agent-message--assistant")) {
        return "assistant"
      }
      if (element.classList.contains("agent-message--tool")) {
        return "tool"
      }
      return "user"
    }),
  )
  const expected = ["user", "tool", "assistant", "tool", "assistant", "assistant", "tool"]
  if (JSON.stringify(roles) !== JSON.stringify(expected)) {
    throw new Error(`에이전트 이벤트 순서가 다릅니다: ${JSON.stringify(roles)}`)
  }
  const assistants = page.locator(".agent-message--assistant")
  if (
    (await assistants.nth(0).locator("strong").textContent()) !== "핵심" ||
    !(await assistants.nth(1).textContent())?.includes("두 번째 답변") ||
    !(await assistants.nth(2).locator("strong").textContent())?.includes("완료 메시지")
  ) {
    throw new Error("Markdown 답변이 조각별로 렌더링되지 않았습니다.")
  }
  const contextOpacity = await page
    .locator(".agent-message-context")
    .evaluate((context) => getComputedStyle(context).opacity)
  if (contextOpacity !== "1") {
    throw new Error(`선택 문맥의 대비가 낮습니다: opacity ${contextOpacity}`)
  }
}

export async function verifyAgentPanel(page: Page): Promise<void> {
  const [railBox, composerBox, emptyVisible, cancelVisible, sessionAccessibility] =
    await Promise.all([
      page.locator("#post-rail").boundingBox(),
      page.locator("#agent-form").boundingBox(),
      page.locator("#agent-empty").isVisible(),
      page.locator("#agent-cancel").isVisible(),
      page.locator("#agent-session").ariaSnapshot(),
    ])
  if (!railBox || !composerBox || composerBox.y + composerBox.height > railBox.y + railBox.height) {
    throw new Error("에이전트 입력창이 왼쪽 패널 아래에서 잘립니다.")
  }
  if (!emptyVisible || cancelVisible) {
    throw new Error("대기 상태에서 빈 안내 또는 중단 버튼의 표시 상태가 올바르지 않습니다.")
  }
  if (!sessionAccessibility.includes('combobox "대화 기록"')) {
    throw new Error("대화 기록의 접근성 이름이 화면 레이블과 일치하지 않습니다.")
  }
  const contextRemove = page.locator("#agent-context-remove")
  await page.locator("#agent-prompt").focus()
  await page.keyboard.press("Shift+Tab")
  const [contextOpacity, focusOutline, isKeyboardFocused] = await Promise.all([
    page.locator(".agent-message-context").count(),
    contextRemove.evaluate((button) => getComputedStyle(button).outlineStyle),
    contextRemove.evaluate(
      (button) => document.activeElement === button && button.matches(":focus-visible"),
    ),
  ])
  if (contextOpacity !== 0 || focusOutline === "none" || !isKeyboardFocused) {
    throw new Error("첨부 문맥 제거 버튼의 키보드 포커스가 보이지 않습니다.")
  }
}

export async function verifyResponsiveMerge(page: Page, artifactDirectory: string): Promise<void> {
  await page.screenshot({
    path: join(artifactDirectory, "merge-1280.png"),
    fullPage: true,
  })
  const railSettled = page.locator("#post-rail").evaluate(
    (rail) =>
      new Promise<void>((resolveTransition, rejectTransition) => {
        const timeout = AbortSignal.timeout(1_000)
        rail.addEventListener("transitionend", () => resolveTransition(), { once: true })
        timeout.addEventListener(
          "abort",
          () => {
            if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
              resolveTransition()
            } else {
              rejectTransition(new Error("글 목록 닫힘 전환이 완료되지 않았습니다."))
            }
          },
          { once: true },
        )
      }),
  )
  await page.setViewportSize({ width: 768, height: 900 })
  await railSettled
  const tabletWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  if (tabletWidth > 768) {
    const overflow = await page.locator("body *").evaluateAll((elements) =>
      elements
        .map((element) => {
          const box = element.getBoundingClientRect()
          return { tag: element.tagName, className: element.className, right: box.right }
        })
        .filter((element) => element.right > window.innerWidth)
        .slice(0, 8),
    )
    throw new Error(
      `태블릿 병합 화면이 ${tabletWidth - 768}px 가로로 넘칩니다: ${JSON.stringify(overflow)}`,
    )
  }
  await page.screenshot({
    path: join(artifactDirectory, "merge-768.png"),
    fullPage: true,
  })
  await page.setViewportSize({ width: 375, height: 812 })
  const mobileWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  if (mobileWidth > 375) {
    throw new Error(`모바일 병합 화면이 ${mobileWidth - 375}px 가로로 넘칩니다.`)
  }
  const changeRow = page.locator(".merge-row--change").first()
  const [rowColumns, choiceLabel, proposalMobileIcon] = await Promise.all([
    changeRow.evaluate((element) => getComputedStyle(element).gridTemplateColumns),
    changeRow.locator(".merge-hunk-controls span").first().isVisible(),
    changeRow.locator('[data-merge-choice="proposed"] .merge-icon-mobile').isVisible(),
  ])
  if (rowColumns.split(" ").length !== 1 || !choiceLabel || !proposalMobileIcon) {
    throw new Error("모바일 병합 화면이 단일 열과 선택 레이블로 전환되지 않았습니다.")
  }
  await page.screenshot({
    path: join(artifactDirectory, "merge-375.png"),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1280, height: 900 })
}
