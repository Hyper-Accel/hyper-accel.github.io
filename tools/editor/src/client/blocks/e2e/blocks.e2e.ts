import { strict as assert } from "node:assert"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve, sep } from "node:path"
import { type Browser, chromium, type Page } from "playwright"
import { build } from "vite"
import { markdown, noOverflow, open } from "./block-checks"
import { checkImageLayouts } from "./image-layouts"
import { checkNewSyntax } from "./new-syntax"
import { checkTabEditing } from "./tab-editing"

const harnessDir = resolve(import.meta.dir, "harness")
const fixturesDir = resolve(import.meta.dir, "../../../shared/onsite/fixtures")
const output = await mkdtemp(join(tmpdir(), "onsite-blocks-harness-"))
const artifacts = await mkdtemp(join(tmpdir(), "onsite-blocks-e2e-"))

await build({
  configFile: false,
  root: harnessDir,
  base: "/",
  logLevel: "warn",
  build: { outDir: output, emptyOutDir: true },
})

function fileFor(pathname: string) {
  if (pathname === "/favicon.ico") {
    return null
  }
  if (pathname.startsWith("/fixtures/")) {
    const absolute = resolve(fixturesDir, `.${pathname.slice("/fixtures".length)}`)
    return absolute.startsWith(`${fixturesDir}${sep}`) ? Bun.file(absolute) : null
  }
  const absolute = resolve(output, `.${pathname === "/" ? "/index.html" : pathname}`)
  return absolute.startsWith(`${output}${sep}`) ? Bun.file(absolute) : null
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const file = fileFor(decodeURIComponent(new URL(request.url).pathname))
    if (!file) {
      return new Response(null, { status: 204 })
    }
    return (await file.exists()) ? new Response(file) : new Response(null, { status: 404 })
  },
})

/** Appends an empty paragraph, focuses it, and waits for the (rAF-delayed) DOM focus to land there. */
async function focusNewLastParagraph(page: Page): Promise<void> {
  await page.evaluate(() => {
    const { editor } = window.harness
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph" })
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
  })
  await page.locator(".ProseMirror > p").last().click()
  await page.waitForFunction(() => {
    const selection = document.getSelection()
    const last = document.querySelector(".ProseMirror")?.lastElementChild
    return (
      window.harness.editor.isFocused &&
      !!selection?.anchorNode &&
      !!last &&
      last.contains(selection.anchorNode)
    )
  })
}

async function checkInteractiveBlocks(page: Page, width: number): Promise<void> {
  await open(page, "interactive-blocks")
  assert.equal(await page.locator(".onsite-steps > ol > li").count(), 2)
  assert.equal(await page.locator(".onsite-compare[data-start='50']").count(), 1)
  assert.equal(await page.locator(".onsite-tabs .tabs-tab[role='tab']").count(), 2)
  assert.equal(await page.locator(".onsite-tabs .tabs-panel[hidden]").count(), 1)
  for (const type of ["note", "tip", "important", "warning", "caution"]) {
    assert.equal(await page.locator(`.onsite-alert.alert-${type}`).count(), 1, type)
  }
  await page.screenshot({
    path: join(artifacts, `${width}-interactive-blocks.png`),
    fullPage: true,
  })

  await checkTabEditing(page, artifacts, width)

  // The callout is edited in place: the type label opens the type list, the title is typed
  // straight into the title line.
  const alert = page.locator(".onsite-alert").first()
  await alert.locator(".alert-body p").first().click()
  await alert.locator(".onsite-alert__type").click()
  await page.locator(".onsite-alert-types:not([hidden]) [role='option'][data-type='TIP']").click()
  await page.locator(".onsite-alert.alert-tip").first().waitFor()
  await alert.locator(".alert-body p").first().click()
  await alert.locator(".onsite-alert__heading").click()
  // Select-all stays inside the title; typing replaces the existing title.
  await page.keyboard.press("ControlOrMeta+a")
  await page.keyboard.type("제목 변경")
  await page.keyboard.press("Enter")
  await page.waitForFunction(() =>
    window.harness.editor.getMarkdown().includes("> [!TIP] 제목 변경"),
  )
  assert.ok((await markdown(page)).includes("> [!TIP] 제목 변경\n> 검증할 내용입니다."))

  await page.locator(".onsite-compare .compare-range").focus()
  await page.keyboard.press("ArrowRight")
  await page.locator(".onsite-compare[data-start='51']").waitFor()
  assert.ok((await markdown(page)).includes('{{< compare caption="전후 비교" start="51" >}}'))

  await focusNewLastParagraph(page)
  await page.keyboard.type("/")
  await page.locator(".onsite-slash:not([hidden]) .onsite-slash__item").first().waitFor()
  // Blocks plus headings, lists, table, quote, code and divider (Confluence-style insert menu).
  // Rows of pictures are made by putting a picture beside another, so there is no row item.
  assert.equal(await page.locator(".onsite-slash__item").count(), 19)
  await page.keyboard.press("Escape")
  await page.locator(".onsite-slash[hidden]").waitFor({ state: "attached" })
  await page.keyboard.type("탭")
  await page.locator(".onsite-slash[hidden]").waitFor({ state: "attached" })
  await page.keyboard.press("Enter")
  await page.keyboard.type("/탭")
  await page.locator(".onsite-slash:not([hidden]) .onsite-slash__item[data-item='tabs']").waitFor()
  assert.equal(await page.locator(".onsite-slash__item").count(), 1)
  await page.screenshot({ path: join(artifacts, `${width}-slash-menu.png`) })
  await page.keyboard.press("Enter")
  await page.locator(".onsite-tabs").nth(1).waitFor()
  assert.ok(
    (await markdown(page)).endsWith(
      '{{< tabs >}}\n{{< tab name="탭 1" >}}\n{{< /tab >}}\n{{< tab name="탭 2" >}}\n{{< /tab >}}\n{{< /tabs >}}',
    ),
  )
  await page.keyboard.type("탭 안 내용")
  assert.ok((await markdown(page)).includes('{{< tab name="탭 1" >}}\n탭 안 내용\n{{< /tab >}}'))
  await focusNewLastParagraph(page)
  await page.keyboard.type("/주의")
  await page
    .locator(".onsite-slash:not([hidden]) .onsite-slash__item[data-item='alert-warning']")
    .waitFor()
  await page.keyboard.press("Enter")
  await page.locator(".onsite-alert.alert-warning").nth(1).waitFor()
  await page.keyboard.type("경고 본문")
  assert.ok((await markdown(page)).endsWith("> [!WARNING]\n> 경고 본문"))
  assert.equal(await noOverflow(page), true, "overflow after edits")
}

