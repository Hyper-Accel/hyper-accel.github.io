import { strict as assert } from "node:assert"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium, type Locator, type Page } from "playwright"
import { startSiteHarness } from "../testing/site-harness"

async function comment(page: Page, target: Locator, body: string): Promise<void> {
  await target.scrollIntoViewIfNeeded()
  await target.evaluate((element) => {
    element.closest<HTMLElement>(".ProseMirror")?.focus()
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  })
  await page.locator('.composer-bubble:not([hidden]) button[aria-label="댓글"]').click()
  await page.locator('textarea[aria-label="댓글"]').fill(body)
  await page.getByRole("button", { name: "댓글 달기", exact: true }).click()
  await page.locator('textarea[aria-label="댓글"]').waitFor({ state: "hidden" })
  await page.keyboard.press("Escape")
}

const artifacts = await mkdtemp(join(tmpdir(), "onsite-comments-e2e-"))
const browser = await chromium.launch({ channel: "chrome", headless: true })
try {
  for (const width of [390, 1440]) {
    for (const user of ["author", "reviewer"] as const) {
      const harness = await startSiteHarness()
      harness.github.seed(
        "post/example-post",
        Object.fromEntries(
          (["ko", "en"] as const).map((language) => [
            `content/posts/example-post/index${language === "en" ? ".en" : ""}.md`,
            [
              "---",
              'title: "Comment anchors"',
              'date: "2026-11-02"',
              'authors: ["Donghyeon Choi"]',
              'editors: ["author"]',
              'categories: ["AI Hardware"]',
              "draft: false",
              "---",
              "<!-- b:intro -->",
              "Words before $x^2$ and after.",
              "",
              "<!-- b:callout -->",
              "> [!NOTE]",
              "> First nested paragraph.",
              ">",
              "> Second nested paragraph.",
              "",
            ].join("\n"),
          ]),
        ),
      )
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
        await page.goto(`${harness.url}/editor-new/?draft=example-post`)
        const popup = page.waitForEvent("popup")
        await page.getByRole("button", { name: "로그인하고 편집 계속하기", exact: true }).click()
        await popup
        await page.locator(".composer[data-mode=edit]").waitFor()
        const document = page.locator('.composer-document[data-lang="ko"] .ProseMirror')
        const nested = document.locator(".alert-body").first()
        await nested.locator("p").nth(1).waitFor()
        assert.equal(await nested.locator("p").count(), 2)
        await comment(page, nested, "Nested paragraphs comment")
        assert.equal(await nested.locator("p .composer-comment-mark").count(), 2)
        const formula = document.locator("p").filter({ has: page.locator(".onsite-math-inline") })
        await comment(page, formula, "Formula range comment")
        assert.equal(harness.github.state.comments.size, 2)
        await page.reload()
        await nested.locator(".composer-comment-mark").first().waitFor()
        assert.equal(await nested.locator("p .composer-comment-mark").count(), 2)
        await nested.locator(".composer-comment-mark").first().click()
        await page
          .locator(".composer-comment-thread", { hasText: "Nested paragraphs comment" })
          .waitFor()
        await page.screenshot({ path: join(artifacts, `${width}-${user}-nested.png`) })
        await page.keyboard.press("Escape")
        await formula.locator(".composer-comment-mark", { hasText: "Words before" }).first().click()
        await page
          .locator(".composer-comment-thread", { hasText: "Formula range comment" })
          .waitFor()
        await page.screenshot({ path: join(artifacts, `${width}-${user}-formula.png`) })
        assert.deepEqual(errors, [])
        console.info(`Nested-paragraph and formula comments passed for ${user} at ${width}.`)
      } finally {
        await context.close()
        harness.stop()
      }
    }
  }
  console.info(`Comment screenshots: ${artifacts}`)
} finally {
  await browser.close()
}
