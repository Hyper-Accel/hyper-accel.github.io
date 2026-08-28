import { copyFile, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { chromium } from "playwright"
import { verifySessionHistory } from "./agent-session-verification"
import {
  type AgentRouteState,
  artifactDirectory,
  attachImageSelection,
  attachTextSelection,
  currentParagraph,
  fixtureDirectory,
  fixtureImagePath,
  fixturePath,
  installAgentRoutes,
  openFixture,
  proposedParagraph,
  repositoryRoot,
  requestProposal,
  source,
} from "./agent-ui-fixture"
import { verifyAgentPanel, verifyResponsiveMerge, verifyTimeline } from "./agent-ui-verification"

async function run(): Promise<void> {
  await mkdir(fixtureDirectory, { recursive: true })
  await mkdir(join(fixtureDirectory, "images"), { recursive: true })
  await mkdir(artifactDirectory, { recursive: true })
  await writeFile(fixturePath, source, "utf8")
  await copyFile(
    join(repositoryRoot, "content/posts/arc-setup-guide/arc-architecture.png"),
    fixtureImagePath,
  )

  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const state: AgentRouteState = { requests: [], resumeCount: 0 }
    await installAgentRoutes(page, state)
    await openFixture(page)
    await attachTextSelection(page)
    await verifyAgentPanel(page)
    await page.screenshot({
      path: join(artifactDirectory, "agent-panel-1280.png"),
      fullPage: true,
    })

    await requestProposal(page)
    if (
      state.requests[0]?.context?.kind !== "text" ||
      state.requests[0].context.text !== currentParagraph ||
      state.requests[0].context.startLine !== 3 ||
      state.requests[0].context.endLine !== 3
    ) {
      throw new Error(
        `선택 문장 문맥이 요청에 포함되지 않았습니다: ${JSON.stringify(state.requests)}`,
      )
    }
    await verifyTimeline(page)
    await page.screenshot({
      path: join(artifactDirectory, "chat-timeline-1280.png"),
      fullPage: true,
    })
    const proposalAction = page.locator(".agent-proposal-open")
    if (
      (await page.locator("#agent-empty").isVisible()) ||
      (await page.locator("#agent-cancel").isVisible()) ||
      !(await proposalAction.isVisible())
    ) {
      throw new Error("에이전트 응답 뒤 빈 안내 또는 중단 버튼이 계속 표시됩니다.")
    }
    await page.locator("#merge-close").click()
    if (!(await page.locator("#article-canvas").isVisible())) {
      throw new Error("병합 검토를 닫은 뒤 편집 화면이 복원되지 않았습니다.")
    }

    await verifySessionHistory(browser, state)

    const imagePage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const imageState: AgentRouteState = { requests: [], resumeCount: 0 }
    await installAgentRoutes(imagePage, imageState)
    await openFixture(imagePage)
    await attachImageSelection(imagePage)
    await imagePage.locator("#agent-provider").selectOption("codex")
    await imagePage.locator("#agent-prompt").fill("선택한 그림을 검토해 주세요.")
    await imagePage.locator("#agent-send").click()
    await imagePage.locator("#merge-workspace").waitFor()
    if (
      imageState.requests[0]?.context?.kind !== "image" ||
      imageState.requests[0].context.path !== "images/context.png"
    ) {
      throw new Error(
        `선택 이미지 문맥이 요청에 포함되지 않았습니다: ${JSON.stringify(imageState.requests)}`,
      )
    }
    await imagePage.close()

    await proposalAction.click()
    await page.locator("#merge-workspace").waitFor()
    await verifyResponsiveMerge(page, artifactDirectory)
    const lowerChangedRow = page.locator(".merge-row--change").last()
    await lowerChangedRow.scrollIntoViewIfNeeded()
    const scrollBeforeChoice = await page.evaluate(() => window.scrollY)
    if (scrollBeforeChoice < 100) {
      throw new Error(`병합 스크롤 회귀를 검증하기에 이동 거리가 부족합니다: ${scrollBeforeChoice}`)
    }
    const lowerChoice = lowerChangedRow.locator('[data-merge-choice="proposed"]')
    const originalChoice = await lowerChoice.elementHandle()
    await lowerChoice.click()
    const scrollAfterChoice = await page.evaluate(() => window.scrollY)
    if (scrollAfterChoice !== scrollBeforeChoice) {
      throw new Error(
        `병합 블록 선택 뒤 스크롤 위치가 ${scrollBeforeChoice}에서 ${scrollAfterChoice}(으)로 바뀌었습니다.`,
      )
    }
    if (!originalChoice || !(await originalChoice.evaluate((element) => element.isConnected))) {
      throw new Error("병합 블록 선택 뒤 전체 그리드가 다시 렌더링되었습니다.")
    }
    const changedRow = page.locator(".merge-row--change").first()
    if ((await changedRow.getAttribute("data-selected")) !== "current") {
      throw new Error("기본 병합 선택이 현재 글 카드에 표시되지 않았습니다.")
    }
    const currentButton = changedRow.locator('[data-merge-choice="current"]')
    const proposedButton = changedRow.locator('[data-merge-choice="proposed"]')
    const selectedBackground = await currentButton.evaluate(
      (button) => getComputedStyle(button).backgroundColor,
    )
    await proposedButton.hover()
    const hoverBackground = await proposedButton.evaluate(
      (button) => getComputedStyle(button).backgroundColor,
    )
    if (selectedBackground === hoverBackground) {
      throw new Error("선택 버튼과 단순 hover 상태를 시각적으로 구분할 수 없습니다.")
    }
    await changedRow.locator('[data-merge-choice="proposed"]').click()
    if ((await changedRow.getAttribute("data-selected")) !== "proposed") {
      throw new Error("AI 제안 선택이 제안 카드의 시각 상태에 반영되지 않았습니다.")
    }
    if (
      (await changedRow.locator('[data-merge-choice="proposed"]').getAttribute("aria-pressed")) !==
      "true"
    ) {
      throw new Error("AI 제안 선택 상태가 접근성 속성에 반영되지 않았습니다.")
    }
    await page.locator("#merge-apply").click()
    await page.waitForFunction(() => {
      const button = document.querySelector<HTMLButtonElement>("#save-button")
      return button?.disabled === false
    })
    await page.locator("#save-button").click()
    await page.waitForFunction(() => {
      const button = document.querySelector<HTMLButtonElement>("#save-button")
      return button?.disabled === true
    })

    const saved = await Bun.file(fixturePath).text()
    if (!saved.includes(proposedParagraph) || saved.includes(currentParagraph)) {
      throw new Error("선택한 AI 제안이 Markdown 파일에 정확히 저장되지 않았습니다.")
    }
    console.info(
      JSON.stringify({
        chatPanel: true,
        chronologicalMarkdown: true,
        selectionContexts: ["text", "image"],
        sessionHistoryRestored: true,
        resumedTurns: state.requests.length,
        mergeCloseRestoresEditor: true,
        mergeScrollPreserved: true,
        responsiveWidths: [1280, 768, 375],
        perHunkApply: true,
        saved: true,
      }),
    )
  } finally {
    await browser.close()
    await rm(fixtureDirectory, { recursive: true, force: true })
  }
}

await run()
