import { strict as assert } from "node:assert"
import { join } from "node:path"
import type { Locator, Page } from "playwright"
import { markdown, noOverflow, open, waitForSource } from "./block-checks"

let dragCount = 0

/**
 * Starts the native drag from the `img` itself (the figure grows a tools panel once selected)
 * and from a different grab point each time, because ProseMirror treats a mousedown within
 * 500 ms and 10 px of the previous one as a double-click and never starts a drag.
 */
async function dragImage(
  page: Page,
  image: Locator,
  target: {
    readonly x: number
    readonly y: number
    readonly zone: string
    readonly screenshot: string
  },
): Promise<void> {
  const zone = target.zone
  const box = await image.locator("img").boundingBox()
  assert.ok(box, "image box")
  dragCount += 1
  const grab = { x: box.x + 40 + dragCount * 24, y: box.y + 30 + dragCount * 16 }
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x + 16, grab.y + 16, { steps: 4 })
  await page.mouse.move(target.x, target.y, { steps: 12 })
  // Chromium's native dragover follows the preceding mouse move.
  await page.mouse.move(target.x, target.y + 1)
  await page
    .locator(`.onsite-dropzones:not([hidden]) .onsite-dropzone[data-zone="${zone}"][data-active]`)
    .waitFor()
  await page.screenshot({ path: target.screenshot })
  await page.mouse.up()
  await page.locator(".onsite-dropzones[hidden]").waitFor({ state: "attached" })
}

async function undoToSource(page: Page): Promise<void> {
  await page.keyboard.press("ControlOrMeta+z")
  await waitForSource(page)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForFunction(() => window.scrollY === 0)
}

