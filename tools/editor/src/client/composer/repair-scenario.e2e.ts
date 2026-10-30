import { strict as assert } from "node:assert"
import type { Page } from "playwright"
import { noHorizontalOverflow, type Shot } from "./composer-scenario"
export const REPAIR_SLUG = "crafting-compilers"

export async function runRepair(page: Page, mobile: boolean, shot: Shot): Promise<void> {
  const selectLanguage = async (language: "ko" | "en"): Promise<void> => {
    if (mobile) await page.locator(`.composer-tab[data-lang="${language}"]`).click()
  }
  const cell = (row: number, language: "ko" | "en") =>
    page.locator(`li.composer-row[data-row="${row}"] .composer-cell[data-lang="${language}"]`)
  const summary = page.locator(".composer-summary")
  const finish = page.locator('button[data-action="finish-repair"]')
  const review = page.locator('button[data-action="request-review"]')

  await page.goto(new URL(`/?repair=${REPAIR_SLUG}`, page.url()).href, { waitUntil: "load" })
  await page.locator(".composer[data-mode=repair]").waitFor()
  await expectSummary(page, "짝 맞춤 · 한국어 22 · 영어 21 · 차이 1")
  assert.equal(await finish.isDisabled(), true)
  assert.equal(await review.isDisabled(), true)
  assert.equal(await page.locator("li.composer-row").count(), 22)
  assert.equal(
    await page.locator('li.composer-row[data-row="21"]').getAttribute("data-mismatch"),
    "true",
  )
  assert.equal(await cell(21, "en").getAttribute("data-missing"), "true")
  assert.equal(await page.locator('.composer-issues li[data-code="pairing"]').count(), 1)
  if (mobile) {
    assert.equal(await cell(0, "en").isVisible(), false)
    assert.equal(await cell(0, "ko").isVisible(), true)
  }
  await shot("10-repair-initial")
  await noHorizontalOverflow(page)

  await selectLanguage("ko")
  await cell(0, "ko").locator('button[data-op="insert"]').click()
  await expectSummary(page, "짝 맞춤 · 한국어 23 · 영어 21 · 차이 2")
  assert.equal(await page.locator("li.composer-row").count(), 23)
  assert.equal(await cell(0, "ko").getAttribute("data-empty"), "true")
  await cell(0, "ko").locator('button[data-op="remove"]').click()
  await expectSummary(page, "짝 맞춤 · 한국어 22 · 영어 21 · 차이 1")
  assert.equal(await cell(0, "ko").getAttribute("data-empty"), "false")

  await selectLanguage("en")
  const firstEn = await cell(0, "en").locator(".composer-cell__preview").textContent()
  const secondEn = await cell(1, "en").locator(".composer-cell__preview").textContent()
  assert.ok(firstEn && secondEn && firstEn !== secondEn)
  await cell(0, "en").locator('button[data-op="move"][data-direction="1"]').click()
  await page.waitForFunction(
    (expected) =>
      document.querySelector(
        'li.composer-row[data-row="1"] .composer-cell[data-lang="en"] .composer-cell__preview',
      )?.textContent === expected,
    firstEn,
  )
  assert.equal(await cell(0, "en").locator(".composer-cell__preview").textContent(), secondEn)
  assert.equal(
    await cell(0, "ko").locator(".composer-cell__preview").textContent(),
    await cell(0, "ko").locator(".composer-cell__preview").textContent(),
  )
  await cell(1, "en").locator('button[data-op="move"][data-direction="-1"]').click()
  await page.waitForFunction(
    (expected) =>
      document.querySelector(
        'li.composer-row[data-row="0"] .composer-cell[data-lang="en"] .composer-cell__preview',
      )?.textContent === expected,
    firstEn,
  )

  const twentieth = await cell(19, "en").locator(".composer-cell__preview").textContent()
  const twentyFirst = await cell(20, "en").locator(".composer-cell__preview").textContent()
  await cell(19, "en").locator('button[data-op="merge"]').click()
  await expectSummary(page, "짝 맞춤 · 한국어 22 · 영어 20 · 차이 2")
  assert.equal(
    await cell(19, "en").locator(".composer-cell__preview").textContent(),
    `${twentieth}\n\n${twentyFirst}`,
  )
  assert.equal(await cell(20, "en").getAttribute("data-missing"), "true")
  await cell(20, "en").locator('button[data-op="insert"]').click()
  await expectSummary(page, "짝 맞춤 · 한국어 22 · 영어 21 · 차이 1")
  await cell(21, "en").locator('button[data-op="insert"]').click()
  await expectSummary(page, "짝 맞춤 · 한국어 22 · 영어 22 · 블록 수 일치")
  assert.equal(await summary.getAttribute("data-aligned"), "true")
  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>('button[data-action="finish-repair"]')
    return button !== null && !button.disabled
  })
  assert.equal(await review.isDisabled(), true)
  assert.equal(await page.evaluate(() => window.__composer.getBundle()), null)
  assert.equal(
    await page.evaluate(() => window.__composer.getUnpaired()?.en.blocks.length ?? null),
    22,
  )
  await shot("11-repair-aligned")
  await noHorizontalOverflow(page)

  await finish.click()
  await page.locator(".composer[data-mode=edit]").waitFor()
  await page.locator('.composer-document[data-lang="ko"] .ProseMirror').waitFor()
  assert.equal(await page.locator(".composer-document .ProseMirror").count(), 2)
  assert.equal(await page.locator("li.composer-row").count(), 0)
  await page.waitForFunction(() => window.__changes.length >= 1)
  const finished = await page.evaluate(() => {
    const bundle = window.__composer.getBundle()
    if (!bundle) throw new Error("no bundle after repair")
    return {
      ids: bundle.ko.blocks.map((block) => block.id),
      enIds: bundle.en.blocks.map((block) => block.id),
      emptyEn: bundle.en.blocks.filter((block) => block.markdown === "").map((block) => block.id),
      unpaired: window.__composer.getUnpaired(),
      slug: bundle.slug,
      hash: bundle.snapshotHash,
    }
  })
  assert.deepEqual(
    finished.ids,
    Array.from({ length: 22 }, (_, index) => `${REPAIR_SLUG}-${index + 1}`),
  )
  assert.deepEqual(finished.enIds, finished.ids)
  assert.deepEqual(finished.emptyEn, [`${REPAIR_SLUG}-21`, `${REPAIR_SLUG}-22`])
  assert.equal(finished.unpaired, null)
  assert.equal(finished.slug, REPAIR_SLUG)
  assert.match(finished.hash, /^[a-f0-9]{64}$/)
  assert.equal(await page.locator('.composer-issues li[data-code="emptyTranslation"]').count(), 2)
  assert.equal(await page.locator('.composer-issues li[data-code="pairing"]').count(), 0)
  assert.equal(await review.isDisabled(), true)
  await shot("12-repair-finished")
  await noHorizontalOverflow(page)
}

async function expectSummary(page: Page, text: string): Promise<void> {
  await page.waitForFunction(
    (expected) => document.querySelector(".composer-summary")?.textContent === expected,
    text,
  )
}
