import { strict as assert } from "node:assert"
import type { Page } from "playwright"

export async function checkCodeRendering(
  page: Page,
  shot: (name: string) => Promise<Buffer>,
): Promise<void> {
  const source = "```ts\nconst answer: number = 42\n```"
  await page.evaluate((markdown) => {
    const bundle = window.__composer.getBundle()
    if (!bundle) throw new Error("Missing code fixture")
    window.__composer.setBundle({
      ...bundle,
      ko: {
        ...bundle.ko,
        blocks: [
          { id: "code", markdown },
          { id: "plain", markdown: '```\nconst plain = "uncoloured"\n```' },
        ],
      },
    })
  }, source)
  const body = page.locator('.composer-document[data-lang="ko"] .ProseMirror')
  const code = body.locator("pre").first()
  // Wait for the real asynchronous lexer, not a timed delay.
  await code.locator(".kr").waitFor()
  assert.equal(await code.locator(".kr").textContent(), "const")
  assert.equal(await code.locator(".kt").textContent(), "number")
  assert.equal(await code.locator(".o").textContent(), "=")
  assert.equal(
    await code.locator(".kr").evaluate((node) => getComputedStyle(node).color),
    "rgb(198, 160, 246)",
  )
  assert.equal(
    await page.evaluate(() => window.__composer.getBundle()?.ko.blocks[0]?.markdown),
    source,
    "Highlighting must not change the document",
  )
  const plain = body.locator("pre").nth(1)
  assert.equal(await plain.locator("span").count(), 0)
  assert.equal(await plain.evaluate((node) => node.classList.contains("chroma")), false)

  await code.click({ position: { x: 20, y: 14 } })
  const picker = page.getByRole("combobox", { name: "코드 언어", exact: true })
  await picker.waitFor()
  assert.equal(await picker.inputValue(), "ts", "Keep a fence's language alias selected")
  const blockBox = await code.boundingBox()
  const pickerBox = await picker.boundingBox()
  assert.ok(blockBox && pickerBox)
  assert.ok(
    pickerBox.y >= blockBox.y && pickerBox.y + pickerBox.height <= blockBox.y + blockBox.height,
  )
  await shot("18-code-language")
  await picker.selectOption("")
  await code.locator(".kr").waitFor({ state: "hidden" })
  assert.equal(await code.locator("span").count(), 0, "A missing language must never be guessed")
}
