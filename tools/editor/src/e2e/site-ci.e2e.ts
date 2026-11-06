import { strict as assert } from "node:assert"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright"
import type { FakeCheckRun } from "../testing/fake-github/state"
import { startSiteHarness } from "../testing/site-harness"

function run(id: number, name: string, status: string, conclusion: string | null): FakeCheckRun {
  return {
    id,
    name,
    status,
    conclusion,
    html_url: `https://github.com/Hyper-Accel/hyper-accel.github.io/actions/runs/${id}`,
    details_url: null,
    output: {
      title: conclusion === "failure" ? "Post is still a draft" : null,
      summary: conclusion === "failure" ? "Set draft: false before publishing." : null,
      text: null,
      annotations_count: conclusion === "failure" ? 1 : 0,
    },
  }
}

const artifacts = await mkdtemp(join(tmpdir(), "onsite-ci-e2e-"))
console.info(`CI screenshots: ${artifacts}`)
const browser = await chromium.launch({ channel: "chrome", headless: true })
try {
  for (const width of [390, 1440]) {
    for (const user of ["author", "reviewer"] as const) {
      const harness = await startSiteHarness()
      const head = harness.github.seed(
        "post/example-post",
        Object.fromEntries(
          (["ko", "en"] as const).map((language) => [
            `content/posts/example-post/index${language === "en" ? ".en" : ""}.md`,
            `---\ntitle: "CI status"\ndate: "2026-11-04"\nauthors: ["Donghyeon Choi"]\neditors: [1]\ncategories: ["AI Hardware"]\ndraft: false\n---\n\n<!-- b:intro -->\nExample CI body.\n`,
          ]),
        ),
      )
      harness.github.state.checkRuns.set(head, [
        run(11, "editor/hugo", "in_progress", null),
        run(12, "editor/authors", "queued", null),
        run(13, "editor/ko-en", "completed", "failure"),
      ])
      harness.github.state.checkAnnotations.set(13, [
        {
          path: "content/posts/example-post/index.md",
          start_line: 7,
          annotation_level: "failure",
          message: "draft: true cannot be published.",
        },
      ])
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        isMobile: width === 390,
        hasTouch: width === 390,
      })
      const errors: string[] = []
      context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)))
      try {
        await context.addCookies([{ name: "onsite-dev-user", value: user, url: harness.url }])
        const page = await context.newPage()
        await page.clock.install()
        await page.goto(`${harness.url}/editor-new/?draft=example-post`)
        const popup = page.waitForEvent("popup")
        await page.getByRole("button", { name: "로그인하고 편집 계속하기", exact: true }).click()
        await popup
        const ci = page.locator("[data-site-checks]")
        // editors: [1] is a user ID without an author profile; the picker labels it by login.
        const editorChip = page.locator('[data-picker="editors"] .metadata-chip[data-value="1"]')
        assert.match((await editorChip.textContent()) ?? "", /^author/)
        // The dock shows an icon and "CI"; its accessible name carries the summary.
        const ciIs = (summary: string): Promise<void> =>
          page.locator(`[data-site-checks][aria-label="${summary}"]`).waitFor()
        await ciIs("CI 실패 1 · 진행 2")
        assert.equal(await ci.locator(".site-ci-icon").getAttribute("data-icon"), "failure")
        await ci.click()
        const panel = page.getByRole("dialog", { name: "CI 검사", exact: true })
        await panel.getByText("content/posts/example-post/index.md:7", { exact: true }).waitFor()
        assert.equal(
          await panel.getByText("draft: true cannot be published.", { exact: true }).count(),
          1,
        )
        assert.equal(await panel.getByText("진행 중", { exact: true }).count(), 1)
        assert.equal(await panel.getByText("대기", { exact: true }).count(), 1)
        await panel.getByText("일부 검사가 실패했습니다", { exact: true }).waitFor()
        // Like GitHub's checks list: failing first, each state drawn as an icon.
        assert.deepEqual(
          await panel
            .locator(".site-ci-check .site-ci-row > .site-ci-icon")
            .evaluateAll((icons) => icons.map((node) => node.getAttribute("data-icon"))),
          ["failure", "running", "queued"],
        )
        await page.screenshot({ path: join(artifacts, `${width}-${user}-failure.png`) })
        harness.github.state.checkRuns.set(head, [
          run(11, "editor/hugo", "completed", "success"),
          run(12, "editor/authors", "completed", "success"),
          run(13, "editor/ko-en", "completed", "success"),
        ])
        await page.clock.fastForward(15_000)
        await ciIs("CI 완료 3")
        await panel.getByText("모든 검사를 통과했습니다", { exact: true }).waitFor()
        assert.equal(await ci.locator(".site-ci-icon").getAttribute("data-icon"), "success")
        assert.equal(
          await panel.getByText("draft: true cannot be published.", { exact: true }).count(),
          0,
        )
        await page.screenshot({ path: join(artifacts, `${width}-${user}-success.png`) })
        if (user === "author") {
          const held = Promise.withResolvers<void>()
          const oldChecks = `**/commits/${head}/check-runs?**`
          await page.route(oldChecks, async (route) => {
            await held.promise
            await route.continue()
          })
          const requested = page.waitForRequest((request) =>
            request.url().includes(`/commits/${head}/check-runs`),
          )
          await panel.getByRole("button", { name: "새로고침", exact: true }).click()
          await requested
          await page.getByRole("button", { name: "CI 닫기", exact: true }).click()
          await page
            .locator('.composer-document[data-lang="ko"] .ProseMirror p')
            .first()
            .fill("Updated saved version.")
          await page.locator("[data-site-save]").click()
          await page.waitForFunction((oldHead) => {
            const current =
              document.querySelector<HTMLElement>("[data-site-save-status]")?.dataset["remoteHead"]
            return !!current && current !== oldHead
          }, head)
          await ciIs("CI 대기")
          const next = harness.github.state.refs.get("heads/post/example-post")
          if (!next) throw new Error("Missing saved head")
          const oldFinished = page.waitForResponse((response) =>
            response.url().includes(`/commits/${head}/check-runs`),
          )
          held.resolve()
          await oldFinished
          await page.unroute(oldChecks)
          await ci.click()
          await panel.getByText(`저장된 버전 ${next.slice(0, 7)}`, { exact: true }).waitFor()
          assert.equal(await panel.locator("details[data-check-id]").count(), 0)
          assert.equal(await ci.getAttribute("aria-label"), "CI 대기")
        }
        const current = harness.github.state.refs.get("heads/post/example-post")
        await page.route(`**/commits/${current}/check-runs?**`, (route) =>
          route.fulfill({
            status: 403,
            json: { message: "Resource not accessible by integration" },
          }),
        )
        await panel.getByRole("button", { name: "새로고침", exact: true }).click()
        await ciIs("CI 조회 실패")
        await panel.getByRole("alert").filter({ hasText: "읽기 권한" }).waitFor()
        assert.equal(await panel.locator("details[data-check-id]").count(), 0)
        await page.screenshot({ path: join(artifacts, `${width}-${user}-unavailable.png`) })
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
        )
        assert.deepEqual(errors, [])
        console.info(`CI failed/running/polling/access states passed for ${user} at ${width}.`)
      } finally {
        await context.close()
        harness.stop()
      }
    }
  }
} finally {
  await browser.close()
}
