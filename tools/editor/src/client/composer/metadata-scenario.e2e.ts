import { strict as assert } from "node:assert"
import type { Page } from "playwright"
import { noHorizontalOverflow, type Shot } from "./composer-scenario"
export async function checkArticleMetadata(page: Page, shot: Shot): Promise<void> {
  const composer = page.locator(".composer[data-mode=edit]")
  const review = composer.locator('button[data-action="request-review"]')
  await composer.locator('.composer-tab[data-lang="en"]').click()
  const postTitle = composer.locator("h1.composer-title")
  assert.equal(await postTitle.getAttribute("lang"), "en")
  await postTitle.fill("")
  await composer.locator('.composer-issues li[data-code="frontMatter"]').waitFor()
  assert.equal(await review.isDisabled(), true)
  await postTitle.fill("Onsite Editor Test")
  await composer.locator(".composer-issues").waitFor({ state: "hidden" })
  assert.equal(
    await page.evaluate(() => window.__composer.getBundle()?.en.frontMatter.title),
    "Onsite Editor Test",
  )
  // Tags open in place under the post and fold away again with the same link.
  await composer.locator(".composer-tags-edit a").click()
  await composer.locator('.composer-tag-panel input[name="tagQuery"]').fill("panel,")
  await composer.locator(".composer-tags-edit a", { hasText: "태그 접기" }).click()
  await composer.locator(".composer-tag-panel").waitFor({ state: "hidden" })
  await page.waitForFunction(() =>
    window.__composer.getBundle()?.ko.frontMatter.tags?.includes("panel"),
  )
  await composer.locator(".composer-info-toggle").click()
  const metaForm = composer.locator("form.composer-form[data-mode=edit]")
  await metaForm.locator('[name="tagQuery"]').waitFor({ state: "visible" })
  assert.equal(
    await metaForm
      .locator('[name="slug"]')
      .evaluate((el) => el instanceof HTMLInputElement && el.readOnly),
    true,
  )
  await shot("08-meta")
  await noHorizontalOverflow(page)

  await page.goto(new URL("/?bundle=image-layouts&theme=light", page.url()).href, {
    waitUntil: "load",
  })
  await page.locator('.composer-document[data-lang="ko"] .ProseMirror').waitFor()
  assert.equal(await page.locator(".composer-document .ProseMirror").count(), 2)
  assert.equal(await page.locator("li.composer-row").count(), 0)
  // Seven layouts plus a row of three pictures and slides.
  assert.equal(await page.evaluate(() => window.__composer.getBundle()?.ko.blocks.length), 9)
  await page
    .locator('.composer-document[data-lang="ko"] img[src*="/fixtures/image-layouts/images/a.svg"]')
    .first()
    .waitFor()
  const untouched = await page.evaluate(() => {
    const bundle = window.__composer.getBundle()
    return bundle?.ko.blocks.map((block) => block.markdown)
  })
  assert.deepEqual(untouched?.[2], '![넓게](images/a.svg#wide "와이드 캡션")')
  assert.deepEqual(untouched?.[4], "![별칭](images/a.svg#side)")
  assert.equal(await page.locator('button[data-action="request-review"]').isDisabled(), true)
  await page.locator('.composer-issues li[data-code="frontMatter"]').first().waitFor()
  await shot("09-fixture-light")
  await noHorizontalOverflow(page)
}
