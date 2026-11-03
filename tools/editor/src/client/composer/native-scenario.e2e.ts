import { strict as assert } from "node:assert"
import type { Page } from "playwright"
import type { ComposerFixture, Shot } from "./composer-scenario"
export async function checkNativeArticle(
  page: Page,
  fixture: ComposerFixture,
  shot: Shot,
): Promise<void> {
  const { firstId, composer, koCell, enCell, review } = fixture
  await composer.locator('.composer-tab[data-lang="ko"]').click()
  await koCell.click()
  await page.keyboard.press("ControlOrMeta+End")
  await page.keyboard.press("Enter")
  await page.keyboard.insertText("두 번째 문단")
  assert.equal(await koCell.locator("p").count(), 2)
  const split = await page.evaluate(() => window.__composer.getBundle()?.ko.blocks)
  assert.deepEqual(split, [{ id: firstId, markdown: "첫 번째 문단입니다.\n\n두 번째 문단" }])
  await composer.locator('.composer-tab[data-lang="en"]').click()
  assert.equal(await enCell.textContent(), "First paragraph.")
  await composer.locator('.composer-tab[data-lang="ko"]').click()
  assert.equal(await koCell.locator("p").count(), 2)

  // Separate persisted IDs still share one native selection, deletion and history.
  const secondId = "native-second"
  await page.evaluate(
    ({ first, second }) => {
      const bundle = window.__composer.getBundle()
      if (!bundle) throw new Error("no bundle")
      window.__composer.setBundle({
        ...bundle,
        ko: {
          ...bundle.ko,
          blocks: [
            { id: first, markdown: "Alpha" },
            { id: second, markdown: "Bravo" },
          ],
        },
        en: {
          ...bundle.en,
          blocks: [
            { id: first, markdown: "First paragraph." },
            { id: second, markdown: "Second paragraph." },
          ],
        },
      })
      window.__composer.setCursor({
        language: "ko",
        anchor: { blockId: second, offset: 1 },
        focus: { blockId: second, offset: 1 },
        scrollTop: 0,
      })
      if (document.activeElement?.getAttribute("aria-label") !== "한국어 본문") {
        throw new Error("Cursor restoration must focus the article before returning")
      }
    },
    { first: firstId, second: secondId },
  )
  await page.keyboard.press("Backspace")
  assert.equal(await koCell.locator("p").count(), 1)
  assert.deepEqual(await page.evaluate(() => window.__composer.getBundle()?.ko.blocks), [
    { id: firstId, markdown: "AlphaBravo" },
    { id: secondId, markdown: "" },
  ])
  assert.equal(
    await page.evaluate(() => window.__composer.getBundle()?.en.blocks[1]?.markdown),
    "Second paragraph.",
  )
  await composer.locator('.composer-tab[data-lang="en"]').click()
  await page.evaluate(
    (id) =>
      window.__composer.setCursor({
        language: "en",
        anchor: { blockId: id, offset: 1 },
        focus: { blockId: id, offset: 1 },
        scrollTop: 0,
      }),
    secondId,
  )
  await page.keyboard.press("Backspace")
  assert.deepEqual(await page.evaluate(() => window.__composer.getBundle()?.ko.blocks), [
    { id: firstId, markdown: "AlphaBravo" },
  ])
  await composer.locator('.composer-issues li[data-code="emptyTranslation"]').waitFor({
    state: "detached",
  })
  assert.equal(await review.isDisabled(), false)
  await page.keyboard.press("ControlOrMeta+z")
  await composer.locator('.composer-tab[data-lang="ko"]').click()
  await koCell.focus()
  await page.keyboard.press("ControlOrMeta+z")
  assert.equal(await koCell.locator("p").count(), 2)
  await page.evaluate(
    ({ first, second }) => {
      window.__composer.setCursor({
        language: "ko",
        anchor: { blockId: second, offset: 3 },
        focus: { blockId: first, offset: 3 },
        scrollTop: 0,
      })
    },
    { first: firstId, second: secondId },
  )
  const selected = await page.evaluate(() => ({
    cursor: window.__composer.getCursor(),
    text: window.getSelection()?.toString(),
  }))
  assert.equal(selected.cursor?.anchor.blockId, secondId)
  assert.equal(selected.cursor?.focus.blockId, firstId)
  assert.ok(selected.text?.includes("pha"))
  assert.ok(selected.text?.includes("Br"))
  await page.keyboard.press("Delete")
  assert.equal(await koCell.textContent(), "Alavo")
  await page.keyboard.press("ControlOrMeta+z")
  assert.equal(await koCell.locator("p").count(), 2)
  await page.keyboard.press("ControlOrMeta+Shift+z")
  assert.equal(await koCell.textContent(), "Alavo")
  await page.keyboard.press("ControlOrMeta+z")
  await shot("06-native-paragraphs")
}
