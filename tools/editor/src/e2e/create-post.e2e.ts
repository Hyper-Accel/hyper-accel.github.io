import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { chromium, type Page } from "playwright"
import { parse } from "yaml"
import { prepareCommand } from "../server/process-command"

const editorRoot = resolve(import.meta.dir, "../..")
const repositoryRoot = resolve(editorRoot, "../..")
const suffix = crypto.randomUUID().slice(0, 8)
const knownSlug = `editor-create-known-${suffix}`
const newSlug = `editor-create-new-${suffix}`
const author = `E2E Editor Author ${suffix}`
const artifacts = join(tmpdir(), `editor-create-post-${suffix}`)
const portProbe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() })
const port = String(portProbe.port)
portProbe.stop(true)
const url = `http://127.0.0.1:${port}`
const ownedDirectories: string[] = []
const server = Bun.spawn(prepareCommand(["bun", "src/server/index.ts"]), {
  cwd: editorRoot,
  env: { ...process.env, TECHBLOG_EDITOR_API_PORT: port },
  stdout: "ignore",
  stderr: "inherit",
})

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`서버 종료: ${server.exitCode}`)
    try {
      if ((await fetch(`${url}/api/authors`)).ok) return
    } catch (error: unknown) {
      if (attempt === 99) throw error
    }
    await Bun.sleep(100)
  }
  throw new Error("테스트 서버 시작 시간 초과")
}

async function openDialog(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const rail = document.querySelector("#post-rail")
    return matchMedia("(max-width: 980px)").matches
      ? rail?.hasAttribute("aria-hidden")
      : !rail?.hasAttribute("aria-hidden")
  })
  if (await page.locator("#rail-open").isVisible()) {
    if ((await page.locator("#post-rail").getAttribute("aria-hidden")) === "true") {
      await page.locator("#rail-open").click()
    }
  }
  await page.locator("#new-post-button").click()
  await page.locator("#create-post-dialog[open]").waitFor()
  await page.waitForFunction(
    () => document.querySelector("#create-post-form")?.getAttribute("aria-busy") === "false",
  )
}

async function checkAuthor(page: Page): Promise<void> {
  await page.locator("#check-author-button").click()
  await page.waitForFunction(
    () => document.querySelector("#create-post-form")?.getAttribute("aria-busy") === "false",
  )
}

async function fillBase(page: Page, directory: string, name: string): Promise<void> {
  await page.locator("#new-post-directory").fill(directory)
  await page.locator("#new-post-title").fill('새 글: "생성" 검증')
  await page.locator("#new-post-author").fill(name)
}

async function assertDialogFits(page: Page): Promise<void> {
  assert(
    await page.locator("#create-post-dialog").evaluate((element) => {
      const box = element.getBoundingClientRect()
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
    }),
    "dialog must fit viewport",
  )
}

