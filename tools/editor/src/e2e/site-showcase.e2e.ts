import { strict as assert } from "node:assert"
import { chromium, type Page } from "playwright"
import { startSiteHarness } from "../testing/site-harness"

// The editor's example post (content/posts/editor-showcase) can be tried out in the editor but is
// never saved: no draft on this device, no GitHub save, review or comments.

async function snapshotKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open("hyperaccel-onsite-drafts")
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains("snapshots")) {
            resolve([])
            return
          }
          const request = db.transaction("snapshots").objectStore("snapshots").getAllKeys()
          request.onsuccess = () => resolve(request.result.map((key) => JSON.stringify(key)))
          request.onerror = () => reject(request.error)
        }
      }),
  )
}

const harness = await startSiteHarness({ writer: "Donghyeon Choi", posts: ["editor-showcase"] })
const browser = await chromium.launch({ channel: "chrome", headless: true })
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addCookies([{ name: "onsite-dev-user", value: "author", url: harness.url }])
    const page = await context.newPage()
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto(`${harness.url}/editor-login/`)
    const popup = page.waitForEvent("popup")
    await page.getByRole("button", { name: "GitHub 로그인", exact: true }).click()
    await popup
    await page.waitForURL(`${harness.url}/`)

    await page.goto(`${harness.url}/posts/editor-showcase/?edit`)
    await page.locator(".composer[data-mode=edit]").waitFor()
    await page.locator("[data-showcase]").getByText("예시 글은 고쳐도 저장되지 않습니다.").waitFor()
    // Editing works; saving, review and comments are not offered.
    assert.equal(await page.locator(".composer[data-readonly]").count(), 0)
    assert.equal(await page.locator("[data-site-save]").isVisible(), false)
    assert.equal(await page.locator('[data-action="request-review"]').count(), 0)
    assert.equal(await page.locator(".composer-dock [data-site-comments]").count(), 0)
    const paragraph = page.locator('.composer-document[data-lang="ko"] .ProseMirror p').first()
    await paragraph.click()
    await page.keyboard.type("연습")
    assert.match((await paragraph.textContent()) ?? "", /연습/)

    // Leaving flushes any pending draft: still nothing is kept, and 작성 중인 글 does not list it.
    await page.goto(`${harness.url}/`)
    await page.locator("[data-editor-drafts] .tr-draft-new").waitFor()
    await page.waitForLoadState("networkidle")
    assert.deepEqual(
      (await snapshotKeys(page)).filter((key) => key.includes("editor-showcase")),
      [],
    )
    assert.equal(await page.locator('[data-editor-drafts] a[href*="editor-showcase"]').count(), 0)
    assert.equal(
      [...harness.github.state.refs.keys()].some((ref) => ref.includes("editor-showcase")),
      false,
    )
    assert.deepEqual(errors, [])
    await context.close()
    console.info(`Example post stays unsaved at ${width}.`)
  }
} finally {
  await browser.close()
  harness.stop()
}
