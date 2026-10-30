import { strict as assert } from "node:assert"
import { cp, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve, sep } from "node:path"
import { chromium } from "playwright"
import { build } from "vite"
import { createArticle } from "./form-scenario.e2e"
import { checkArticleMedia } from "./media-scenario.e2e"
import { checkArticleMetadata } from "./metadata-scenario.e2e"
import { checkNativeArticle } from "./native-scenario.e2e"
import { REPAIR_SLUG, runRepair } from "./repair-scenario.e2e"
import { checkEditorUpgrades } from "./upgrades.e2e"

const harness = resolve(import.meta.dir, "harness")
const fixtures = resolve(import.meta.dir, "../../shared/onsite/fixtures")
const output = await mkdtemp(join(tmpdir(), "hyperaccel-composer-build-"))
const artifacts = await mkdtemp(join(tmpdir(), "hyperaccel-composer-e2e-"))
const repairRoot = await mkdtemp(join(tmpdir(), "hyperaccel-composer-repair-"))
await cp(
  resolve(import.meta.dir, "../../../../../content/posts", REPAIR_SLUG),
  join(repairRoot, REPAIR_SLUG),
  {
    recursive: true,
  },
)

await build({
  configFile: false,
  root: harness,
  base: "/",
  logLevel: "warn",
  build: { outDir: output, emptyOutDir: true },
})

async function serveFile(base: string, path: string): Promise<Response> {
  const absolute = resolve(base, `.${path.endsWith("/") ? `${path}index.html` : path}`)
  if (!absolute.startsWith(`${base}${sep}`)) return new Response(null, { status: 403 })
  const file = Bun.file(absolute)
  return (await file.exists()) ? new Response(file) : new Response(null, { status: 404 })
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname)
    if (path.startsWith("/fixtures/")) return serveFile(fixtures, path.slice("/fixtures".length))
    if (path.startsWith("/repair/")) return serveFile(repairRoot, path.slice("/repair".length))
    return serveFile(output, path)
  },
})

type Viewport = { readonly width: number; readonly height: number }
const viewports: readonly Viewport[] = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]

async function run(viewport: Viewport): Promise<void> {
  const mobile = viewport.width < 900
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    const context = await browser.newContext({
      viewport,
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: mobile ? 3 : 1,
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
      const url = request.url()
      if (
        !url.startsWith(server.url.origin) &&
        !/^(?:blob|data):/.test(url) &&
        !url.startsWith("https://www.youtube.com/embed/")
      ) {
        errors.push(`External: ${url}`)
      }
    })
    const shot = (name: string) =>
      page.screenshot({ path: join(artifacts, `${viewport.width}-${name}.png`), fullPage: true })

    await page.goto(`${server.url.origin}/`, { waitUntil: "load" })
    const fixture = await createArticle(page, shot)
    await checkNativeArticle(page, fixture, shot)
    await checkArticleMedia(page, fixture, shot)
    await checkArticleMetadata(page, shot)

    await checkEditorUpgrades(page, shot)
    await runRepair(page, mobile, shot)

    assert.deepEqual(errors, [])
    await context.close()
  } finally {
    await browser.close()
  }
}

try {
  for (const viewport of viewports) await run(viewport)
  console.info(`Composer Chromium e2e passed at 1440x900 and 390x844; screenshots: ${artifacts}`)
} finally {
  server.stop(true)
}
