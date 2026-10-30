import { strict as assert } from "node:assert"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium, type Page } from "playwright"
import { startSiteHarness } from "../testing/site-harness"

async function login(page: Page): Promise<void> {
  const modal = page
    .locator("dialog[open]")
    .getByRole("button", { name: "GitHub 로그인", exact: true })
  const button = (await modal.isVisible())
    ? modal
    : page.getByRole("button", { name: "GitHub 로그인", exact: true })
  const popup = page.waitForEvent("popup")
  await button.click()
  await popup
}

/** Insert tools live in the toolbox's card; on narrow screens it opens from "＋ 넣기". */
async function clickTool(page: Page, selector: string): Promise<void> {
  // 라이브러리 · 모바일 sit in the thin row itself.
  const inRow = page.locator(`.composer-toolbox__bar ${selector}`)
  if (await inRow.count()) {
    await inRow.click()
    return
  }
  const insert = page.locator(".composer-toolbox__insert")
  if ((await insert.getAttribute("aria-expanded")) !== "true") await insert.click()
  await page.locator(`.composer-toolbox__tools ${selector}`).click()
}

async function language(page: Page, value: "ko" | "en"): Promise<void> {
  const tab = page.locator(`.composer-tab[data-lang="${value}"]`)
  if (await tab.isVisible()) await tab.click()
}

function body(page: Page, value: "ko" | "en") {
  return page.locator(`.composer-document[data-lang="${value}"] .ProseMirror`)
}

async function stored(
  page: Page,
  slug: string,
): Promise<{
  image: number[]
  language: string | null
  anchor: number | null
  focus: number | null
  ko: unknown
  en: unknown
  headSha: string | null
  snapshotHash: string
  scrollTop: number | null
  imagePaths: string[]
}> {
  return page.evaluate(async (postSlug) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("hyperaccel-onsite-drafts", 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const snapshots = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction("snapshots").objectStore("snapshots").getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const record = snapshots.find(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          Reflect.get(entry, "key")?.slug === postSlug,
      )
      if (!record || typeof record !== "object") throw new Error("Missing persisted draft")
      const bundle = Reflect.get(record, "bundle")
      const cursor = Reflect.get(record, "cursor")
      const image = bundle.images.find((entry: { status: string }) => entry.status === "pending")
      return {
        image: image ? Array.from(new Uint8Array(await image.blob.arrayBuffer())) : [],
        language: cursor?.language ?? null,
        anchor: cursor?.anchor.offset ?? null,
        focus: cursor?.focus.offset ?? null,
        ko: bundle.ko,
        en: bundle.en,
        headSha: bundle.headSha,
        snapshotHash: bundle.snapshotHash,
        scrollTop: cursor?.scrollTop ?? null,
        imagePaths: bundle.images.map((entry: { path: string }) => entry.path),
      }
    } finally {
      db.close()
    }
  }, slug)
}

async function repairState(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("hyperaccel-onsite-repairs", 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const values = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction("repairs").objectStore("repairs").getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const record = values.find(
        (value) =>
          value &&
          typeof value === "object" &&
          Reflect.get(value, "key")?.slug === "crafting-compilers",
      )
      if (!record || typeof record !== "object") return null
      const unpaired = Reflect.get(record, "unpaired")
      return {
        ko: unpaired.ko,
        en: unpaired.en,
        headSha: unpaired.headSha,
        language: Reflect.get(record, "language"),
      }
    } finally {
      db.close()
    }
  })
}

