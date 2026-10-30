import { strict as assert } from "node:assert"
import type { Page } from "playwright"

export const markdown = (page: Page) =>
  page.evaluate(() => window.harness.editor.getMarkdown().replace(/\n+$/, ""))
export const source = (page: Page) => page.evaluate(() => window.harness.source)
export const waitForSource = (page: Page) =>
  page.waitForFunction(
    () => window.harness.editor.getMarkdown().replace(/\n+$/, "") === window.harness.source,
  )
export const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)

const INLINE_REF = /\{\{(?:<|&lt;|%)\s*ref\b/

function withoutInlineRefBlocks(body: string): string {
  return body
    .split("\n\n")
    .filter((block) => !INLINE_REF.test(block))
    .join("\n\n")
}

export async function open(page: Page, fixture: string, theme = "dark"): Promise<void> {
  await page.goto(new URL(`/?fixture=${fixture}&theme=${theme}`, page.url()).href, {
    waitUntil: "load",
  })
  await page.locator("body[data-ready='1']").waitFor()
  assert.equal(
    withoutInlineRefBlocks(await markdown(page)),
    withoutInlineRefBlocks(await source(page)),
    `${fixture} round trip`,
  )
  assert.equal(await noOverflow(page), true, `${fixture} overflow at load`)
}
