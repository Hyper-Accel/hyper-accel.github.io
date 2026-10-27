import assert from "node:assert/strict"
import { copyFile, mkdir, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { chromium, type Page } from "playwright"
import { parse } from "yaml"
import { prepareCommand } from "../server/process-command"

const editorRoot = resolve(import.meta.dir, "../..")
const root = resolve(editorRoot, "../..")
const suffix = crypto.randomUUID().slice(0, 8)
const slugs = [`cover-save-a-${suffix}`, `cover-save-b-${suffix}`]
const paths = slugs.map((slug) => `content/posts/${slug}/index.md`)
const source = `---
date: '2025-08-27T12:00:00+09:00'
title: 'Cover save regression'
authors: ["Jaewon Lim"]
cover: {image: cover.png, alt: old alt, relative: true}
---

<!-- keep editorial comment -->

| Column A | Column B |
| --- | --- |
| keep | exact |

Body with trailing whitespace${"  "}


`
const mode = process.argv[2] ?? "all"
assert(["all", "body", "session"].includes(mode))
const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() })
const port = probe.port
probe.stop(true)
const server = Bun.spawn(prepareCommand(["bun", "src/server/index.ts"]), {
  cwd: editorRoot,
  env: { ...process.env, TECHBLOG_EDITOR_API_PORT: String(port) },
  stdout: "ignore",
  stderr: "inherit",
})
const url = `http://127.0.0.1:${port}`
const directories: string[] = []
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
let releaseSave: (() => void) | undefined

function body(markdown: string): string {
  const separator = "\n---\n"
  const offset = markdown.indexOf(separator)
  assert(offset >= 0)
  return markdown.slice(offset + separator.length)
}
async function readA() {
  const text = await Bun.file(join(root, paths[0] ?? "")).text()
  return { text, frontmatter: parse(text.split("---")[1] ?? "") }
}
async function waitForPost(page: Page, slug: string): Promise<void> {
  await page.waitForFunction(
    (name) => document.querySelector("#document-kicker")?.textContent === `${name} / KO`,
    slug,
  )
}
async function save(page: Page): Promise<void> {
  const response = page.waitForResponse(
    (result) =>
      new URL(result.url()).pathname === "/api/post" && result.request().method() === "PUT",
  )
  await page.locator("#save-button").click()
  assert((await response).ok())
  await page.waitForFunction(
    () =>
      document.querySelector("#save-state")?.textContent === "모든 변경 저장됨" &&
      document.querySelector<HTMLButtonElement>("#cover-select")?.disabled === false,
  )
}

try {
  for (let attempt = 0; attempt < 100; attempt++) {
    assert(server.exitCode === null, "server exited before becoming ready")
    try {
      if ((await fetch(`${url}/api/authors`)).ok) break
    } catch (error: unknown) {
      if (attempt === 99) throw error
    }
    await Bun.sleep(100)
  }
  for (const slug of slugs) {
    const directory = join(root, "content/posts", slug)
    await mkdir(directory)
    directories.push(directory)
    await Bun.write(join(directory, "index.md"), source)
    await Bun.write(join(directory, "index.en.md"), source)
    await copyFile(
      join(root, "content/posts/arc-setup-guide/arc-architecture.png"),
      join(directory, "cover.png"),
    )
  }
  browser = await chromium.launch({ channel: "chrome", headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.route("**/api/posts", async (route) => {
    const response = await route.fetch()
    const payload = (await response.json()) as { posts: { path: string }[] }
    await route.fulfill({
      response,
      json: { posts: payload.posts.filter((post) => paths.includes(post.path)) },
    })
  })
  await page.goto(url, { waitUntil: "networkidle" })
  await page.locator(`[data-path="${paths[0]}"]`).click()
  await waitForPost(page, slugs[0] ?? "")
  await page.waitForFunction(
    () => document.querySelector<HTMLButtonElement>("#cover-select")?.disabled === false,
  )

  if (mode !== "session") {
    await page.locator("#cover-alt").fill("cover-only change")
    await save(page)
    assert.equal(
      body((await readA()).text),
      body(source),
      "cover-only save must preserve comments, tables and exact body whitespace",
    )
    await page.locator("#post-title").fill("Title-only change")
    await save(page)
    assert.equal(
      body((await readA()).text),
      body(source),
      "title-only save must preserve the unedited body",
    )
    assert.equal(await Bun.file(join(directories[0] ?? "", "index.en.md")).text(), source)
    await page.locator(".ProseMirror p").last().click()
    await page.keyboard.press("End")
    await page.keyboard.press("Enter")
    await page.keyboard.type("An actual body edit must still be saved.")
    await save(page)
    assert(body((await readA()).text).includes("An actual body edit must still be saved."))
  }

  if (mode !== "body") {
    let signalStarted: (() => void) | undefined
    const started = new Promise<void>((resolveStarted) => {
      signalStarted = resolveStarted
    })
    const gate = new Promise<void>((resolveGate) => {
      releaseSave = resolveGate
    })
    await page.route(
      "**/api/post",
      async (route) => {
        assert.equal(route.request().method(), "PUT")
        signalStarted?.()
        await gate
        await route.continue()
      },
      { times: 1 },
    )
    await page.locator("#cover-alt").fill("saved after returning to A")
    await page.locator("#save-button").click()
    await started
    page.on("dialog", (dialog) => dialog.accept())
    await page.locator(`[data-path="${paths[1]}"]`).click()
    await waitForPost(page, slugs[1] ?? "")
    await page.locator(`[data-path="${paths[0]}"]`).click()
    await waitForPost(page, slugs[0] ?? "")
    assert.notEqual(await page.locator("#cover-alt").inputValue(), "saved after returning to A")
    const response = page.waitForResponse(
      (result) =>
        new URL(result.url()).pathname === "/api/post" && result.request().method() === "PUT",
    )
    assert(releaseSave)
    releaseSave()
    assert((await response).ok())
    await page.waitForFunction(
      () =>
        document.querySelector("#save-state")?.textContent === "모든 변경 저장됨" &&
        document.querySelector<HTMLButtonElement>("#cover-select")?.disabled === false,
    )
    assert.equal((await readA()).frontmatter.cover.alt, "saved after returning to A")
    assert.equal(
      await page.locator("#cover-alt").inputValue(),
      "saved after returning to A",
      "same-path reopened session must not report saved with stale cover UI",
    )
    await page.locator("#cover-alt").fill("next save has a current revision")
    await save(page)
    assert.equal((await readA()).frontmatter.cover.alt, "next save has a current revision")
  }
  console.log(
    JSON.stringify({
      status: "passed",
      mode,
      checks:
        mode === "body"
          ? ["cover/title-only byte-exact body preservation", "translation preservation"]
          : mode === "session"
            ? ["delayed-save A-B-A reconciliation", "next save uses current revision"]
            : [
                "cover/title-only byte-exact body preservation",
                "translation preservation",
                "delayed-save A-B-A reconciliation",
                "next save uses current revision",
              ],
    }),
  )
} finally {
  releaseSave?.()
  try {
    await browser?.close()
  } finally {
    server.kill()
    await server.exited
    await Promise.all(
      directories.map((directory) => rm(directory, { recursive: true, force: true })),
    )
  }
}
