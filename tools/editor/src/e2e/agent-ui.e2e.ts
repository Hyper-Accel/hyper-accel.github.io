import { mkdir, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { chromium, type Page } from "playwright"
import type { AgentEvent } from "../shared/agent-contracts"

const repositoryRoot = resolve(import.meta.dir, "../../../..")
const fixtureDirectory = join(repositoryRoot, "content/posts/agent-ui-e2e-fixture")
const fixturePath = join(fixtureDirectory, "index.md")
const artifactDirectory = "/tmp/hyperaccel-blog-editor-agent-ui-e2e"
const sessionId = "10000000-0000-4000-8000-000000000099"
const currentParagraph = "현재 글에는 기존 문장이 있습니다."
const proposedParagraph = "AI가 제안한 자연스러운 문장이 있습니다."

const source = `---
date: '2025-08-27T12:00:00+09:00'
draft: false
title: '에이전트 UI 검증 글'
authors: ["Test"]
tags: ["agent-ui-e2e"]
categories: ["Test"]
---

# 시작 문단

${currentParagraph}
`

function agentEvents(): readonly AgentEvent[] {
  return [
    { type: "status", text: "로컬 스킬 3개를 불러왔습니다." },
    { type: "tool", label: "Read: index.md", status: "completed" },
    { type: "delta", text: "문장을 다듬고 변경 내용을 준비했습니다." },
    {
      type: "proposal",
      title: "에이전트 UI 검증 글",
      body: `# 시작 문단\n\n${proposedParagraph}\n`,
    },
    { type: "done" },
  ]
}

async function installAgentRoutes(page: Page): Promise<void> {
  await page.route("**/api/agent/sessions", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ sessionId, provider: "codex" }),
    })
  })
  await page.route(`**/api/agent/sessions/${sessionId}/messages`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${agentEvents()
        .map((event) => JSON.stringify(event))
        .join("\n")}\n`,
    })
  })
  await page.route(`**/api/agent/sessions/${sessionId}`, async (route) => {
    await route.fulfill({ status: 204, body: "" })
  })
}

async function openFixture(page: Page): Promise<void> {
  await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" })
  const fixture = page.locator('[data-path="content/posts/agent-ui-e2e-fixture/index.md"]')
  await fixture.waitFor()
  await fixture.click()
  await page.locator("#post-title").waitFor()
}

async function requestProposal(page: Page): Promise<void> {
  await page.locator("#agent-tab").click()
  await page.locator("#agent-provider").selectOption("codex")
  await page.locator("#agent-prompt").fill("문장을 자연스럽게 다듬어 주세요.")
  await page.locator("#agent-send").click()
  await page.locator("#merge-workspace").waitFor()
}

async function verifyAgentPanel(page: Page): Promise<void> {
  const [railBox, composerBox, emptyVisible, cancelVisible] = await Promise.all([
    page.locator("#post-rail").boundingBox(),
    page.locator("#agent-form").boundingBox(),
    page.locator("#agent-empty").isVisible(),
    page.locator("#agent-cancel").isVisible(),
  ])
  if (!railBox || !composerBox || composerBox.y + composerBox.height > railBox.y + railBox.height) {
    throw new Error("에이전트 입력창이 왼쪽 패널 아래에서 잘립니다.")
  }
  if (!emptyVisible || cancelVisible) {
    throw new Error("대기 상태에서 빈 안내 또는 중단 버튼의 표시 상태가 올바르지 않습니다.")
  }
}

async function verifyResponsiveMerge(page: Page): Promise<void> {
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

async function run(): Promise<void> {
  await mkdir(fixtureDirectory, { recursive: true })
  await mkdir(artifactDirectory, { recursive: true })
  await writeFile(fixturePath, source, "utf8")

  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await installAgentRoutes(page)
    await openFixture(page)
    await page.locator("#agent-tab").click()
    await verifyAgentPanel(page)
    await page.screenshot({
      path: join(artifactDirectory, "agent-panel-1280.png"),
      fullPage: true,
    })

    await requestProposal(page)
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

    await proposalAction.click()
    await page.locator("#merge-workspace").waitFor()
    await verifyResponsiveMerge(page)
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
        mergeCloseRestoresEditor: true,
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