await mkdir(artifacts, { recursive: true })
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  await waitForServer()
  for (const path of [
    `content/posts/${knownSlug}`,
    `content/posts/${newSlug}`,
    `content/authors/${author}`,
  ]) {
    assert(!existsSync(join(repositoryRoot, path)), `fixture already exists: ${path}`)
    ownedDirectories.push(join(repositoryRoot, path))
  }
  browser = await chromium.launch({ channel: "chrome", headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors: string[] = []
  let postWrites = 0
  let authorWrites = 0
  let authorLookups = 0
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname
    if (path === "/api/posts" && request.method() === "POST") postWrites++
    if (path === "/api/authors" && request.method() === "POST") authorWrites++
    if (path === "/api/authors" && request.method() === "GET") authorLookups++
  })
  page.on("pageerror", (error) => pageErrors.push(error.message))
  await page.goto(url, { waitUntil: "networkidle" })
  await page.locator("#post-title").waitFor()

  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 900 })
    await openDialog(page)
    assert.equal(await page.locator("#create-post-fields input:visible").count(), 3)
    assert(await page.locator("#create-post-submit").isDisabled())
    assert(await page.locator("#check-author-button").isDisabled())
    assert(!(await page.locator("#new-author-fields").isVisible()))
    await assertDialogFits(page)
    await page.screenshot({ path: join(artifacts, `initial-${width}.png`) })
    await page.keyboard.press("Escape")
    assert(!(await page.locator("#create-post-dialog").isVisible()))
    assert(
      await page
        .locator("#new-post-button")
        .evaluate((button) => document.activeElement === button),
    )
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await openDialog(page)
  await page.locator("#new-post-author").fill("jaewon lim")
  await checkAuthor(page)
  assert((await page.locator("#new-post-author-status").textContent())?.includes("Jaewon Lim"))
  assert(!(await page.locator("#new-author-fields").isVisible()))
  assert(await page.locator("#create-post-submit").isDisabled())
  await page.locator("#new-post-author").fill("Jaewon Lim")
  await page.locator("#new-post-author").press("Enter")
  assert.equal(postWrites, 0)
  assert.equal(authorWrites, 0)
  await checkAuthor(page)
  assert(await page.locator("#create-post-submit").isEnabled())
  assert.equal(postWrites, 0)
  assert.equal(authorWrites, 0)
  await fillBase(page, knownSlug, "Jaewon Lim")
  assert(await page.locator("#create-post-submit").isDisabled())
  await checkAuthor(page)
  await page.locator("#new-post-directory").fill("../escape")
  await page.locator("#create-post-submit").click()
  assert(
    await page
      .locator("#new-post-directory")
      .evaluate((input) => !(input as HTMLInputElement).validity.valid),
  )
  assert(await page.locator("#create-post-dialog").isVisible())
  await page.locator("#new-post-directory").fill(knownSlug)
  const lookupsBeforeCreate = authorLookups
  await page.locator("#create-post-submit").click()
  await page.waitForFunction(
    (slug) => document.querySelector("#document-kicker")?.textContent === `${slug} / KO`,
    knownSlug,
  )
  assert.equal(authorLookups, lookupsBeforeCreate, "post creation must not perform author lookup")
  const originalKnown = await Bun.file(
    join(repositoryRoot, `content/posts/${knownSlug}/index.md`),
  ).text()
  const knownMetadata = parse(originalKnown.split("---")[1] ?? "")
  assert.deepEqual(knownMetadata.authors, ["Jaewon Lim"])
  assert.equal(knownMetadata.title, '새 글: "생성" 검증')
  assert(await Bun.file(join(repositoryRoot, `content/posts/${knownSlug}/index.en.md`)).exists())
  assert(!(await page.locator("#new-author-fields").isVisible()))

  await openDialog(page)
  await fillBase(page, knownSlug, "Jaewon Lim")
  await checkAuthor(page)
  await page.locator("#create-post-submit").click()
  await page.locator("#create-post-error:not([hidden])").waitFor()
  assert.equal(
    await Bun.file(join(repositoryRoot, `content/posts/${knownSlug}/index.md`)).text(),
    originalKnown,
  )
  await page.locator("#create-post-cancel").click()

  await page.route(
    "**/api/authors",
    (route) => route.fulfill({ status: 500, json: { error: "저자 조회 테스트 오류" } }),
    { times: 1 },
  )
  await openDialog(page)
  await page.getByText("저자 조회 테스트 오류", { exact: true }).waitFor()
  await fillBase(page, newSlug, author)
  await checkAuthor(page)
  await page.locator("#new-author-fields:not([hidden])").waitFor()
  assert(!(await Bun.file(join(repositoryRoot, `content/posts/${newSlug}/index.md`)).exists()))
  assert(await page.locator("#create-post-submit").isDisabled())
  await page.locator("#register-author-button").click()
  assert(await page.locator("#create-post-dialog").isVisible())
  assert(
    await page
      .locator("#new-author-bio-ko")
      .evaluate((input) => !(input as HTMLTextAreaElement).validity.valid),
  )
  assert(!(await Bun.file(join(repositoryRoot, `content/posts/${newSlug}/index.md`)).exists()))
  await page.locator("#new-author-bio-ko").fill("검증 엔지니어입니다.")
  await page.locator("#new-author-bio-en").fill("Verification engineer.")
  await page.locator("#new-author-github").fill("https://github.com/example")
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 900 })
    await assertDialogFits(page)
    await page.locator("#create-post-dialog").evaluate((dialog) => {
      dialog.scrollTop = 0
    })
    await page.screenshot({ path: join(artifacts, `new-author-${width}.png`) })
    await page.locator("#register-author-button").scrollIntoViewIfNeeded()
    assert(
      await page.locator("#register-author-button").evaluate((button) => {
        const box = button.getBoundingClientRect()
        return box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth
      }),
      "author registration must be reachable inside the scrollable dialog",
    )
    await page.screenshot({ path: join(artifacts, `new-author-bottom-${width}.png`) })
  }
  // Changing to an existing author must immediately remove extra required fields.
  await page.locator("#new-post-author").fill("Jaewon Lim")
  assert(!(await page.locator("#new-author-fields").isVisible()))
  assert(await page.locator("#create-post-submit").isDisabled())
  await checkAuthor(page)
  assert(await page.locator("#create-post-submit").isEnabled())
  await page.locator("#new-post-author").fill(author)
  assert(await page.locator("#create-post-submit").isDisabled())
  await checkAuthor(page)
  await page.locator("#new-author-fields:not([hidden])").waitFor()
  assert.equal(await page.locator("#new-author-bio-ko").inputValue(), "")
  await page.locator("#new-author-bio-ko").fill("검증 엔지니어입니다.")
  await page.locator("#new-author-bio-en").fill("Verification engineer.")
  await page.locator("#new-author-github").fill("https://github.com/example")
  // Author registration works even when required post metadata is empty.
  await page.locator("#new-post-directory").fill("")
  await page.locator("#new-post-title").fill("")
  await page.route(
    "**/api/authors",
    (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({ status: 503, json: { error: "저자 추가 테스트 오류" } })
      }
      return route.continue()
    },
    { times: 1 },
  )
  await page.locator("#register-author-button").click()
  await page.getByText("저자 추가 테스트 오류", { exact: true }).waitFor()
  assert(await page.locator("#create-post-submit").isDisabled())
  assert(!existsSync(join(repositoryRoot, `content/authors/${author}`)))
  await page.locator("#register-author-button").click()
  await page.waitForFunction(
    () => !document.querySelector<HTMLButtonElement>("#create-post-submit")?.disabled,
  )
  assert(!existsSync(join(repositoryRoot, `content/posts/${newSlug}`)))
  assert(!(await page.locator("#new-author-fields").isVisible()))
  for (const language of ["", ".en"]) {
    const source = await Bun.file(
      join(repositoryRoot, `content/authors/${author}/_index${language}.md`),
    ).text()
    const metadata = parse(source.split("---")[1] ?? "")
    assert.equal(metadata.title, author)
    assert.equal(metadata.bio, language ? "Verification engineer." : "검증 엔지니어입니다.")
    assert.equal(metadata.github, "https://github.com/example")
  }
  // Registered author survives cancellation and is selectable as an existing author.
  await page.locator("#create-post-cancel").click()
  await openDialog(page)
  await fillBase(page, newSlug, author)
  assert(await page.locator("#create-post-submit").isDisabled())
  await checkAuthor(page)
  assert(!(await page.locator("#new-author-fields").isVisible()))
  await page.locator("#create-post-submit").click()
  await page.waitForFunction(
    (slug) => document.querySelector("#document-kicker")?.textContent === `${slug} / KO`,
    newSlug,
  )
  const english = parse(
    (await Bun.file(join(repositoryRoot, `content/posts/${newSlug}/index.en.md`)).text()).split(
      "---",
    )[1] ?? "",
  )
  assert.deepEqual(english.authors, [author])

  // Refusing the save prompt must preserve dirty text and not open the create dialog.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.locator("#post-title").fill("저장되지 않은 제목")
  page.once("dialog", (dialog) => void dialog.dismiss())
  await page.locator("#new-post-button").click()
  assert(!(await page.locator("#create-post-dialog").isVisible()))
  assert.equal(await page.locator("#post-title").inputValue(), "저장되지 않은 제목")
  page.once("dialog", (dialog) => void dialog.accept())
  await openDialog(page)
  const saved = parse(
    (await Bun.file(join(repositoryRoot, `content/posts/${newSlug}/index.md`)).text()).split(
      "---",
    )[1] ?? "",
  )
  assert.equal(saved.title, "저장되지 않은 제목")
  await page.locator("#create-post-cancel").click()
  assert.equal(pageErrors.length, 0, pageErrors.join("\n"))
  console.log(
    JSON.stringify(
      {
        status: "passed",
        artifacts,
        checks: [
          "three initial inputs",
          "known author",
          "explicit author check before creation",
          "changing author invalidates verification",
          "near-match author spelling guidance",
          "no author writes during name check",
          "standalone author registration and error retry",
          "registered author survives post cancellation",
          "bilingual post files",
          "duplicate protection",
          "lookup error retry",
          "conditional author profile",
          "bilingual profiles",
          "existing-author switch",
          "dirty-content preservation",
          "Escape/focus restoration",
          "1440/768/375 viewport bounds",
          "no browser runtime errors",
        ],
      },
      null,
      2,
    ),
  )
} finally {
  await browser?.close()
  server.kill()
  await server.exited
  await Promise.all(ownedDirectories.map((path) => rm(path, { recursive: true, force: true })))
}
