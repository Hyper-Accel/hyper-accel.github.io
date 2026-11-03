import { strict as assert } from "node:assert"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium, type Page } from "playwright"
import { startSiteHarness } from "../testing/site-harness"

async function login(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/editor-login/`)
  const popup = page.waitForEvent("popup")
  await page.getByRole("button", { name: "GitHub 로그인", exact: true }).click()
  await popup
  await page.waitForURL(`${url}/`)
}

async function waitForClip(page: Page): Promise<void> {
  await page.locator("dialog.onsite-intro[open] video").evaluate(async (video) => {
    if (!(video instanceof HTMLVideoElement)) throw new Error("Missing help video")
    if (video.readyState >= 2) return
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Help video did not load")), 10000)
      video.addEventListener(
        "loadeddata",
        () => {
          clearTimeout(timeout)
          resolve()
        },
        { once: true },
      )
      video.addEventListener(
        "error",
        () => {
          clearTimeout(timeout)
          reject(new Error("Help video failed to load"))
        },
        { once: true },
      )
    })
  })
}

const artifacts = await mkdtemp(join(tmpdir(), "onsite-help-e2e-"))
const browser = await chromium.launch({ channel: "chrome", headless: true })
try {
  for (const width of [390, 1440]) {
    const harness = await startSiteHarness()
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 900 },
      isMobile: width === 390,
      hasTouch: width === 390,
    })
    // Exercise the real user's automatic guide, not the usual automation bypass.
    await context.addInitScript(() =>
      Object.defineProperty(navigator, "webdriver", { get: () => false }),
    )
    const errors: string[] = []
    context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)))
    try {
      const page = await context.newPage()
      await login(page, harness.url)
      await page.locator(".tr-drafts .tr-draft-new").click()
      const form = page.locator("form.composer-form[data-mode=create]")
      await form.waitFor()
      await form.locator('[name="titleKo"]').fill("도움말 초안")
      await form.locator('[name="titleEn"]').fill(`Help lifecycle ${width}`)
      await form.locator('[name="authorQuery"]').click()
      await form.locator('input[name="authors"][value="Donghyeon Choi"]').check()
      await form
        .locator('[data-picker="category"] label:has(input[value="Engineering Culture"])')
        .click()
      await form.locator('button[type="submit"]').click()
      const dialog = page.locator("dialog.onsite-intro[open]")
      await dialog.waitFor()
      assert.equal(await dialog.locator(".onsite-intro__dots span").count(), 4)
      const help = page.getByRole("button", { name: "도움말", exact: true })
      assert.equal(await page.locator(".composer-dock [data-site-help]").count(), 1)
      await waitForClip(page)
      await page.screenshot({ path: join(artifacts, `${width}-new-post-guide.png`) })
      await dialog.getByRole("button", { name: "닫기", exact: true }).click()
      await help.click()
      await dialog.waitFor()
      await dialog.getByRole("button", { name: "닫기", exact: true }).click()
      const body = page.locator('.composer-document[data-lang="ko"] .ProseMirror p').first()
      const status = page.locator('[data-site-save-status][data-state="saved"][data-revision]')
      await status.waitFor()
      const previous = await status.getAttribute("data-revision")
      assert.ok(previous)
      const saved = page
        .locator(
          `[data-site-save-status][data-state="saved"][data-revision]:not([data-revision="${previous}"])`,
        )
        .waitFor()
      await Promise.all([saved, body.fill(`복원할 본문 ${width}`)])
      await page.reload()
      await dialog.waitFor()
      assert.equal(await body.textContent(), `복원할 본문 ${width}`)
      assert.equal(await page.locator(".composer-dock [data-site-help]").count(), 1)
      await dialog.getByRole("button", { name: "다시 보지 않기", exact: true }).click()
      await page
        .getByRole("dialog", { name: "도움말 안내", exact: true })
        .getByRole("button", { name: "확인", exact: true })
        .click()
      await help.click()
      await dialog.waitFor()
      await dialog.getByRole("button", { name: "닫기", exact: true }).click()
      await page.reload()
      await help.waitFor()
      assert.equal(await dialog.count(), 0)
      await help.click()
      await dialog.waitFor()
      await waitForClip(page)
      await page.screenshot({ path: join(artifacts, `${width}-restored-guide.png`) })
      assert.deepEqual(errors, [])
      console.info(`New-post and restored-draft help passed at ${width}.`)
    } finally {
      await context.close()
      harness.stop()
    }
  }
  console.info(`Help lifecycle screenshots: ${artifacts}`)
} finally {
  await browser.close()
}
