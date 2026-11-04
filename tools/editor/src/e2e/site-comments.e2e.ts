import { strict as assert } from "node:assert"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium, type Locator, type Page } from "playwright"
import { filesAt } from "../testing/fake-github/state"
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
console.info(`Comment screenshots: ${artifacts}`)
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
              "draft: true",
              "---",
              "<!-- b:heading -->",
              "## Part **one** {#part1}",
              "",
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
        assert.equal(await document.locator("h2#part1").innerText(), "Part one")
        const comments = page.locator("[data-site-comments]")
        await comments.waitFor({ state: "visible" })
        await comments.click()
        await page.getByRole("button", { name: "일반 댓글 쓰기", exact: true }).click()
        await page.locator('textarea[aria-label="댓글"]').fill("General post feedback")
        await page.getByRole("button", { name: "댓글 달기", exact: true }).click()
        await page
          .locator(".composer-comment-thread", { hasText: "General post feedback" })
          .waitFor()
        await page.screenshot({ path: join(artifacts, `${width}-${user}-general.png`) })
        await page.keyboard.press("Escape")
        const nested = document.locator(".alert-body").first()
        await nested.locator("p").nth(1).waitFor()
        assert.equal(await nested.locator("p").count(), 2)
        await comment(page, nested, "Nested paragraphs comment")
        assert.equal(await nested.locator("p .composer-comment-mark").count(), 2)
        const formula = document.locator("p").filter({ has: page.locator(".onsite-math-inline") })
        await comment(page, formula, "Formula range comment")
        assert.equal(harness.github.state.comments.size, 3)
        await page.reload()
        await nested.locator(".composer-comment-mark").first().waitFor()
        await comments.click()
        await page.getByRole("button", { name: /글 전체.*댓글 1/ }).click()
        await page
          .locator(".composer-comment-thread", { hasText: "General post feedback" })
          .waitFor()
        await page.keyboard.press("Escape")
        assert.equal(await nested.locator("p .composer-comment-mark").count(), 2)
        const mark = nested.locator(".composer-comment-mark").first()
        await mark.scrollIntoViewIfNeeded()
        const bounds = await mark.boundingBox()
        if (!bounds) throw new Error("Missing comment highlight")
        await page.mouse.move(bounds.x + 4, bounds.y + bounds.height / 2)
        await page.mouse.down()
        await page.mouse.move(
          bounds.x + Math.min(100, bounds.width - 4),
          bounds.y + bounds.height / 2,
          { steps: 10 },
        )
        await page.mouse.up()
        assert.equal(await page.locator(".composer-comment-popover").isVisible(), false)
        assert.equal(await page.evaluate(() => !!getSelection()?.toString().trim()), true)
        await page.keyboard.press("Escape")
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
        if (user === "author") {
          await page.keyboard.press("Escape")
          const pull = [...harness.github.state.pulls.values()].find(
            (entry) => entry.head === "post/example-post",
          )
          if (!pull) throw new Error("Missing example PR")
          const before = harness.github.state.refs.get("heads/post/example-post")
          const review = page.locator('[data-action="request-review"]')
          await page.locator('.composer-tab[data-lang="en"]').click()
          const english = page.locator('.composer-document[data-lang="en"] .ProseMirror p').first()
          await english.fill("")
          await page.locator('[data-site-save-status][data-state="saved"]').waitFor()
          await review.click()
          await page
            .locator("[data-site-save-status]")
            .filter({ hasText: "영어 번역이 비어" })
            .waitFor()
          assert.equal(pull.draft, true)
          assert.equal(harness.github.state.refs.get("heads/post/example-post"), before)
          await english.fill("Complete English review body.")
          await page.locator('[data-site-save-status][data-state="saved"]').waitFor()
          await page.route("**/git/trees", (route) =>
            route.fulfill({ status: 403, json: { message: "Save denied for test" } }),
          )
          await review.click()
          await page
            .locator("[data-site-save-status]")
            .filter({ hasText: "Save denied for test" })
            .waitFor()
          assert.equal(pull.draft, true)
          assert.equal(harness.github.state.refs.get("heads/post/example-post"), before)
          await page.unroute("**/git/trees")
          await review.click()
          await page.getByRole("button", { name: "리뷰 중", exact: true }).waitFor()
          assert.equal(pull.draft, false)
          assert.equal(pull.merged, false)
          const head = harness.github.state.refs.get("heads/post/example-post")
          if (!head) throw new Error("Missing saved head")
          for (const path of [
            "content/posts/example-post/index.md",
            "content/posts/example-post/index.en.md",
          ]) {
            const file = filesAt(harness.github.state, head).find((entry) => entry.path === path)
            const blob = file && harness.github.state.blobs.get(file.sha)
            if (!blob) throw new Error(`Missing saved file: ${path}`)
            const source = Buffer.from(blob.content, "base64").toString()
            assert.match(source, /^draft: false$/m)
            assert.match(source, /^## Part \*\*one\*\* \{#part1\}$/m)
          }
          await page.screenshot({ path: join(artifacts, `${width}-${user}-review-ready.png`) })
        }
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
