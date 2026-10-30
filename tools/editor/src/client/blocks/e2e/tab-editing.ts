import { strict as assert } from "node:assert"
import { join } from "node:path"
import type { Page } from "playwright"

export async function checkTabEditing(page: Page, artifacts: string, width: number): Promise<void> {
  const tabs = page.locator(".onsite-tabs").first()
  const names = () => tabs.locator(".tabs-tab[role=tab]").allTextContents()
  const tab = (name: string) => tabs.getByRole("tab", { name, exact: true })
  assert.equal(await page.locator(".onsite-tabs__tools").count(), 0)
  await tabs.locator(".tabs-panel:not([hidden]) p").first().click()
  await tabs.locator(".onsite-tabs__add:not([hidden])").waitFor()
  await tab("코드").click()
  await tabs.locator(".tabs-panel").nth(1).waitFor({ state: "visible" })
  await tabs.locator(".onsite-tabs__add").click()
  await tab("탭 3").waitFor()
  await page.keyboard.type("새 탭 내용")
  assert.ok(
    (await page.evaluate(() => window.harness.editor.getMarkdown())).includes(
      '{{< tab name="탭 3" >}}\n새 탭 내용\n{{< /tab >}}',
    ),
  )

  // Rename is text inside the selected button and preserves its box until commit.
  const before = await tab("탭 3").boundingBox()
  await tab("탭 3").click()
  const label = tabs.getByRole("textbox", { name: "탭 이름" })
  await label.fill("셋째")
  const during = await tabs.locator(".tabs-tab[aria-selected=true]").boundingBox()
  assert.equal(during?.width, before?.width)
  assert.equal(during?.height, before?.height)
  await page.screenshot({ path: join(artifacts, `${width}-tab-rename.png`) })
  await label.press("Enter")
  await tab("셋째").waitFor()
  assert.ok(
    (await page.evaluate(() => window.harness.editor.getMarkdown())).includes(
      '{{< tab name="셋째" >}}',
    ),
  )
  await tab("셋째").click()
  await label.fill("취소할 이름")
  await label.press("Escape")
  assert.equal(await tab("셋째").count(), 1)
  await tab("셋째").click()
  await label.fill("셋째 수정")
  await tabs.locator(".tabs-panel:not([hidden]) p").first().click()
  await tab("셋째 수정").waitFor()
  await tab("셋째 수정").click()
  await label.fill("셋째")
  await label.press("Enter")

  // Alt + arrow reorders the focused tab without a property toolbar.
  await tab("셋째").focus()
  await page.keyboard.press("Alt+ArrowLeft")
  assert.deepEqual(await names(), ["한국어", "셋째", "코드"])

  // Pointer events use the same drag path for mouse and touch.
  const from = await tab("셋째").boundingBox()
  const to = await tab("한국어").boundingBox()
  assert.ok(from && to)
  if (width === 390) {
    const session = await page.context().newCDPSession(page)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: from.x + from.width / 2, y: from.y + from.height / 2 }],
    })
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: to.x + to.width / 2, y: to.y + to.height / 2 }],
    })
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await session.detach()
  } else {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
    await page.mouse.up()
  }
  await page.waitForFunction(
    () => document.querySelector(".onsite-tabs .tabs-tab[role=tab]")?.textContent === "셋째",
  )
  assert.deepEqual(await names(), ["셋째", "한국어", "코드"])
  await tabs.getByRole("button", { name: "셋째 탭 삭제", exact: true }).click()
  assert.deepEqual(await names(), ["한국어", "코드"])
  await page.keyboard.press("ControlOrMeta+z")
  await tab("셋째").waitFor()
  assert.deepEqual(await names(), ["셋째", "한국어", "코드"])
  assert.ok((await page.evaluate(() => window.harness.editor.getMarkdown())).includes("새 탭 내용"))
  await page.screenshot({ path: join(artifacts, `${width}-tabs-in-place.png`) })
}
