import { strict as assert } from "node:assert"
import { resolve, sep } from "node:path"
import { chromium } from "playwright"

const output = process.env["EDITOR_SITE_HTML_ROOT"]
if (!output) throw new Error("Set EDITOR_SITE_HTML_ROOT to a generated Hugo output directory")
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname)
    const absolute = resolve(output, `.${path.endsWith("/") ? `${path}index.html` : path}`)
    if (!absolute.startsWith(`${output}${sep}`)) return new Response(null, { status: 403 })
    const file = Bun.file(absolute)
    return (await file.exists()) ? new Response(file) : new Response(null, { status: 404 })
  },
})
try {
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
      })
      const page = await context.newPage()
      await page.route("**/*", (route) =>
        route.request().url().startsWith(server.url.origin) ? route.continue() : route.abort(),
      )
      for (const language of ["", "/en"]) {
        await page.goto(`${server.url.origin}${language}/posts/arc-setup-guide/`)
        // The header pencil is the way in; hovering it shows the login hint underneath.
        const login = language ? "Editor login" : "에디터 로그인"
        const pencil = page.locator(".tr-header .tr-editor-link")
        assert.equal(await page.getByRole("link", { name: login, exact: true }).count(), 1)
        assert.equal(await pencil.getAttribute("href"), "/editor-login/")
        assert.equal(await pencil.isVisible(), true)
        const tip = page.locator("#tr-editor-tip")
        assert.equal(await tip.isVisible(), false)
        await pencil.hover()
        await tip.waitFor()
        assert.equal(await tip.textContent(), login)
        await page.evaluate(() => localStorage.setItem("onsite:returning-editor", "1"))
        await page.reload()
        // Returning editors on a post go straight to editing it, on the post's own page.
        const edit = page.getByRole("link", { name: "이 글 편집", exact: true })
        assert.equal(await edit.getAttribute("href"), `${language}/posts/arc-setup-guide/?edit`)
        await page.evaluate(() => localStorage.removeItem("onsite:returning-editor"))
      }
      await context.close()
    }
    console.info("Hugo header editor entry passed at 390 and 1440 in ko/en")
  } finally {
    await browser.close()
  }
} finally {
  server.stop(true)
}
