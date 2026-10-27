import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { chromium, type Page } from "playwright"
import { parse } from "yaml"
import { prepareCommand } from "../server/process-command"

const editorRoot = resolve(import.meta.dir, "../..")
const root = resolve(editorRoot, "../..")
const suffix = crypto.randomUUID().slice(0, 8)
const slug = `editor-cover-${suffix}`
const legacySlug = `editor-cover-legacy-${suffix}`
const path = `content/posts/${slug}/index.md`
const legacyPath = `content/posts/${legacySlug}/index.md`
const fixture = join(root, dirname(path))
const legacyFixture = join(root, dirname(legacyPath))
const artifacts = join(tmpdir(), `editor-cover-${suffix}`)
const original = `---
# cover fixture comment
date: '2025-08-27T12:00:00+09:00'
title: '대표 이미지 검증 글'
authors: ["Jaewon Lim"]
cover:
  image: '' # preserve image comment
  alt: ''
  relative: true
  caption: '보존할 캡션'
  hiddenInList: true
  hiddenInSingle: false
custom: 'keep'
---

## 대표 이미지 검증

본문은 대표 이미지와 별도로 유지합니다.

${"검증용 본문 문단입니다. 대표 이미지는 본문 밖에서 따로 설정합니다.\n\n".repeat(16)}
`
const english = original.replace(
  "title: '대표 이미지 검증 글'",
  "title: 'Cover verification article'",
)
const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() })
const port = String(probe.port)
probe.stop(true)
const server = Bun.spawn(prepareCommand(["bun", "src/server/index.ts"]), {
  cwd: editorRoot,
  env: { ...process.env, TECHBLOG_EDITOR_API_PORT: port },
  stdout: "ignore",
  stderr: "inherit",
})
const url = `http://127.0.0.1:${port}`

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error("Cover test server exited")
    try {
      if ((await fetch(`${url}/api/authors`)).ok) return
    } catch (error: unknown) {
      if (attempt === 99) throw error
    }
    await Bun.sleep(100)
  }
  throw new Error("Cover test server did not become ready")
}
async function uploaded(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>("#cover-image")
    return (
      document.querySelector("#cover-section")?.getAttribute("aria-busy") === "false" &&
      image?.complete &&
      image.naturalWidth > 0
    )
  })
}
async function save(page: Page): Promise<void> {
  const response = page.waitForResponse(
    (result) =>
      new URL(result.url()).pathname === "/api/post" && result.request().method() === "PUT",
  )
  await page.locator("#save-button").click()
  assert((await response).ok(), "post save must succeed")
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLButtonElement>("#save-button")?.disabled === true &&
      document.querySelector("#save-state")?.textContent === "모든 변경 저장됨",
  )
}
async function metadata() {
  const source = await Bun.file(join(root, path)).text()
  return { source, value: parse(source.split("---")[1] ?? "") }
}

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
let owned = false
let releaseUpload: (() => void) | undefined
try {
  await waitForServer()
  assert(!existsSync(fixture) && !existsSync(legacyFixture), "Refuse to overwrite fixtures")
  await mkdir(fixture)
  owned = true
  await mkdir(legacyFixture)
  await mkdir(artifacts, { recursive: true })
  await Bun.write(join(root, path), original)
  await Bun.write(join(fixture, "index.en.md"), english)
  await Bun.write(
    join(root, legacyPath),
    original
      .replace("image: ''", "image: 'shared-original.png'")
      .replace("alt: ''", "alt: '기존 표지'")
      .replace("relative: true", "relative: false"),
  )
  browser = await chromium.launch({ channel: "chrome", headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 640
    canvas.height = 360
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Canvas 2D context unavailable")
    context.fillStyle = "#2563eb"
    context.fillRect(0, 0, 640, 360)
    context.fillStyle = "#ffffff"
    context.font = "32px sans-serif"
    context.fillText("Representative image", 80, 190)
    const encoded = canvas.toDataURL("image/png").split(",")[1]
    if (!encoded) throw new Error("Canvas image encoding failed")
    return encoded
  })
  const buffer = Buffer.from(png, "base64")
  await Bun.write(join(legacyFixture, "shared-original.png"), buffer)
  await Bun.write(join(fixture, "shared-original.png"), buffer)
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  await page.route("**/api/posts", async (route) => {
    if (route.request().method() !== "GET") return route.continue()
    const response = await route.fetch()
    const payload = (await response.json()) as { posts: { path: string }[] }
    await route.fulfill({
      response,
      json: { posts: payload.posts.filter((post) => [path, legacyPath].includes(post.path)) },
    })
  })
  await page.goto(url, { waitUntil: "networkidle" })
  await page.locator(`[data-path="${path}"]`).click()
  await page.locator("#cover-section").waitFor()
  await page.waitForFunction(
    (slug) =>
      document.querySelector("#document-kicker")?.textContent === `${slug} / KO` &&
      document.querySelector<HTMLButtonElement>("#cover-select")?.disabled === false,
    slug,
  )
  assert(await page.locator("#cover-empty").isVisible())
  assert(!(await page.locator("#cover-remove").isVisible()))
  assert.equal(await page.locator("#cover-settings-button").count(), 0)
  assert(
    await page.locator("#save-button").isDisabled(),
    "showing cover settings must not edit the post",
  )
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(artifacts, "cover-empty-1440.png") })
  await page
    .locator("#cover-file-input")
    .setInputFiles({ name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") })
  await page.locator("#cover-error:not([hidden])").waitFor()
  assert(await page.locator("#cover-empty").isVisible())
  await page.locator("#cover-file-input").setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(1024 * 1024 + 1),
  })
  assert((await page.locator("#cover-error").textContent())?.includes("1MB"))
  await page
    .locator("#cover-file-input")
    .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer })
  await uploaded(page)
  assert.equal(
    (await metadata()).value.cover.image,
    "",
    "upload must not change frontmatter before save",
  )
  await page.locator("#cover-alt").fill("첫 번째 대표 이미지: 파란 도형")
  await save(page)
  const first = await metadata()
  const firstImage = first.value.cover.image as string
  assert(firstImage.startsWith("images/cover-"))
  assert.equal(first.value.cover.alt, "첫 번째 대표 이미지: 파란 도형")
  assert.equal(first.value.cover.relative, true)
  assert.equal(first.value.cover.caption, "보존할 캡션")
  assert.equal(first.value.cover.hiddenInList, true)
  assert.equal(first.value.custom, "keep")
  assert(
    first.source.includes("# cover fixture comment") &&
      first.source.includes("# preserve image comment"),
  )
  assert(first.source.includes("본문은 대표 이미지와 별도로 유지합니다."))
  assert.equal(await Bun.file(join(fixture, "index.en.md")).text(), english)
  assert(await Bun.file(join(fixture, firstImage)).exists())
  await page.reload({ waitUntil: "networkidle" })
  await uploaded(page)
  assert.equal(await page.locator("#cover-alt").inputValue(), "첫 번째 대표 이미지: 파란 도형")
  assert(await page.locator("#save-button").isDisabled())

  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 })
    if (width <= 980) {
      await page.waitForFunction(() => {
        const rail = document.querySelector("#post-rail")
        return (
          rail?.getAttribute("aria-hidden") === "true" && rail.getBoundingClientRect().right <= 1
        )
      })
    }
    assert.equal(await page.locator("#cover-settings-button").count(), 0)
    assert(await page.locator("#save-button").isDisabled())
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.locator("#cover-section").scrollIntoViewIfNeeded()
    assert(
      await page.locator("#cover-section").evaluate((element) => {
        const box = element.getBoundingClientRect()
        return box.left >= 0 && box.right <= innerWidth
      }),
    )
    assert.equal(await page.locator("#cover-select .cover-button-label").isVisible(), true)
    await page.screenshot({ path: join(artifacts, `cover-${width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page
    .locator("#cover-file-input")
    .setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer })
  await uploaded(page)
  await page.locator("#cover-alt").fill("교체한 대표 이미지")
  await save(page)
  const second = await metadata()
  const secondImage = second.value.cover.image as string
  assert.notEqual(secondImage, firstImage)
  assert.equal(second.value.cover.caption, "보존할 캡션")
  assert(await Bun.file(join(fixture, firstImage)).exists())
  await page.route(
    "**/api/cover-image",
    (route) => route.fulfill({ status: 422, json: { error: "대표 이미지 업로드 테스트 오류" } }),
    { times: 1 },
  )
  const previousSrc = await page.locator("#cover-image").getAttribute("src")
  await page
    .locator("#cover-file-input")
    .setInputFiles({ name: "failed.png", mimeType: "image/png", buffer })
  await page.getByText("대표 이미지 업로드 테스트 오류", { exact: true }).waitFor()
  assert.equal(await page.locator("#cover-image").getAttribute("src"), previousSrc)
  assert.equal((await metadata()).source, second.source)

  await page.locator("#cover-alt").fill("저장 실패 후 재시도")
  await page.route(
    "**/api/post",
    (route) => route.fulfill({ status: 422, json: { error: "대표 이미지 저장 테스트 오류" } }),
    { times: 1 },
  )
  await page.locator("#save-button").click()
  await page.getByText("대표 이미지 저장 테스트 오류", { exact: true }).waitFor()
  assert.equal((await metadata()).source, second.source)
  assert(await page.locator("#save-button").isEnabled())
  await save(page)
  const beforeConflict = await metadata()
  const external = beforeConflict.source.replace("custom: 'keep'", "custom: 'external'")
  assert.notEqual(external, beforeConflict.source)
  await Bun.write(join(root, path), external)
  await page.locator("#cover-alt").fill("충돌이 나면 저장하지 않습니다")
  await page.locator("#save-button").click()
  await page.getByText(/다른 작업에서 글이 변경되었습니다/).waitFor()
  assert.equal((await metadata()).source, external)
  assert(await page.locator("#save-button").isEnabled())
  await page.reload({ waitUntil: "networkidle" })
  await uploaded(page)
  await page.locator("#cover-remove").click()
  assert(await page.locator("#cover-empty").isVisible())
  await save(page)
  const removed = await metadata()
  assert(!removed.value.cover.image)
  assert.equal(removed.value.cover.caption, "보존할 캡션")
  assert.equal(removed.value.custom, "external")
  assert(await Bun.file(join(fixture, firstImage)).exists())
  assert(await Bun.file(join(fixture, secondImage)).exists())
  assert.equal(await Bun.file(join(fixture, "index.en.md")).text(), english)

  const gate = new Promise<void>((resolveGate) => {
    releaseUpload = resolveGate
  })
  let reportStarted!: () => void
  const started = new Promise<void>((resolveStarted) => {
    reportStarted = resolveStarted
  })
  await page.route(
    "**/api/cover-image",
    async (route) => {
      reportStarted()
      await gate
      await route.continue()
    },
    { times: 1 },
  )
  await page
    .locator("#cover-file-input")
    .setInputFiles({ name: "delayed.png", mimeType: "image/png", buffer })
  await started
  assert(await page.locator("#save-button").isDisabled())
  await page.locator(`[data-path="${legacyPath}"]`).click()
  await page.waitForFunction(
    (slug) => document.querySelector("#document-kicker")?.textContent === `${slug} / KO`,
    legacySlug,
  )
  const completed = page.waitForResponse((response) => response.url().endsWith("/api/cover-image"))
  assert(releaseUpload)
  releaseUpload()
  await completed
  await uploaded(page)
  assert.equal(await page.locator("#cover-alt").inputValue(), "기존 표지")
  assert(await page.locator("#save-button").isDisabled())
  assert.equal(pageErrors.length, 0, pageErrors.join("\n"))
  console.log(
    JSON.stringify(
      {
        status: "passed",
        artifacts,
        checks: [
          "empty state",
          "format/size validation",
          "upload before save",
          "cover/alt persistence and reload",
          "caption/flags/comments preserved",
          "translation untouched",
          "1440/768/375 layout",
          "no top-bar cover shortcut at any viewport",
          "replacement preserves assets",
          "failed upload preserves previous cover",
          "save error retry",
          "real revision conflict",
          "removal preserves files",
          "stale upload ignored after post switch",
          "legacy relative:false bundle preview",
          "no browser errors",
        ],
      },
      null,
      2,
    ),
  )
} finally {
  releaseUpload?.()
  try {
    await browser?.close()
  } finally {
    server.kill()
    await server.exited
    if (owned)
      await Promise.all(
        [fixture, legacyFixture].map((directory) =>
          rm(directory, { recursive: true, force: true }),
        ),
      )
  }
}
