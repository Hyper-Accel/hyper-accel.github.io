import { strict as assert } from "node:assert"
import type { Page } from "playwright"
import { type ComposerFixture, noHorizontalOverflow, type Shot } from "./composer-scenario"
export async function createArticle(page: Page, shot: Shot): Promise<ComposerFixture> {
  const form = page.locator("form.composer-form[data-mode=create]")
  await form.waitFor()
  await shot("01-form")
  await noHorizontalOverflow(page)

  // The Korean title is written in the post's own h1, as on the reading page.
  await page.locator('input[name="titleKo"]').fill("온사이트 편집기 테스트")
  assert.equal(await form.locator('[name="titleKo"]').inputValue(), "온사이트 편집기 테스트")
  await form.locator('[name="titleEn"]').fill("Onsite Editor Test!")
  assert.equal(await form.locator('[name="slug"]').inputValue(), "onsite-editor-test")
  await form.locator('button[type="submit"]').click()
  await form.locator(".composer-form__errors li").first().waitFor()
  assert.ok((await form.locator(".composer-form__errors li").allTextContents()).length >= 2)
  // Dropdown pickers: open the list, then pick; tags are typed and split on commas.
  await form.locator('input[name="authorQuery"]').click()
  await form.locator('input[name="authors"][value="Donghyeon Choi"]').check()
  // Categories are chips: one click on the chip picks it.
  await form
    .locator('[data-picker="category"] label:has(input[value="Engineering Culture"])')
    .click()
  await form.locator('input[name="tagQuery"]').fill("editor, test, editor,")
  await shot("02-form-filled")
  await form.locator('button[type="submit"]').click()

  const composer = page.locator(".composer[data-mode=edit]")
  await composer.waitFor()
  const koCell = composer.locator('.composer-document[data-lang="ko"] .ProseMirror')
  const enCell = composer.locator('.composer-document[data-lang="en"] .ProseMirror')
  await koCell.waitFor()
  assert.equal(await composer.locator(".composer-document .ProseMirror").count(), 2)
  assert.equal(await composer.locator("li.composer-row").count(), 0)
  assert.equal(await composer.locator('button[data-action="add-block"]').count(), 0)
  const firstId = await page.evaluate(() => window.__composer.getBundle()?.ko.blocks[0]?.id)
  assert.ok(firstId)
  const review = composer.locator('button[data-action="request-review"]')
  assert.equal(await review.isDisabled(), true)
  await page.waitForFunction(() => window.__changes.length >= 1)
  const initial = await page.evaluate(() => {
    const change = window.__changes[window.__changes.length - 1]
    if (!change) throw new Error("no change")
    return {
      slug: change.bundle.slug,
      tags: change.bundle.ko.frontMatter.tags,
      category: change.bundle.ko.frontMatter.categories,
      titleEn: change.bundle.en.frontMatter.title,
      hash: change.bundle.snapshotHash,
      sequence: change.sequence,
    }
  })
  assert.equal(initial.slug, "onsite-editor-test")
  assert.deepEqual(initial.tags, ["editor", "test"])
  assert.deepEqual(initial.category, ["Engineering Culture"])
  assert.equal(initial.titleEn, "Onsite Editor Test!")
  assert.match(initial.hash, /^[a-f0-9]{64}$/)
  await shot("03-editor-empty")
  await noHorizontalOverflow(page)

  await composer.locator("h1.composer-title").fill("교체 전 제목")
  await page.waitForFunction(() =>
    window.__changes.some((change) => change.bundle.ko.frontMatter.title === "교체 전 제목"),
  )
  await page.evaluate(() => {
    const bundle = window.__composer.getBundle()
    if (!bundle) throw new Error("Missing bundle before metadata replacement")
    window.__composer.setBundle({
      ...bundle,
      ko: { ...bundle.ko, frontMatter: { ...bundle.ko.frontMatter, title: "복원된 제목" } },
    })
  })
  assert.equal(
    await page.evaluate(() => window.__composer.getBundle()?.ko.frontMatter.title),
    "복원된 제목",
  )

  assert.equal(await composer.locator(".composer-tabs").isVisible(), true)
  assert.equal(await enCell.isVisible(), false)
  await koCell.click()
  await page.keyboard.insertText("첫 번째 문단입니다.")
  await composer.locator('.composer-issues li[data-code="emptyTranslation"]').waitFor()
  assert.equal(await review.isDisabled(), true)
  await shot("04-needs-translation")

  await composer.locator('.composer-tab[data-lang="en"]').click()
  await enCell.waitFor({ state: "visible" })
  assert.equal(await koCell.isVisible(), false)
  await enCell.click()
  await page.keyboard.insertText("First paragraph.")
  await composer.locator(".composer-issues").waitFor({ state: "hidden" })
  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>('button[data-action="request-review"]')
    return button !== null && !button.disabled
  })
  await shot("05-complete")

  return { firstId, composer, koCell, enCell, review }
}
