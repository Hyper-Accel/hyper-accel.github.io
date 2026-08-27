import { mkdir, rm, writeFile } from "node:fs/promises"
import { join, resolve, sep } from "node:path"
import { chromium, type Page } from "playwright"

const repositoryRoot = resolve(import.meta.dir, "../../../..")
const fixtureDirectory = join(repositoryRoot, "content/posts/editor-e2e-fixture")
const fixturePath = join(fixtureDirectory, "index.md")
const artifactDirectory = "/tmp/hyperaccel-blog-editor-e2e"
const renderedDirectory = join(artifactDirectory, "site")
const marker = "E2E EDITOR TEXT MARKER"

const source = `---
date: '2025-08-27T12:00:00+09:00'
draft: false
title: '에디터 E2E 검증 글'
authors: ["Test"]
tags: ["editor-e2e"]
categories: ["Test"]
---

# 시작 문단

이미지 아래에 검증 문장을 입력합니다.
`

async function dispatchImagePaste(page: Page): Promise<void> {
  const paragraph = page.locator(".ProseMirror p").last()
  await paragraph.click()
  await page.keyboard.press("End")
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas")
    canvas.width = 640
    canvas.height = 360
    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("Canvas 2D context를 만들 수 없습니다.")
    }
    context.fillStyle = "#2563eb"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = "#ffffff"
    context.font = "bold 40px sans-serif"
    context.textAlign = "center"
    context.fillText("Clipboard image", canvas.width / 2, canvas.height / 2)
    const blob = await new Promise<Blob>((resolveBlob, rejectBlob) => {
      canvas.toBlob((result) => {
        if (result) {
          resolveBlob(result)
        } else {
          rejectBlob(new Error("PNG 생성에 실패했습니다."))
        }
      }, "image/png")
    })
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], "clipboard-check.png", { type: "image/png" }))
    const paste = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    })
    document.querySelector(".ProseMirror")?.dispatchEvent(paste)
  })
}