const artifacts = await mkdtemp(join(tmpdir(), "hyperaccel-site-flow-"))
const browser = await chromium.launch({ channel: "chrome", headless: true })
try {
  for (const width of [390, 1440]) {
    const harness = await startSiteHarness()
    const slug = `m1-flow-${width}`
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 900 },
      isMobile: width === 390,
      hasTouch: width === 390,
    })
    const errors: string[] = []
    context.on("page", (opened) => opened.on("pageerror", (error) => errors.push(error.message)))
    try {
      // Someone who may not edit a draft opens the same editor, read-only: comments are open,
      // approval waits until the author asks for review.
      const early = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        isMobile: width === 390,
        hasTouch: width === 390,
      })
      early.on("page", (opened) => opened.on("pageerror", (error) => errors.push(error.message)))
      await early.addCookies([{ name: "onsite-dev-user", value: "reviewer", url: harness.url }])
      try {
        const draftPage = await early.newPage()
        await draftPage.goto(`${harness.url}/editor-login/`)
        await login(draftPage)
        await draftPage.waitForURL(`${harness.url}/`)
        await draftPage.goto(`${harness.url}/editor-new/?draft=example-post`)
        await draftPage.locator('.composer[data-mode=edit][data-readonly="true"]').waitFor()
        assert.equal(await draftPage.locator('[data-action="request-review"]').count(), 0)
        const earlyApprove = draftPage.locator('[data-action="approve"]')
        await earlyApprove.waitFor()
        assert.equal(await earlyApprove.isDisabled(), true)
        assert.equal(await earlyApprove.getAttribute("title"), "리뷰 요청 후 승인할 수 있습니다.")
      } finally {
        await early.close()
      }

      const page = await context.newPage()
      let clockTime = Date.now()
      await page.clock.setFixedTime(clockTime)
      await page.goto(`${harness.url}/editor-login/`)
      await login(page)
      // After login the editor starts on the blog home, with the drafts shelf on top.
      await page.waitForURL(`${harness.url}/`)
      const shelfCard = page.locator(
        '.tr-drafts .tr-card-title a[href="/editor-new/?draft=example-post"]',
      )
      await shelfCard.waitFor()
      assert.equal(
        await page.locator(".tr-drafts .tr-draft-new").getAttribute("href"),
        "/editor-new/",
      )
      await shelfCard.click()
      await page.locator(".composer[data-mode=edit]").waitFor()
      assert.equal(await page.locator(".composer-article .ProseMirror").count(), 2)
      assert.equal(await page.locator(".composer-row, [data-action=add-block]").count(), 0)
      await page.waitForFunction(() =>
        Array.from(
          document.querySelectorAll<HTMLImageElement>(".composer .onsite-image > img"),
        ).some((image) => image.complete && image.naturalWidth === 128),
      )
      await language(page, "ko")
      await body(page, "ko").locator("p").first().fill(`예시 글 한국어 수정 ${width}`)
      await language(page, "en")
      await body(page, "en").locator("p").first().fill(`Edited example body ${width}`)
      await page.locator('[data-site-save-status][data-state="saved"]').waitFor()
      const commitGate: { release?: () => void } = {}
      const allowCommit = new Promise<void>((resolve) => {
        commitGate.release = resolve
      })
      await page.route("**/git/commits", async (route) => {
        await allowCommit
        await route.continue()
      })
      const commitRequested = page.waitForRequest(
        (request) => request.method() === "POST" && request.url().endsWith("/git/commits"),
        { timeout: 10000 },
      )
      try {
        await Promise.all([commitRequested, page.locator("[data-site-save]").click()])
        const status = page.locator("[data-site-save-status]")
        assert.equal(await status.getAttribute("data-remote-state"), "saving")
        const revision = Number(await status.getAttribute("data-revision"))
        await body(page, "en").focus()
        await body(page, "en").press("ArrowLeft")
        await page.waitForFunction(
          (previous) =>
            Number(
              document.querySelector<HTMLElement>("[data-site-save-status]")?.dataset["revision"],
            ) > previous,
          revision,
        )
        assert.equal(await status.getAttribute("data-remote-state"), "saving")
      } finally {
        commitGate.release?.()
        await page.unrouteAll({ behavior: "wait" })
      }
      await page.locator("[data-site-save-status][data-remote-head]").waitFor()
      await page.locator('[data-site-save-status][data-remote-state="saved"]').waitFor()
      const savedRevision = Number(
        await page.locator("[data-site-save-status]").getAttribute("data-revision"),
      )
      await body(page, "en").press("ArrowRight")
      await page.waitForFunction(
        (previous) =>
          Number(
            document.querySelector<HTMLElement>("[data-site-save-status]")?.dataset["revision"],
          ) > previous,
        savedRevision,
      )
      assert.equal(
        await page.locator("[data-site-save-status]").getAttribute("data-remote-state"),
        "saved",
      )
      await page.goto(`${harness.url}/editor-new/`)
      await page.locator(".composer[data-mode=form]").waitFor()
      assert.equal(await page.locator("[data-site-save]").isVisible(), false)
      await page.locator('input[name="titleKo"]').fill(`복원 제목 ${width}`)
      await page.locator('[name="titleEn"]').fill(`Restored title ${width}`)
      await page.locator('[name="slug"]').fill(slug)
      await page.locator('input[name="authorQuery"]').click()
      await page.locator('input[name="authors"]').first().check()
      // The signed-in writer (@author) adds their own profile; the post's save also commits it.
      const newAuthor = `Flow Writer ${width === 390 ? "Narrow" : "Wide"}`
      await page.locator('input[name="authorQuery"]').fill(newAuthor)
      await page.locator('[data-picker="authors"] .metadata-picker__create').click()
      await page.locator('.author-profile-dialog input[name="authorGithub"]').fill("author")
      await page
        .locator('.author-profile-dialog input[name="authorBioKo"]')
        .fill("흐름 시험 작성자")
      await page.locator(".author-profile-dialog button[type=submit]").click()
      await page
        .locator(`[data-picker="authors"] .metadata-chip[data-value="${newAuthor}"]`)
        .waitFor()
      // Categories are chips: one click on the chip picks it.
      await page.locator('[data-picker="category"] label:has(input[value="AI Hardware"])').click()
      // Naver-style template: the post starts from the blog's conference-report structure.
      await page.locator(".composer-template", { hasText: "컨퍼런스 리포트" }).click()
      assert.equal(
        await page.locator('input[name="category"]:checked').getAttribute("value"),
        "AI Hardware",
      )
      await page.getByRole("button", { name: "작성 시작", exact: true }).click()
      await page.locator(".composer[data-mode=edit]").waitFor()
      await body(page, "ko").locator("h2", { hasText: "참관 후기" }).waitFor()
      assert.equal(await body(page, "en").locator("h2", { hasText: "Highlights" }).count(), 1)
      // The insert card closes to the thin bar and opens again; the choice is kept on this device.
      if (
        (await page.locator(".composer-toolbox__collapse").getAttribute("aria-expanded")) !== "true"
      ) {
        await page.locator(".composer-toolbox__collapse").click()
        await page.locator(".composer-toolbox__tools").waitFor()
      }
      await page.locator(".composer-toolbox__collapse").click()
      await page.locator(".composer-toolbox__tools").waitFor({ state: "hidden" })
      assert.equal(
        await page.evaluate(() => localStorage.getItem("onsite:toolbox-collapsed")),
        "true",
      )
      await page.locator(".composer-toolbox__collapse").click()
      await page.locator(".composer-toolbox__tools").waitFor()
      // On a narrow screen the open card is a popup over the post: a tap elsewhere closes it.
      if (width < 1300) {
        const card = await page.locator(".composer-toolbox__row").boundingBox()
        assert.ok(card, "insert card box")
        await page.mouse.click(4, card.y + card.height + 16)
        await page.locator(".composer-toolbox__tools").waitFor({ state: "hidden" })
      }
      if (width >= 1100) {
        // A TOC jump stops below the sticky site header and toolbox, not under them.
        await page.locator(".composer-toc a", { hasText: "참관 후기" }).click()
        await page.waitForFunction(() => {
          const heading = [
            ...document.querySelectorAll('.composer-document[data-lang="ko"] .ProseMirror h2'),
          ].find((element) => element.textContent?.includes("참관 후기"))
          const toolbox = document.querySelector(".composer-toolbox")
          return (
            heading &&
            toolbox &&
            heading.getBoundingClientRect().top >= toolbox.getBoundingClientRect().bottom
          )
        })
      }
      await page.waitForURL(`**/editor-new/?draft=${slug}`)
      await page.locator("[data-site-save]").waitFor({ state: "visible" })
      await language(page, "ko")
      await body(page, "ko").fill(`한국어 본문 ${width}\n수식 $x^2$.`)
      await language(page, "en")
      await body(page, "en").fill(`English revision ${width}\nMath $x^2$.`)
      await page.locator('[data-site-save-status][data-state="saved"]').waitFor()
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      )
      await page.locator("[data-site-save]").click()
      await page.locator("[data-site-save-status][data-remote-head]").waitFor()
      const pull = [...harness.github.state.pulls.values()].find(
        (entry) => entry.head === `post/${slug}`,
      )
      assert.ok(pull)
      const pullNumber = pull.number
      assert.equal(harness.github.state.pulls.size, 2)
      {
        const state = harness.github.state
        const head = state.refs.get(`heads/post/${slug}`)
        const commit = head ? state.commits.get(head) : undefined
        const paths = commit
          ? (state.trees.get(commit.tree.sha)?.tree ?? []).map((e) => e.path)
          : []
        assert.ok(paths.includes(`content/authors/${newAuthor}/_index.md`), paths.join("\n"))
        assert.ok(paths.includes(`content/authors/${newAuthor}/_index.en.md`))
      }

      // Confluence-style inline comment: select text, "댓글", @mention a GitHub handle.
      await body(page, "en").evaluate((root) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent ?? ""
          const index = text.indexOf("revision")
          if (index < 0) continue
          ;(root as HTMLElement).focus()
          const range = document.createRange()
          range.setStart(node, index)
          range.setEnd(node, index + "revision".length)
          const selection = getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
          return
        }
        throw new Error("No text to comment on")
      })
      await page.locator('.composer-bubble:not([hidden]) [aria-label="댓글"]').click()
      const commentBox = page.locator(".composer-comment-popover textarea")
      await commentBox.pressSequentially("Please check @opu")
      await page.locator(".composer-mention-list li[data-handle='opus24']").waitFor()
      await commentBox.press("Enter")
      assert.equal(await commentBox.inputValue(), "Please check @opus24 ")
      await page.locator(".composer-comment-popover .composer-comment-primary").click()
      await page
        .locator(".composer-comment-thread .composer-mention", { hasText: "@opus24" })
        .waitFor()
      await page.locator(".composer-comment-mark", { hasText: "revision" }).waitFor()
      assert.ok(
        [...harness.github.state.comments.values()].some((comment) =>
          comment.body.startsWith("Please check @opus24"),
        ),
      )
      await page.locator("[data-site-comments]", { hasText: "댓글 1" }).waitFor()
      await page.keyboard.press("Escape")
      await page.locator(".composer-comment-popover[hidden]").waitFor({ state: "attached" })
      // Return the caret to where the paste below expects it (start of the article).
      await body(page, "en").click({ position: { x: 1, y: 8 } })
      const beforeUnauthorized = await body(page, "en").elementHandle()
      assert.ok(beforeUnauthorized)
      harness.github.inject({
        method: "GET",
        path: "/repos/Hyper-Accel/hyper-accel.github.io/pulls",
        status: 401,
      })
      await page.locator("[data-site-save]").click()
      await page.locator("dialog[open]").waitFor()
      await login(page)
      await page.locator("dialog:not([open])").waitFor({ state: "attached" })
      assert.equal(await beforeUnauthorized.evaluate((field) => field.isConnected), true)

      // Paste an uncommitted image, then preserve A's real Blob/cursor snapshot.
      await body(page, "en").focus()
      await body(page, "en").evaluate(async (target) => {
        const canvas = document.createElement("canvas")
        canvas.width = 64
        canvas.height = 64
        const drawing = canvas.getContext("2d")
        if (!drawing) throw new Error("Canvas unavailable")
        drawing.fillStyle = "#009ee2"
        drawing.fillRect(0, 0, 64, 64)
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) => (value ? resolve(value) : reject(new Error("PNG unavailable"))),
            "image/png",
          ),
        )
        const transfer = new DataTransfer()
        transfer.items.add(new File([blob], "pending.png", { type: "image/png" }))
        target.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
        )
      })
      await body(page, "en").locator("figure[data-onsite-image] > img").waitFor()
      await page.locator('[data-site-save-status][data-state="saved"]').waitFor()

      // Toolbox (도구상자), library and mobile preview panels.
      await clickTool(page, "[data-tool=divider]")
      await body(page, "en").locator("hr").waitFor()
      await clickTool(page, "[data-panel=라이브러리]")
      const pasted = page.locator(".composer-library__item", { hasText: "pasted-" })
      await pasted.waitFor()
      assert.equal(await pasted.getAttribute("data-state"), "used")
      assert.match((await pasted.innerText()).replace(/\s+/g, " "), /본문에 있음 · 저장 전/)
      await clickTool(page, "[data-panel=모바일]")
      await page.locator(".composer-panel[aria-label='이 글의 그림']").waitFor({ state: "hidden" })
      const phone = page.frameLocator(".composer-preview__frame")
      await phone.locator(".post-content", { hasText: `English revision ${width}` }).waitFor()
      assert.ok((await phone.locator(".post-content img").count()) >= 1)
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        "panel overflow",
      )
      await page.screenshot({ path: join(artifacts, `${width}-mobile-preview.png`) })
      await page.locator(".composer-panel--preview .composer-panel__close").click()
      await page.locator(".composer-panel--preview").waitFor({ state: "hidden" })
      await page.locator('[data-site-save-status][data-state="saved"]').waitFor()
      await body(page, "en").click({ position: { x: 20, y: 15 } })
      await body(page, "en").press("ControlOrMeta+Home")
      await body(page, "en").press("ArrowRight")
      await body(page, "en").press("Shift+ArrowRight")
      await page
        .locator(
          '[data-site-save-status][data-state="saved"][data-language="en"][data-selection="range"]',
        )
        .waitFor()
      const before = await stored(page, slug)
      assert.ok(before.image.length)
      const text = await body(page, "en").innerText()
      const node = await body(page, "en").elementHandle()
      assert.ok(node)
      clockTime += 28_800_001
      await page.clock.setFixedTime(clockTime)
      await page.evaluate(() => window.dispatchEvent(new Event("focus")))
      await page.locator("dialog[open]").waitFor()
      await page.screenshot({ path: join(artifacts, `${width}-expired.png`), fullPage: true })
      const restored = page.evaluate(
        () =>
          new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Draft restore event missing")), 15000)
            document.querySelector("#site-screen")?.addEventListener(
              "onsite:draft-restored",
              () => {
                clearTimeout(timer)
                resolve()
              },
              { once: true },
            )
          }),
      )
      await login(page)
      await restored
      assert.equal(await node.evaluate((field) => field.isConnected), true)
      assert.equal(await body(page, "en").innerText(), text)
      assert.deepEqual(await stored(page, slug), before)

      await page.reload()
      // The tab keeps its login across a reload (sessionStorage), so the editor reopens directly.
      await page.locator(".composer[data-mode=edit]").waitFor()
      assert.equal(await page.locator("dialog[open]").count(), 0)
      await body(page, "en").locator("figure[data-onsite-image] > img").waitFor()
      await body(page, "en").locator(".onsite-math-inline .katex").waitFor()
      const reloadedText = await body(page, "en").innerText()
      assert.ok(
        reloadedText.includes(`English revision ${width}`),
        await body(page, "en").evaluate((root) => root.innerHTML.slice(0, 1200)),
      )
      assert.deepEqual(await stored(page, slug), before)
      await page.locator("[data-site-save]").click()
      await page.locator("[data-site-save-status][data-remote-head]").waitFor()
      // Review is requested from the editor itself, and the author stays in the editor.
      const reviewFlow = page.locator('.composer [data-action="request-review"]')
      await reviewFlow.click()
      await page
        .locator('.composer [data-action="request-review"]', { hasText: "리뷰 중" })
        .waitFor()
      assert.equal(harness.github.state.pulls.get(pullNumber)?.draft, false)
      assert.equal(await page.locator(".composer[data-mode=edit]").count(), 1)

      const reviewer = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        isMobile: width === 390,
        hasTouch: width === 390,
      })
      reviewer.on("page", (opened) => opened.on("pageerror", (error) => errors.push(error.message)))
      await reviewer.addCookies([{ name: "onsite-dev-user", value: "reviewer", url: harness.url }])
      try {
        const reviewPage = await reviewer.newPage()
        // An older review address opens the same editor, read-only.
        await reviewPage.goto(`${harness.url}/editor-new/?draft=${slug}&review=${pullNumber}`)
        await reviewPage.locator("dialog[open]").waitFor()
        await login(reviewPage)
        await reviewPage.locator('.composer[data-mode=edit][data-readonly="true"]').waitFor()
        // A comment anchors to text, not across an inline formula: drag over the paragraph's words.
        const paragraph = reviewPage.locator(".composer .ProseMirror > p").first()
        await paragraph.scrollIntoViewIfNeeded()
        const words = await paragraph.evaluate((element) => {
          const text = [...element.childNodes].find(
            (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "",
          )
          if (!text) return null
          const range = document.createRange()
          range.selectNodeContents(text)
          const rect = range.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        })
        assert.ok(words)
        await reviewPage.mouse.move(words.x + 1, words.y + words.height / 2)
        await reviewPage.mouse.down()
        await reviewPage.mouse.move(words.x + words.width - 1, words.y + words.height / 2, {
          steps: 8,
        })
        await reviewPage.mouse.up()
        // A read-only selection offers only 댓글.
        await reviewPage
          .locator('.composer-bubble[data-readonly="true"] button[aria-label="댓글"]')
          .click()
        await reviewPage.locator('textarea[aria-label="댓글"]').fill("Integration range comment")
        await reviewPage.getByRole("button", { name: "댓글 달기", exact: true }).click()
        // The form closes once GitHub has the comment.
        await reviewPage.locator('textarea[aria-label="댓글"]').waitFor({ state: "hidden" })
        assert.ok(
          [...harness.github.state.comments.values()].some((comment) =>
            JSON.stringify(comment).includes("Integration range comment"),
          ),
        )
        const approve = reviewPage.locator('[data-action="approve"]')
        await approve.click()
        await reviewPage.locator('[data-action="approve"]', { hasText: "승인됨" }).waitFor()
        await reviewPage.screenshot({
          path: join(artifacts, `${width}-approved.png`),
          fullPage: true,
        })
        // Back in the author's editor, the same dock button now publishes.
        await page.evaluate(() => window.dispatchEvent(new Event("focus")))
        await page.locator('.composer [data-action="request-review"]', { hasText: "게시" }).click()
        await page
          .locator('.composer [data-action="request-review"]', { hasText: "게시됨" })
          .waitFor()
        assert.equal(harness.github.state.pulls.get(pullNumber)?.merged, true)
      } finally {
        await reviewer.close()
      }
      // Real legacy copy: repair operations persist before a PostBundle exists.
      // A published post is edited on its own page.
      await page.goto(`${harness.url}/posts/crafting-compilers/?edit`)
      await page.locator(".composer[data-mode=repair]").waitFor()
      await language(page, "en")
      await page.locator('.composer-cell[data-lang=en] [data-op="insert"]').first().click()
      await page
        .locator('[data-site-save-status][data-state="saved"][data-repair-sequence]')
        .waitFor()
      const repairBefore = await repairState(page)
      assert.ok(repairBefore)
      clockTime += 28_800_001
      await page.clock.setFixedTime(clockTime)
      await page.evaluate(() => window.dispatchEvent(new Event("focus")))
      await page.locator("dialog[open]").waitFor()
      await login(page)
      await page.locator("dialog:not([open])").waitFor({ state: "attached" })
      assert.deepEqual(await repairState(page), repairBefore)
      await page.reload()
      // The tab keeps its login across a reload (sessionStorage), so no second login is needed.
      await page.locator(".composer[data-mode=repair]").waitFor()
      assert.deepEqual(await repairState(page), repairBefore)
      await page.screenshot({
        path: join(artifacts, `${width}-repair-restored.png`),
        fullPage: true,
      })
      await page.locator('[data-action="finish-repair"]').click()
      await page.locator(".composer[data-mode=edit]").waitFor()
      await page.locator('[data-site-save-status][data-state="saved"]').waitFor()
      assert.equal(await repairState(page), null)
      assert.deepEqual(errors, [])
      console.info(`Integrated new-post/save/restore/review/publish flow passed at ${width}.`)
    } finally {
      await context.close()
      harness.stop()
    }
  }
  console.info(`Site flow screenshots: ${artifacts}`)
} finally {
  await browser.close()
}
