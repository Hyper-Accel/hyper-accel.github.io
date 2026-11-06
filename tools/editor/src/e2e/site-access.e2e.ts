import { strict as assert } from "node:assert"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright"
import { startSiteHarness } from "../testing/site-harness"

const artifacts = await mkdtemp(join(tmpdir(), "onsite-access-e2e-"))
console.info(`Access screenshots: ${artifacts}`)
const browser = await chromium.launch({ channel: "chrome", headless: true })
try {
  for (const width of [390, 1440]) {
    for (const draft of [true, false]) {
      const harness = await startSiteHarness()
      const head = harness.github.seed(
        "post/example-post",
        Object.fromEntries(
          (["ko", "en"] as const).map((language) => [
            `content/posts/example-post/index${language === "en" ? ".en" : ""}.md`,
            `---\ntitle: "Author access"\ndate: "2026-11-05"\nauthors: ["Unlinked Author"]\neditors: ["author"]\ncategories: ["AI Hardware"]\ndraft: ${draft}\n---\n\n<!-- b:intro -->\nOriginal text.\n`,
          ]),
        ),
      )
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      try {
        await context.addCookies([{ name: "onsite-dev-user", value: "author", url: harness.url }])
        const page = await context.newPage()
        const errors: string[] = []
        page.on("pageerror", (error) => errors.push(error.message))
        await page.route("**/editor/people.json", (route) => route.fulfill({ json: [] }))
        await page.goto(`${harness.url}/editor-new/?draft=example-post`)
        const popup = page.waitForEvent("popup")
        await page.getByRole("button", { name: "로그인하고 편집 계속하기", exact: true }).click()
        await popup
        await page.locator('.composer[data-readonly="true"]').waitFor()
        const notice = page.locator("[data-author-access=unlinked]")
        await notice.waitFor()
        assert.match(await notice.innerText(), /github_id/)
        // The note sits in the corner, clear of the article.
        const box = await notice.boundingBox()
        const article = await page.locator(".composer").boundingBox()
        assert.ok(box && article && box.x + box.width <= (page.viewportSize()?.width ?? 0))
        const profile = notice.getByRole("link")
        assert.equal(
          await profile.getAttribute("href"),
          "https://github.com/Hyper-Accel/hyper-accel.github.io/tree/main/content/authors",
        )
        assert.equal(await page.locator('.ProseMirror[contenteditable="true"]').count(), 0)
        assert.equal(await page.locator("[data-site-save]").isVisible(), false)
        await page.screenshot({
          path: join(artifacts, `${width}-${draft ? "draft" : "review"}.png`),
        })
        await notice.getByRole("button", { name: "안내 닫기", exact: true }).click()
        assert.equal(await notice.count(), 0)
        const comments = page.locator("[data-site-comments]")
        await comments.click()
        await page.locator('textarea[aria-label="댓글"]').fill("Read-only feedback")
        await page.getByRole("button", { name: "댓글 달기", exact: true }).click()
        await page.locator(".composer-comment-thread", { hasText: "Read-only feedback" }).waitFor()
        assert.equal(harness.github.state.refs.get("heads/post/example-post"), head)
        assert.deepEqual(errors, [])
        console.info(
          `Unlinked author blocks edits and preserves comments at ${width}, draft=${draft}.`,
        )
      } finally {
        await context.close()
        harness.stop()
      }
    }
  }
} finally {
  await browser.close()
}