async function checkMathAndLegacy(page: Page, width: number): Promise<void> {
  await open(page, "math-and-legacy")
  assert.equal(await page.locator(".onsite-math .katex-display").count(), 1)
  assert.equal(await page.locator(".onsite-math-inline .katex").count(), 1)
  assert.equal(await page.locator(".hugo-shortcode").count(), 2)
  await page.screenshot({ path: join(artifacts, `${width}-math-and-legacy.png`), fullPage: true })

  // A formula is edited in place, still rendered (MathLive), and saved as LaTeX.
  await page.locator(".onsite-math").click()
  await page.locator(".onsite-math.is-selected math-field").waitFor()
  await page.waitForFunction(() => document.activeElement?.tagName === "MATH-FIELD")
  await page.keyboard.press("ControlOrMeta+a")
  await page.keyboard.type("x^2+y^2=z^2")
  await page.waitForFunction(() =>
    window.harness.editor.getMarkdown().includes("$$\nx^2+y^2=z^2\n$$"),
  )
  // The LaTeX switch shows the source; a LaTeX error is reported under the formula.
  await page.locator(".onsite-math.is-selected .onsite-math__toggle").click()
  const source = page.locator(".onsite-math.is-selected textarea")
  await source.fill("x^{2")
  await page.locator(".onsite-math.is-selected [role=alert]", { hasText: "LaTeX 오류" }).waitFor()
  await source.fill("x^2 + y^2 = z^2")
  await page.waitForFunction(() =>
    window.harness.editor.getMarkdown().includes("$$\nx^2 + y^2 = z^2\n$$"),
  )
  await page.keyboard.press("Escape")
  await page.locator(".onsite-math.is-selected").waitFor({ state: "detached" })
  assert.equal(await page.locator(".onsite-math .katex-display").count(), 1)
  await page.screenshot({ path: join(artifacts, `${width}-math-editing.png`) })
  await page.evaluate(() =>
    window.harness.editor.commands.setContent(window.harness.source, { contentType: "markdown" }),
  )
  await page.waitForFunction(() =>
    window.harness.editor.getMarkdown().includes("$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$"),
  )

  await page.locator(".onsite-math-inline").click()
  await page.locator(".onsite-math-inline.is-selected math-field").waitFor()
  await page.locator(".onsite-math-inline.is-selected .onsite-math__toggle").click()
  await page.locator(".onsite-math-inline.is-selected input").fill("E=mc^3")
  await page.waitForFunction(() => window.harness.editor.getMarkdown().includes("$E=mc^3$와"))
  assert.equal(await noOverflow(page), true, "overflow after math edits")
}

async function runWidth(browser: Browser, width: number): Promise<void> {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    isMobile: width === 390,
    hasTouch: width === 390,
    deviceScaleFactor: width === 390 ? 2 : 1,
  })
  const page = await context.newPage()
  await page.route("https://www.youtube.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><body style='margin:0;background:#101010;color:#ddd;display:grid;place-items:center;height:100vh'>YouTube</body>",
    }),
  )
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("request", (request) => {
    if (
      !request.url().startsWith(server.url.origin) &&
      !request.url().startsWith("https://www.youtube.com/embed/")
    ) {
      errors.push(`External request: ${request.url()}`)
    }
  })
  try {
    await page.goto(server.url.origin, { waitUntil: "load" })
    await checkImageLayouts(page, width, artifacts)
    await checkInteractiveBlocks(page, width)
    await checkMathAndLegacy(page, width)
    await checkNewSyntax(page, artifacts, width)
    await open(page, "image-layouts", "light")
    await page.screenshot({
      path: join(artifacts, `${width}-image-layouts-light.png`),
      fullPage: true,
    })
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
  }
}

try {
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    for (const width of [390, 1440]) {
      await runWidth(browser, width)
    }
    console.info(`On-site blocks Chromium checks passed at 390/1440; screenshots: ${artifacts}`)
  } finally {
    await browser.close()
  }
} finally {
  server.stop(true)
}
