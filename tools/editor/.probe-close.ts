import { chromium } from "playwright"
const url = "http://127.0.0.1:4175"
const browser = await chromium.launch({ channel: "chrome", headless: true })
for (const width of [1440]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, ...(width < 500 ? { hasTouch: true, isMobile: true } : {}) })
  await context.addCookies([{ name: "onsite-dev-user", value: "author", url }])
  const page = await context.newPage()
  await page.goto(url + "/editor-login/")
  const popup = page.waitForEvent("popup")
  await page.getByRole("button", { name: "GitHub 로그인", exact: true }).click()
  await popup
  await page.waitForURL(url + "/")
  await page.goto(url + "/editor-new/?draft=onsite-editor-tour")
  await page.locator(".composer[data-mode=edit]").waitFor()
  await page.locator(".composer-info-toggle").click()
  const form = page.locator(".composer-meta[open] .composer-form")
  await form.waitFor()
  await form.screenshot({ path: "/tmp/close-" + width + ".png", clip: undefined })
  const close = page.getByRole("button", { name: "글 정보 닫기" })
  const box = await close.boundingBox()
  const formBox = await form.boundingBox()
  const hit = await close.evaluate((el) => { const r = el.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e === el })
  console.info("STYLE " + JSON.stringify(await close.evaluate((el) => { const s = getComputedStyle(el); return { w: s.width, h: s.height, minH: s.minHeight, coarse: matchMedia("(pointer: coarse)").matches, rules: [...document.styleSheets].flatMap((sheet) => { try { return [...sheet.cssRules] } catch { return [] } }).flatMap((r) => r.cssRules ? [...r.cssRules].map((c) => (r.conditionText ?? "") + " " + c.cssText) : [r.cssText]).filter((t) => t.includes("composer-meta__close")) } })))
  await close.click()
  const closed = await page.locator(".composer-meta[open]").count()
  console.info("CLOSE " + width + " " + JSON.stringify({ box, form: { x: formBox.x, y: formBox.y, w: formBox.width }, hit, closed }))
  await context.close()
}
await browser.close()
