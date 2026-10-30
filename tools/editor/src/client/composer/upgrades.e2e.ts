import { strict as assert } from "node:assert"
import type { Page } from "playwright"

/** Insert tools live in the toolbox's card; on narrow screens it opens from "＋ 넣기". */
async function clickTool(page: Page, id: string): Promise<void> {
  // 실행 취소 · 다시 실행 sit in the thin row itself.
  const inRow = page.locator(`.composer-toolbox__bar [data-tool="${id}"]`)
  if (await inRow.count()) {
    await inRow.click()
    return
  }
  const insert = page.locator(".composer-toolbox__insert")
  if ((await insert.getAttribute("aria-expanded")) !== "true") await insert.click()
  await page.locator(`.composer-toolbox__tools [data-tool="${id}"]`).click()
}

export async function checkEditorUpgrades(
  page: Page,
  shot: (name: string) => Promise<Buffer>,
): Promise<void> {
  const ko = page.locator('.composer-document[data-lang="ko"] .ProseMirror')
  const select = async (from = 1, to = 6): Promise<void> => {
    await page.evaluate(
      ({ from, to }) => {
        window.__composer.setCursor({
          language: "ko",
          anchor: { blockId: "upgrades", offset: from },
          focus: { blockId: "upgrades", offset: to },
          scrollTop: window.scrollY,
        })
      },
      { from, to },
    )
  }
  await page.evaluate(() => {
    document.documentElement.dataset["theme"] = "dark"
    const bundle = window.__composer.getBundle()
    if (!bundle) throw new Error("Missing upgrade fixture")
    window.__composer.setBundle({
      ...bundle,
      ko: { ...bundle.ko, blocks: [{ id: "upgrades", markdown: "Alpha" }] },
      en: { ...bundle.en, blocks: [{ id: "upgrades", markdown: "English" }] },
    })
  })
  await select()
  // 형광펜 and 위첨자 also sit in the toolbox's second row; these are the drag toolbar's.
  const drag = page.locator(".composer-bubble")
  await drag.getByRole("button", { name: "형광펜", exact: true }).click()
  assert.equal(await ko.locator("mark").textContent(), "Alpha")
  await page.getByRole("combobox", { name: "문단 스타일" }).selectOption("lead")
  assert.equal(await ko.locator("p.lead").textContent(), "Alpha")
  await page.getByRole("button", { name: "서식 더보기", exact: true }).click()
  await shot("13-preset-menu")
  const bubble = await page.locator(".composer-bubble").boundingBox()
  assert.ok(bubble && bubble.x >= 0 && bubble.x + bubble.width <= (page.viewportSize()?.width ?? 0))
  const menuBox = await page.locator(".composer-bubble__more").boundingBox()
  assert.ok(
    menuBox && menuBox.y >= 0 && menuBox.y + menuBox.height <= (page.viewportSize()?.height ?? 0),
  )
  await drag.getByRole("button", { name: "위첨자", exact: true }).click()
  assert.equal(await ko.locator("sup").textContent(), "Alpha")
  // Picking from "서식 더보기" closes the menu.
  await page.locator(".composer-bubble__more").waitFor({ state: "hidden" })
  await page.keyboard.press("Escape")
  await select()
  await page.keyboard.press("ControlOrMeta+Backslash")
  assert.equal(await ko.locator("mark, sup, .lead").count(), 0)
  for (const [keys, tag] of [
    ["ControlOrMeta+b", "strong"],
    ["ControlOrMeta+i", "em"],
    ["ControlOrMeta+u", "u"],
    ["ControlOrMeta+Alt+s", "s"],
    ["ControlOrMeta+Shift+y", "sub"],
    ["ControlOrMeta+Shift+u", "sup"],
    ["ControlOrMeta+Shift+h", "mark"],
  ] as const) {
    await select()
    await page.keyboard.press(keys)
    assert.equal(await ko.locator(tag).textContent(), "Alpha")
    await page.keyboard.press(keys)
    assert.equal(await ko.locator(tag).count(), 0)
  }
  await page.getByRole("button", { name: "댓글", exact: true }).click()
  assert.equal(await page.evaluate(() => window.__comment), "Alpha")
  await page.evaluate(() => {
    const save = document.createElement("button")
    save.dataset["siteSave"] = ""
    save.dataset["calls"] = "0"
    save.hidden = true
    save.addEventListener("click", () => {
      save.dataset["calls"] = String(Number(save.dataset["calls"]) + 1)
    })
    document.body.append(save)
  })
  await select(3, 3)
  await page.keyboard.press("ControlOrMeta+s")
  assert.equal(await page.locator("[data-site-save]").getAttribute("data-calls"), "1")
  await page.keyboard.press("ControlOrMeta+Shift+s")
  assert.equal(await page.locator("[data-site-save]").getAttribute("data-calls"), "2")
  await page.evaluate(() => document.querySelector("[data-site-save]")?.remove())

  await select()
  await page.evaluate(() => {
    const target = document.querySelector('.composer-document[data-lang="ko"] .ProseMirror')
    const transfer = new DataTransfer()
    transfer.setData("text/plain", "https://example.com/docs")
    target?.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
    )
  })
  assert.equal(await ko.locator("a").textContent(), "Alpha")
  assert.equal(await ko.locator("a").getAttribute("href"), "https://example.com/docs")
  await select(3, 3)
  await page.getByRole("button", { name: "수정", exact: true }).click()
  await page.getByRole("textbox", { name: "링크 주소" }).fill("https://example.com/changed")
  await page.getByRole("button", { name: "적용", exact: true }).click()
  assert.equal(await ko.locator("a").getAttribute("href"), "https://example.com/changed")
  await select(3, 3)
  await shot("14-link-address")
  await page.getByRole("button", { name: "제거", exact: true }).click()
  assert.equal(await ko.locator("a").count(), 0)

  await select()
  await page.keyboard.press("ControlOrMeta+Shift+8")
  assert.equal(await ko.locator("ul li").textContent(), "Alpha")
  await clickTool(page, "undo")
  assert.equal(await ko.locator("ul").count(), 0)
  await clickTool(page, "redo")
  assert.equal(await ko.locator("ul li").textContent(), "Alpha")
  await clickTool(page, "bullet-list")
  await select(6, 6)
  // The note is written in place: the caret jumps to the new definition at the end.
  await page.keyboard.press("ControlOrMeta+Alt+Shift+f")
  await ko.locator(".footnotes ol li").waitFor()
  await page.keyboard.type("한국어 각주")
  assert.equal(await ko.locator(".footnote-ref").textContent(), "1")
  assert.ok((await ko.locator(".footnotes").textContent())?.includes("한국어 각주"))
  assert.equal(await ko.locator(":scope > :last-child").getAttribute("class"), "footnotes")
  await select(6, 7)
  await page.keyboard.press("Backspace")
  await ko.locator(".footnotes").waitFor({ state: "hidden" })
  await page.keyboard.press("ControlOrMeta+z")
  await ko.locator(".footnotes").waitFor({ state: "visible" })
  await page.locator('.composer-tab[data-lang="en"]').click()
  const en = page.locator('.composer-document[data-lang="en"] .ProseMirror')
  assert.equal(await en.locator(".footnotes").count(), 0)
  await en.click()
  await clickTool(page, "footnote")
  await en.locator(".footnotes ol li").waitFor()
  await page.keyboard.type("English note")
  assert.equal(await en.locator(".footnote-ref").textContent(), "1")
  await page.locator('.composer-tab[data-lang="ko"]').click()
  assert.ok((await ko.locator(".footnotes").textContent())?.includes("한국어 각주"))
  await shot("15-footnotes")

  await select(6, 6)
  // An empty video box appears in place with its address field focused; Enter applies it.
  await clickTool(page, "youtube")
  const address = page.getByRole("textbox", { name: "YouTube 주소", exact: true })
  await address.waitFor()
  assert.equal(await address.evaluate((input) => input === document.activeElement), true)
  await address.fill("https://example.com/wrong")
  await address.press("Enter")
  await page.getByRole("alert").filter({ hasText: "올바른 YouTube" }).waitFor()
  await address.fill("https://youtu.be/dQw4w9WgXcQ")
  await address.press("Enter")
  await ko.locator('iframe[src*="/embed/dQw4w9WgXcQ"]').waitFor()
  assert.equal(await ko.locator(":scope > :last-child").getAttribute("class"), "footnotes")
  await shot("16-video")
  const serialized = await page.evaluate(() =>
    window.__composer
      .getBundle()
      ?.ko.blocks.map((b) => b.markdown)
      .join("\n\n"),
  )
  assert.match(serialized ?? "", /\[\^1\]: 한국어 각주/)
  assert.match(serialized ?? "", /\{\{< youtube dQw4w9WgXcQ >\}\}/)

  // A table comes in as 3 × 3 (the preselected size) and grows from the tools above it.
  await select(6, 6)
  await clickTool(page, "table")
  await page.keyboard.press("Enter")
  await ko.locator("table tr").nth(2).waitFor()
  assert.equal(await ko.locator("table tr").first().locator("th").count(), 3)
  const tableTools = page.locator(".composer-table-tools:not([hidden])")
  await tableTools.getByRole("button", { name: "오른쪽에 열 추가", exact: true }).click()
  assert.equal(await ko.locator("table tr").first().locator("th").count(), 4)
  await page.waitForFunction(() =>
    (window.__composer.getBundle()?.ko.blocks ?? []).some((block) =>
      /^\|(?:[^|\n]*\|){4}\s*$/m.test(block.markdown),
    ),
  )
  await tableTools.getByRole("button", { name: "표 삭제", exact: true }).click()
  assert.equal(await ko.locator("table").count(), 0)

  await select(1, 1)
  await page.keyboard.press("ControlOrMeta+/")
  const help = page.getByRole("dialog", { name: "단축키 안내" })
  await help.waitFor()
  assert.ok((await help.locator("kbd").count()) >= 25)
  await shot("17-shortcut-help")
  await page.keyboard.press("Escape")
  await help.waitFor({ state: "detached" })
  await clickTool(page, "help")
  await help.waitFor()
  await help.getByRole("button", { name: "닫기" }).click()
}
