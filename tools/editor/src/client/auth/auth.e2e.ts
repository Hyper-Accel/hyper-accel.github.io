import { strict as assert } from "node:assert"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright"
import { z } from "zod"
import { createTokenExchange } from "../../../workers/token-exchange"
import { tokenExchangeResponseSchema } from "../../shared/onsite/auth"
import { startFakeGitHub } from "../../testing/fake-github"

const fake = startFakeGitHub()
const worker = createTokenExchange(async (input, init) => {
  const form = new URLSearchParams(await new Request(input, init).text())
  const response = await fetch(fake.oauthUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: form.get("code"),
      codeVerifier: form.get("code_verifier"),
      redirectUri: form.get("redirect_uri"),
    }),
  })
  if (!response.ok) return response
  const data = tokenExchangeResponseSchema.parse(await response.json())
  return Response.json({
    access_token: data.accessToken,
    expires_in: data.expiresIn,
    token_type: data.tokenType,
  })
})
const build = await Bun.build({
  entrypoints: [join(import.meta.dir, "browser-fixture.ts")],
  target: "browser",
  minify: true,
})
assert.equal(build.success, true)
const script = await build.outputs[0]?.text()
assert.ok(script)
const html = `<!doctype html><html lang="ko"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lane A authentication and restore</title>
<style>
body{background:var(--theme);color:var(--primary);font:18px/1.6 system-ui;margin:24px}
:root{--theme:#f7f7f6;--primary:#1d1d1f;--entry:#fff;--border:#e7e7e4;--editor-focus:#2563eb}
:root[data-theme=dark]{--theme:#1d1d1f;--primary:#f7f7f6;--entry:#272822;--border:#6b6b6b}
main{max-width:720px;margin:auto}button,input,textarea{font:inherit;box-sizing:border-box;background:var(--entry);color:inherit;border:1px solid var(--border);border-radius:6px}
button{min-height:44px;padding:8px 16px;margin:0 8px 8px 0;cursor:pointer}
button:hover{border-color:var(--primary)}button:active{opacity:.8}button:disabled{opacity:.6}
:focus-visible{outline:2px solid var(--editor-focus);outline-offset:2px}
label{display:block;margin:16px 0}input,textarea{width:100%;padding:8px}textarea{min-height:120px}img{max-width:100%;height:80px}
</style><main><h1>로그인과 초안 복원</h1><div id="auth"></div>
<label>한국어 제목<input id="title-ko"></label><label>English title<input id="title-en"></label>
<label>한국어 본문<textarea id="ko"></textarea></label><label>English body<textarea id="en"></textarea></label>
<label>이미지<input id="image" type="file" accept="image/*"></label><img id="preview" alt="보관된 이미지">
<button id="expire">로그인 만료 재현</button><p id="saved" role="status"></p></main>
<script type="module" src="/fixture.js"></script></html>`
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === "/exchange")
      return worker.fetch(request, {
        GITHUB_CLIENT_ID: "fake-client",
        GITHUB_CLIENT_SECRET: "fake-secret",
      })
    if (url.pathname === "/fixture.js")
      return new Response(script, { headers: { "Content-Type": "text/javascript" } })
    if (url.pathname === "/editor-login/")
      return new Response(html, { headers: { "Content-Type": "text/html" } })
    return fetch(new Request(`${fake.url}${url.pathname}${url.search}`, request))
  },
})
const artifacts = await mkdtemp(join(tmpdir(), "hyperaccel-lane-a-"))
try {
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      const context = await browser.newContext({
        viewport,
        isMobile: viewport.width === 390,
        hasTouch: viewport.width === 390,
      })
      let page = await context.newPage()
      const errors: string[] = []
      context.on("page", (opened) => opened.on("pageerror", (error) => errors.push(error.message)))
      page.on("pageerror", (error) => errors.push(error.message))
      let authorization = Promise.withResolvers<string>()
      await context.exposeBinding("capturePkce", (_source, value: string) => {
        authorization.resolve(value)
      })
      await context.addInitScript(() => {
        const original = Storage.prototype.setItem
        Storage.prototype.setItem = function (key: string, value: string): void {
          original.call(this, key, value)
          if (key === "onsite:pkce") {
            const capture: unknown = Reflect.get(window, "capturePkce")
            if (typeof capture === "function") void capture(value)
          }
        }
      })
      await context.route("https://github.com/login/oauth/authorize?**", async (route) => {
        const target = new URL(route.request().url())
        const raw = await authorization.promise
        authorization = Promise.withResolvers<string>()
        const pending = z
          .object({ verifier: z.string(), redirectUri: z.string(), state: z.string() })
          .parse(JSON.parse(raw ?? "null"))
        assert.equal(
          target.searchParams.get("code_challenge"),
          new Bun.CryptoHasher("sha256").update(pending.verifier).digest("base64url"),
        )
        assert.equal(target.searchParams.get("state"), pending.state)
        const code = crypto.randomUUID()
        fake.grantCode(code, pending.verifier, pending.redirectUri, {
          id: 1,
          login: "author",
          permission: "write",
          expiresAt: Date.now() + 28_800_000,
        })
        await route.fulfill({
          status: 302,
          headers: {
            location: `${pending.redirectUri}?${new URLSearchParams({ code, state: pending.state })}`,
          },
          body: "",
        })
      })
      async function ready(step: string): Promise<void> {
        try {
          await page
            .locator('#saved[data-ready="true"], #saved[data-error]')
            .waitFor({ state: "attached" })
          const callbackError = await page.locator("#saved").getAttribute("data-error")
          if (callbackError) throw new Error(callbackError)
        } catch (error) {
          console.error({
            step,
            status: await page.locator("#auth").textContent(),
            callbackError: await page.locator("#saved").getAttribute("data-error"),
            errors,
          })
          await page.screenshot({ path: join(artifacts, `${viewport.width}-failure.png`) })
          throw error
        }
      }
      await page.goto(`${server.url.origin}/editor-login/`)
      await page.getByRole("button", { name: "GitHub 로그인" }).click()
      await ready("initial login")
      await page.locator("#title-ko").fill("한국어 복원 제목")
      await page.locator("#title-en").fill("Restored English title")
      await page.locator("#ko").fill("저장되지 않은 한국어 본문\n둘째 문단")
      await page.locator("#en").fill("Unsaved English body\nSecond paragraph")
      const bytes = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>',
      )
      await page
        .locator("#image")
        .setInputFiles({ name: "pasted.svg", mimeType: "image/svg+xml", buffer: bytes })
      await page.locator("#en").evaluate((element) => {
        if (!(element instanceof HTMLTextAreaElement)) throw new Error("Missing textarea")
        element.focus()
        element.setSelectionRange(3, 17)
        element.dispatchEvent(new Event("select"))
      })
      // Observe the actual IDB transaction rather than relying on a debounce timeout.
      await page.evaluate(async () => {
        const request = indexedDB.open("hyperaccel-onsite-drafts", 1)
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction("snapshots", "readonly")
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
          const read = transaction.objectStore("snapshots").getAll()
          read.onsuccess = () => {
            const records: unknown = read.result
            if (!Array.isArray(records) || records.length !== 1) reject(new Error("Missing draft"))
          }
        })
        db.close()
      })
      await page.locator("#expire").click()
      await page.getByRole("button", { name: "GitHub 로그인" }).waitFor()
      await page.getByRole("button", { name: "GitHub 로그인" }).click()
      await ready("expired then re-login")
      const readState = async (): Promise<unknown> =>
        page.evaluate(async () => {
          const ko = document.querySelector<HTMLInputElement>("#title-ko")
          const en = document.querySelector<HTMLTextAreaElement>("#en")
          const preview = document.querySelector<HTMLImageElement>("#preview")
          if (!en || !preview) throw new Error("Missing restored controls")
          return {
            titleKo: ko?.value,
            titleEn: document.querySelector<HTMLInputElement>("#title-en")?.value,
            ko: document.querySelector<HTMLTextAreaElement>("#ko")?.value,
            en: en.value,
            cursor: [en.selectionStart, en.selectionEnd],
            active: document.activeElement?.id,
            image: await (await fetch(preview.src)).text(),
            // The token may live only in this tab's sessionStorage, never in localStorage.
            storage: [JSON.stringify(localStorage), Object.keys(sessionStorage).sort().join(",")],
            cleanUrl: !location.href.includes("code=") && !location.href.includes("state="),
          }
        })
      const expected = {
        titleKo: "한국어 복원 제목",
        titleEn: "Restored English title",
        ko: "저장되지 않은 한국어 본문\n둘째 문단",
        en: "Unsaved English body\nSecond paragraph",
        cursor: [3, 17],
        active: "en",
        image: bytes.toString(),
        storage: ['{"onsite:returning-editor":"1"}', "onsite:session"],
        cleanUrl: true,
      }
      assert.deepEqual(await readState(), expected)
      await page.reload()
      // The tab keeps its login across a reload (sessionStorage), so the draft comes back without
      // a second login; closing the tab below does require one.
      await ready("reload keeps the tab's login")
      assert.deepEqual(await readState(), expected)
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => {
          document.documentElement.dataset["theme"] = value
        }, theme)
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
        )
        await page.screenshot({
          path: join(artifacts, `${viewport.width}-${theme}-restored.png`),
          fullPage: true,
        })
      }
      await page.getByRole("button", { name: "로그아웃", exact: true }).click()
      await page.close()
      page = await context.newPage()
      await page.goto(`${server.url.origin}/editor-login/`)
      await page.getByRole("button", { name: "GitHub 로그인" }).click()
      await ready("tab close then re-login")
      assert.deepEqual(await readState(), expected)
      assert.deepEqual(errors, [])
      await context.close()
    }
    console.info(
      `Lane A Chromium restore passed at 390x844 and 1440x900; screenshots: ${artifacts}`,
    )
  } finally {
    await browser.close()
  }
} finally {
  server.stop(true)
  fake.stop()
}
