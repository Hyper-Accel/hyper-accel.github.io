import { strict as assert } from "node:assert"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium, type Page } from "playwright"
import { startSiteHarness } from "../testing/site-harness"

async function login(page: Page): Promise<void> {
  const popup = page.waitForEvent("popup")
  await page.getByRole("button", { name: "GitHub 로그인", exact: true }).click()
  await popup
  // A fresh login lands on the blog home (drafts shelf); a re-login stays in the editor.
  await page
    .locator(".tr-drafts:not([hidden])")
    .or(page.locator("#site-session").filter({ hasText: "편집 권한 확인됨" }))
    .first()
    .waitFor({ state: "attached" })
}

const body = (page: Page, lang: string) =>
  page.locator(`.composer-document[data-lang="${lang}"] .ProseMirror`)

async function english(page: Page): Promise<void> {
  const tab = page.locator('.composer-tab[data-lang="en"]')
  if (await tab.isVisible()) await tab.click()
}

async function snapshot(page: Page, slug: string) {
  return page.evaluate(async (key) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("hyperaccel-onsite-drafts", 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const records: unknown[] = await new Promise((resolve, reject) => {
        const request = db.transaction("snapshots").objectStore("snapshots").getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const record = records.find(
        (entry) => entry && typeof entry === "object" && Reflect.get(entry, "key")?.slug === key,
      )
      if (!record || typeof record !== "object") throw new Error("Missing snapshot")
      const bundle = Reflect.get(record, "bundle")
      return {
        ko: bundle.ko,
        en: bundle.en,
        cursor: Reflect.get(record, "cursor"),
        headSha: bundle.headSha,
        images: await Promise.all(
          bundle.images.map(async (image: { path: string; blob?: Blob }) => ({
            path: image.path,
            bytes: image.blob ? Array.from(new Uint8Array(await image.blob.arrayBuffer())) : [],
          })),
        ),
      }
    } finally {
      db.close()
    }
  }, slug)
}

const artifacts = await mkdtemp(join(tmpdir(), "onsite-recovery-"))
const browser = await chromium.launch({ channel: "chrome", headless: true })
try {
  for (const width of [390, 1440]) {
    const harness = await startSiteHarness()
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      isMobile: width === 390,
      hasTouch: width === 390,
    })
    const errors: string[] = []
    context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)))
    const slug = `local-recovery-${width}`
    try {
      let page = await context.newPage()
      await page.clock.setFixedTime(Date.now())
      await page.goto(`${harness.url}/editor-login/`)
      await login(page)
      // Start the new post from the home shelf's "+ 새 글" card, like an editor would.
      await page.locator(".tr-drafts .tr-draft-new").click()
      await page.locator('input[name="titleKo"]').fill("로컬 복구")
      await page.locator('[name="titleEn"]').fill("Local recovery")
      await page.locator('[name="slug"]').fill(slug)
      await page.locator('input[name="authorQuery"]').click()
      await page.locator('input[name="authors"]').first().check()
      // Categories are chips: one click on the chip picks it.
      await page.locator('[data-picker="category"] label:has(input[value="AI Hardware"])').click()
      await page.getByRole("button", { name: "작성 시작", exact: true }).click()
      await page.waitForURL(`**/editor-new/?draft=${slug}`)
      await page.goto(`${harness.url}/editor-new/`)
      await page.locator(".composer[data-mode=form]").waitFor()
      await page.goto(`${harness.url}/editor-new/?draft=${slug}`)
      await body(page, "ko").fill("로컬 초안 한국어")
      await english(page)
      await body(page, "en").fill("Local-only English")
      await body(page, "en").evaluate(async (target) => {
        const canvas = document.createElement("canvas")
        canvas.width = canvas.height = 64
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Canvas failed")))),
        )
        const transfer = new DataTransfer()
        transfer.items.add(new File([blob], "local.png", { type: "image/png" }))
        target.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
        )
      })
      await body(page, "en").locator("figure[data-onsite-image] > img").waitFor()
      const paragraph = body(page, "en")
        .locator("p")
        .filter({ hasText: "Local-only English" })
        .first()
      await paragraph.scrollIntoViewIfNeeded()
      const bounds = await paragraph.boundingBox()
      assert.ok(bounds)
      await page.mouse.move(bounds.x + 3, bounds.y + 10)
      await page.mouse.down()
      await page.mouse.move(bounds.x + 50, bounds.y + 10, { steps: 5 })
      await page.mouse.up()
      await page
        .locator('[data-site-save-status][data-state="saved"][data-selection="range"]')
        .waitFor()
      const before = await snapshot(page, slug)
      assert.equal(before.headSha, null)
      assert.ok(before.images[0]?.bytes.length)
      // Close the actual tab: sessionStorage must not be the discovery mechanism.
      await page.close()
      page = await context.newPage()
      await page.clock.setFixedTime(Date.now())
      await page.goto(`${harness.url}/editor-login/`)
      await login(page)
      await page.locator(`.tr-drafts .tr-card-title a[href="/editor-new/?draft=${slug}"]`).click()
      await page.locator(".composer[data-mode=edit]").waitFor()
      await body(page, "en").locator("figure[data-onsite-image] > img").waitFor()
      assert.deepEqual(await snapshot(page, slug), before)
      await page.screenshot({ path: join(artifacts, `${width}-tab-restored.png`), fullPage: true })
      await page.locator("[data-site-save]").click()
      await page.waitForFunction(() => {
        const status = document.querySelector<HTMLElement>("[data-site-save-status]")
        return status?.dataset["remoteHead"] || status?.dataset["state"] === "error"
      })
      assert.ok(
        await page.locator("[data-site-save-status]").getAttribute("data-remote-head"),
        await page.locator("[data-site-save-status]").innerText(),
      )

      const advance = (replacement: string): string => {
        const state = harness.github.state
        const old = state.refs.get(`heads/post/${slug}`)
        const commit = old ? state.commits.get(old) : undefined
        const tree = commit ? state.trees.get(commit.tree.sha) : undefined
        assert.ok(tree)
        const files = Object.fromEntries(
          tree.tree.map((entry) => {
            const blob = state.blobs.get(entry.sha)
            assert.ok(blob)
            const bytes = Buffer.from(blob.content, "base64")
            return [
              entry.path,
              entry.path.endsWith("index.en.md")
                ? bytes
                    .toString()
                    .replace(/Local-only English|Local conflicting edit/g, replacement)
                : bytes,
            ]
          }),
        )
        return harness.github.seed(`post/${slug}`, files)
      }

      await body(page, "en").fill("Local conflicting edit")
      await page.locator('[data-site-save-status][data-state="saved"]').waitFor()
      const local = await snapshot(page, slug)
      const remoteHead = advance("Remote concurrent edit")
      await page.reload()
      // The tab keeps its login across a reload (sessionStorage), so no second login is needed.
      const compare = page.locator("[data-recovery-conflict]")
      await compare.waitFor()
      assert.ok((await compare.innerText()).includes("Local conflicting edit"))
      assert.ok((await compare.innerText()).includes("Remote concurrent edit"))
      assert.deepEqual(await snapshot(page, slug), local)
      await page.screenshot({ path: join(artifacts, `${width}-conflict.png`), fullPage: true })
      await compare.locator('[data-action="keep-local"]').click()
      await page.locator(".composer[data-mode=edit]").waitFor()
      await english(page)
      assert.ok((await body(page, "en").innerText()).includes("Local conflicting edit"))
      await page.locator('[data-site-save-status][data-state="saved"]').waitFor()
      assert.equal((await snapshot(page, slug)).headSha, remoteHead)
      await page.locator("[data-site-save]").click()
      await page
        .locator(
          `[data-site-save-status][data-remote-head]:not([data-remote-head="${remoteHead}"])`,
        )
        .waitFor()

      await body(page, "en").fill("Second local change")
      await page.locator('[data-site-save-status][data-state="saved"]').waitFor()
      advance("Remote chosen version")
      await page.clock.setFixedTime(Date.now() + 28_800_001)
      await page.evaluate(() => window.dispatchEvent(new Event("focus")))
      await page.locator("dialog[open]").waitFor()
      await login(page)
      await compare.waitFor()
      assert.ok((await compare.innerText()).includes("Second local change"))
      assert.ok((await compare.innerText()).includes("Remote chosen version"))
      await compare.locator('[data-action="use-remote"]').click()
      await compare.waitFor({ state: "detached" })
      await page.locator(".composer[data-mode=edit]").waitFor()
      await english(page)
      assert.ok((await body(page, "en").innerText()).includes("Remote chosen version"))
      assert.ok(!(await body(page, "en").innerText()).includes("Second local change"))
      assert.deepEqual(errors, [])
      console.info(`Tab-close and both conflict continuations passed at ${width}.`)
    } finally {
      await context.close()
      harness.stop()
    }
  }
  console.info(`Recovery screenshots: ${artifacts}`)
} finally {
  await browser.close()
}