export async function checkImageLayouts(
  page: Page,
  width: number,
  artifacts: string,
): Promise<void> {
  await open(page, "image-layouts")
  assert.equal(await page.locator(".onsite-image.figure-body").count(), 1)
  assert.equal(await page.locator(".onsite-image.figure-wide").count(), 1)
  assert.equal(await page.locator(".onsite-image.figure-side-right").count(), 2)
  assert.equal(await page.locator(".onsite-image.figure-side-left").count(), 1)
  // Rows of two and three pictures (Naver's 나란히 놓기) and slides.
  assert.equal(await page.locator(".onsite-pair img").count(), 5)
  assert.equal(await page.locator(".onsite-slides .slide").count(), 2)
  await page.screenshot({ path: join(artifacts, `${width}-image-layouts.png`), fullPage: true })

  const body = page.locator(".onsite-image").first()
  await body.click()
  await page.locator(".onsite-image.is-selected .onsite-bar").waitFor()
  assert.equal(await noOverflow(page), true, "overflow with tools open")
  await page.screenshot({ path: join(artifacts, `${width}-image-selected.png`) })

  await page.keyboard.press("Alt+ArrowRight")
  await page.locator(".onsite-image.is-selected.figure-side-right").waitFor()
  assert.ok((await markdown(page)).includes('![본문](images/a.svg#side-right "본문 캡션")'))
  await undoToSource(page)

  // Placement sits right in the picture bar (no dropdown).
  await page
    .locator(".onsite-image.is-selected .onsite-bar .onsite-segmented [data-preset='wide']")
    .click()
  await page.locator(".onsite-image.is-selected.figure-wide").waitFor()
  assert.ok((await markdown(page)).includes('![본문](images/a.svg#wide "본문 캡션")'))
  await undoToSource(page)

  // Naver-style "문단 내 배치": a side layout from the bar puts the caret beside the picture.
  await page
    .locator(".onsite-image.is-selected .onsite-segmented [data-preset='side-left']")
    .click()
  await page.locator(".onsite-image.figure-side-left:not(.is-selected)").first().waitFor()
  await page.keyboard.type("옆 글")
  assert.match(await markdown(page), /images\/a\.svg#side-left "본문 캡션"\)\n\n옆 글/)
  assert.equal(await noOverflow(page), true, "overflow with text beside a picture")
  await page.screenshot({ path: join(artifacts, `${width}-image-beside.png`) })
  for (let step = 0; step < 3; step += 1) await page.keyboard.press("ControlOrMeta+z")
  await undoToSource(page)
  await body.click()
  await page.locator(".onsite-image.is-selected .onsite-bar").waitFor()

  // Confluence-style caption slot directly under the selected picture.
  const caption = page.locator(".onsite-image.is-selected .onsite-caption-input")
  await caption.fill("새 캡션")
  await page
    .locator(".onsite-image.is-selected figcaption", { hasText: "새 캡션" })
    .waitFor({ state: "attached" })
  assert.ok((await markdown(page)).includes('![본문](images/a.svg "새 캡션")'))
  await page.evaluate(() =>
    window.harness.editor.commands.setContent(window.harness.source, { contentType: "markdown" }),
  )
  await waitForSource(page)

  if (width < 1100) {
    return
  }
  const column = await page.locator(".ProseMirror").boundingBox()
  assert.ok(column, "column box")
  const headingY = column.y + 16
  await dragImage(page, body, {
    x: column.x + column.width * 0.9,
    y: headingY,
    zone: "side-right",
    screenshot: join(artifacts, "drag-side-right.png"),
  })
  assert.ok((await markdown(page)).includes('![본문](images/a.svg#side-right "본문 캡션")'))
  await undoToSource(page)

  await dragImage(page, body, {
    x: column.x - 24,
    y: headingY,
    zone: "wide-left",
    screenshot: join(artifacts, "drag-wide-left.png"),
  })
  assert.ok((await markdown(page)).includes('![본문](images/a.svg#wide "본문 캡션")'))
  await undoToSource(page)

  const wide = page.locator(".onsite-image.figure-wide img")
  const wideBox = await wide.boundingBox()
  assert.ok(wideBox, "wide image box")
  await dragImage(page, body, {
    x: wideBox.x + wideBox.width * 0.75,
    y: wideBox.y + wideBox.height / 2,
    zone: "pair",
    screenshot: join(artifacts, "drag-pair.png"),
  })
  assert.equal(await page.locator(".onsite-pair").count(), 3)
  assert.ok(
    (await markdown(page)).includes(
      '{{< pair >}}\n![넓게](images/a.svg "와이드 캡션")\n![본문](images/a.svg "본문 캡션")\n{{< /pair >}}',
    ),
  )
  await undoToSource(page)

  // One picture dragged out of a row stands on its own; the row keeps the others.
  const row = page.locator(".onsite-pair[data-count='3']")
  await row.evaluate((element) => element.scrollIntoView({ block: "center" }))
  const third = await row.locator("[data-group-index='2'] img").boundingBox()
  const below = await page.locator(".onsite-slides").boundingBox()
  assert.ok(third && below, "row and slides boxes")
  await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2)
  await page.mouse.down()
  await page.mouse.move(third.x + third.width / 2 + 16, third.y + third.height / 2 + 16, {
    steps: 4,
  })
  // Dropped on the slides below the row: an ordinary place in the post, not beside a picture.
  const dropY = Math.min(below.y + 40, (page.viewportSize()?.height ?? 900) - 24)
  await page.mouse.move(column.x + column.width / 2, dropY, { steps: 12 })
  await page.mouse.move(column.x + column.width / 2, dropY + 1)
  await page
    .locator('.onsite-dropzones:not([hidden]) .onsite-dropzone[data-zone="body"][data-active]')
    .waitFor()
  await page.mouse.up()
  await page.locator(".onsite-pair[data-count='3']").waitFor({ state: "detached" })
  assert.equal(await page.locator(".onsite-pair[data-count='2']").count(), 2)
  assert.ok(
    (await markdown(page)).includes(
      '{{< pair >}}\n![첫째](images/a.svg "첫째 캡션")\n![둘째](images/b.svg)\n{{< /pair >}}',
    ),
  )
  await undoToSource(page)
}