async function buildRenderedSite(): Promise<void> {
  await rm(renderedDirectory, { recursive: true, force: true })
  const process = Bun.spawn(
    ["hugo", "--destination", renderedDirectory, "--quiet", "--noBuildLock"],
    {
      cwd: repositoryRoot,
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [exitCode, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`검증용 Hugo 빌드 실패: ${stderr}`)
  }
}

async function run(): Promise<void> {
  await mkdir(fixtureDirectory, { recursive: true })
  await mkdir(artifactDirectory, { recursive: true })
  await writeFile(fixturePath, source, "utf8")

  const browser = await chromium.launch({ channel: "chrome", headless: true })
  let renderedServer: ReturnType<typeof Bun.serve> | undefined
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" })
    const fixtureRow = page.locator('[data-path="content/posts/editor-e2e-fixture/index.md"]')
    await fixtureRow.waitFor()
    await fixtureRow.click()
    await page.locator("#post-title").waitFor()

    await page.locator(".ProseMirror p").last().click()
    await page.keyboard.press("End")
    await page.keyboard.press("Enter")
    await page.keyboard.type(marker)
    await dispatchImagePaste(page)
    const editorImage = page.locator(".ProseMirror img")
    await editorImage.waitFor()
    await page.getByText(/images\/pasted-.*\.png에 이미지를 저장했습니다/).waitFor()
    await editorImage.click()
    await page.locator(".ProseMirror img.ProseMirror-selectednode").waitFor()
    const altAccepted = new Promise<void>((resolveDialog, rejectDialog) => {
      page.once("dialog", (dialog) => {
        dialog
          .accept("파란 배경에 Clipboard image라고 적힌 그림")
          .then(() => resolveDialog())
          .catch(rejectDialog)
      })
    })
    await page.locator("#alt-button").click()
    await altAccepted
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLImageElement>(".ProseMirror img")?.alt ===
        "파란 배경에 Clipboard image라고 적힌 그림",
    )
    const [editorBox, editorImageBox] = await Promise.all([
      page.locator("#editor").boundingBox(),
      page.locator(".ProseMirror img").boundingBox(),
    ])
    if (!editorBox || !editorImageBox || Math.abs(editorBox.width - editorImageBox.width) > 1) {
      throw new Error("편집 이미지가 글 본문 폭을 채우지 않습니다.")
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: join(artifactDirectory, "editor-1280.png"), fullPage: true })

    await page.locator("#save-button").click()
    await page.getByText("저장했고 Hugo 렌더링까지 확인했습니다.").waitFor()

    const saved = await Bun.file(fixturePath).text()
    await writeFile(join(artifactDirectory, "saved.md"), saved, "utf8")
    if (
      !saved.includes(marker) ||
      !saved.includes("images/pasted-") ||
      !saved.includes("파란 배경에 Clipboard image라고 적힌 그림")
    ) {
      throw new Error("저장된 Markdown에 텍스트, 이미지 경로 또는 대체 텍스트가 없습니다.")
    }

    await buildRenderedSite()
    renderedServer = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        const requestedPath = url.pathname.endsWith(`${sep}`)
          ? `${url.pathname}index.html`
          : url.pathname
        const file = Bun.file(join(renderedDirectory, requestedPath))
        return (await file.exists())
          ? new Response(file)
          : new Response("Not found", { status: 404 })
      },
    })
    const published = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const response = await published.goto(
      `http://127.0.0.1:${renderedServer.port}/posts/editor-e2e-fixture/`,
      { waitUntil: "networkidle" },
    )
    await writeFile(join(artifactDirectory, "published.html"), await published.content(), "utf8")
    if (!response?.ok()) {
      throw new Error(`Hugo 페이지 응답 실패: ${response?.status() ?? "응답 없음"}`)
    }
    await published.getByText(marker).waitFor()
    const publishedImage = published.locator(".post-content img")
    await publishedImage.scrollIntoViewIfNeeded()
    const imageWidth = await publishedImage.evaluate(
      (image) =>
        new Promise<number>((resolveImage, rejectImage) => {
          const htmlImage = image as HTMLImageElement
          const finish = (): void => {
            if (htmlImage.naturalWidth > 0) {
              resolveImage(htmlImage.naturalWidth)
            } else {
              rejectImage(new Error("발행 이미지가 로드되지 않았습니다."))
            }
          }
          if (htmlImage.complete) {
            finish()
          } else {
            htmlImage.addEventListener("load", finish, { once: true })
            htmlImage.addEventListener(
              "error",
              () => rejectImage(new Error("발행 이미지 요청이 실패했습니다.")),
              { once: true },
            )
          }
        }),
    )
    if (imageWidth !== 640) {
      throw new Error(`발행 이미지 폭이 다릅니다: ${imageWidth}`)
    }
    const [publishedBodyBox, publishedImageBox] = await Promise.all([
      published.locator(".post-content").boundingBox(),
      publishedImage.boundingBox(),
    ])
    if (
      !publishedBodyBox ||
      !publishedImageBox ||
      publishedImageBox.width > publishedBodyBox.width + 1 ||
      publishedImageBox.width > imageWidth + 1
    ) {
      throw new Error("발행 이미지가 본문 폭을 넘거나 원본보다 확대되었습니다.")
    }
    const publishedAlt = await publishedImage.getAttribute("alt")
    if (publishedAlt !== "파란 배경에 Clipboard image라고 적힌 그림") {
      throw new Error(`발행 이미지 대체 텍스트가 다릅니다: ${publishedAlt ?? "없음"}`)
    }
    await published.screenshot({
      path: join(artifactDirectory, "published-1280.png"),
      fullPage: true,
    })

    const tablet = await browser.newPage({ viewport: { width: 768, height: 900 } })
    await tablet.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" })
    await tablet.locator("#post-title").waitFor()
    const rail = tablet.locator("#post-rail")
    const railOpen = tablet.locator("#rail-open")
    if ((await rail.getAttribute("aria-hidden")) !== "true") {
      throw new Error("닫힌 모바일 글 목록이 접근성 트리에서 숨겨지지 않았습니다.")
    }
    const searchFocused = tablet.locator("#post-search").evaluate(
      (input) =>
        new Promise<void>((resolveFocus) => {
          input.addEventListener("focus", () => resolveFocus(), { once: true })
        }),
    )
    await railOpen.click()
    await searchFocused
    await tablet.keyboard.press("Escape")
    await railOpen.evaluate((button) => {
      if (document.activeElement !== button) {
        throw new Error("글 목록을 닫은 뒤 열기 버튼으로 포커스가 복원되지 않았습니다.")
      }
    })
    await tablet.screenshot({
      path: join(artifactDirectory, "editor-768.png"),
      fullPage: true,
    })
  } finally {
    await browser.close()
    renderedServer?.stop(true)
    if (Bun.env["KEEP_E2E_FIXTURE"] !== "1") {
      await rm(fixtureDirectory, { recursive: true, force: true })
    }
  }
}

await run()
