import { strict as assert } from "node:assert"
import type { Page } from "playwright"
import type { ComposerFixture, Shot } from "./composer-scenario"

async function pasteNoiseImage(page: Page, size: number): Promise<void> {
  await page.evaluate(async (edge) => {
    const canvas = document.createElement("canvas")
    canvas.width = edge
    canvas.height = edge
    const context = canvas.getContext("2d")
    if (!context) throw new Error("no canvas context")
    const pixels = context.createImageData(edge, edge)
    let seed = 42
    for (let index = 0; index < pixels.data.length; index += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0
      pixels.data[index] = index % 4 === 3 ? 255 : seed >>> 24
    }
    context.putImageData(pixels, 0, 0)
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"))
    if (!blob) throw new Error("no png")
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], "noise.png", { type: "image/png" }))
    const target = document.querySelector('.composer-document[data-lang="ko"] .ProseMirror')
    if (!target) throw new Error("no editor")
    target.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
    )
  }, size)
}

export async function checkArticleMedia(
  page: Page,
  fixture: ComposerFixture,
  shot: Shot,
): Promise<void> {
  const { firstId, composer, koCell, review } = fixture

  await page.evaluate(
    (id) =>
      window.__composer.setCursor({
        language: "ko",
        anchor: { blockId: id, offset: 1 },
        focus: { blockId: id, offset: 6 },
        scrollTop: 0,
      }),
    firstId,
  )
  await composer.getByRole("button", { name: "굵게", exact: true }).click()
  assert.equal(await koCell.locator("strong").textContent(), "Alpha")
  await composer.getByRole("button", { name: "굵게", exact: true }).click()
  await composer.getByRole("combobox", { name: "문단 스타일" }).selectOption("2")
  assert.equal(await koCell.locator("h2").textContent(), "Alpha")
  await composer.getByRole("combobox", { name: "문단 스타일" }).selectOption("paragraph")
  await page.evaluate(
    (id) =>
      window.__composer.setCursor({
        language: "ko",
        anchor: { blockId: id, offset: 6 },
        focus: { blockId: id, offset: 6 },
        scrollTop: 0,
      }),
    firstId,
  )
  await pasteNoiseImage(page, 1800)
  await koCell.locator('img[src^="blob:"]').waitFor()
  await page.waitForFunction(() => {
    const bundle = window.__composer.getBundle()
    return bundle !== null && bundle.images.length === 1
  })
  const image = await page.evaluate(async () => {
    const bundle = window.__composer.getBundle()
    const pending = bundle?.images[0]
    if (pending?.status !== "pending") throw new Error("no pending image")
    const bytes = new Uint8Array(await pending.blob.slice(0, 12).arrayBuffer())
    return {
      path: pending.path,
      mime: pending.mime,
      size: pending.blob.size,
      type: pending.blob.type,
      riff: String.fromCharCode(...bytes.subarray(0, 4)),
      webp: String.fromCharCode(...bytes.subarray(8, 12)),
      markdown: bundle?.ko.blocks[0]?.markdown ?? "",
    }
  })
  assert.match(image.path, /^images\/pasted-\d{8}-\d{6}-[a-f0-9]{6}\.webp$/)
  assert.equal(image.mime, "image/webp")
  assert.equal(image.type, "image/webp")
  assert.equal(image.riff, "RIFF")
  assert.equal(image.webp, "WEBP")
  assert.ok(image.size <= 1_048_576, `webp size ${image.size}`)
  assert.ok(image.markdown.includes(`](${image.path})`), image.markdown)
  assert.ok(!image.markdown.includes("blob:"), image.markdown)
  await shot("07-image")

  const cursorRoundTrip = await page.evaluate(() => {
    const before = window.__composer.getCursor()
    const bundle = window.__composer.getBundle()
    if (!before || !bundle) throw new Error("no cursor")
    const id = bundle.ko.blocks[0]?.id ?? ""
    window.__composer.setCursor({
      language: "en",
      anchor: { blockId: id, offset: 1 },
      focus: { blockId: id, offset: 6 },
      scrollTop: 0,
    })
    const after = window.__composer.getCursor()
    return { before, after, lang: document.querySelector(".composer")?.getAttribute("data-lang") }
  })
  assert.equal(cursorRoundTrip.before.language, "ko")
  assert.equal(cursorRoundTrip.after?.language, "en")
  assert.deepEqual(
    [cursorRoundTrip.after?.anchor.offset, cursorRoundTrip.after?.focus.offset],
    [1, 6],
  )
  assert.equal(cursorRoundTrip.lang, "en")
  await page.waitForFunction(
    () => document.activeElement?.closest(".composer-document")?.getAttribute("data-lang") === "en",
  )

  const restored = await page.evaluate(() => {
    const bundle = window.__composer.getBundle()
    if (!bundle) throw new Error("no bundle")
    const before = window.__changes.length
    window.__composer.setBundle(bundle)
    return {
      documents: document.querySelectorAll(".composer-document .ProseMirror").length,
      images: document.querySelectorAll('.composer-document[data-lang="ko"] img[src^="blob:"]')
        .length,
      emitted: window.__changes.length - before,
      same:
        JSON.stringify(window.__composer.getBundle()?.ko.blocks) ===
        JSON.stringify(bundle.ko.blocks),
    }
  })
  assert.deepEqual(restored, { documents: 2, images: 1, emitted: 0, same: true })
  await koCell.locator('img[src^="blob:"]').waitFor()

  const sequences = await page.evaluate(() => window.__changes.map((change) => change.sequence))
  assert.ok(sequences.length >= 4, `changes ${sequences.length}`)
  assert.ok(sequences.every((value, index) => index === 0 || value > (sequences[index - 1] ?? 0)))

  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>('button[data-action="request-review"]')
    return button !== null && !button.disabled
  })
  await review.click()
  await page.waitForFunction(() => window.__review !== null)
  const reviewed = await page.evaluate(() => ({
    slug: window.__review?.slug,
    images: window.__review?.images.length,
    hash: window.__review?.snapshotHash,
  }))
  assert.equal(reviewed.slug, "onsite-editor-test")
  assert.equal(reviewed.images, 1)
  assert.match(reviewed.hash ?? "", /^[a-f0-9]{64}$/)

  // A picture pasted onto a selected picture joins it: the two sit side by side (나란히).
  await koCell.locator("figure[data-onsite-image] img").first().click()
  await pasteNoiseImage(page, 64)
  await koCell.locator(".onsite-pair img").nth(1).waitFor()
  await page.waitForFunction(() =>
    (window.__composer.getBundle()?.ko.blocks ?? []).some((block) =>
      block.markdown.includes("{{< pair"),
    ),
  )
  await shot("07b-pasted-pair")
  await page.keyboard.press("Escape")
  await koCell.click({ position: { x: 4, y: 4 } })
  await page.keyboard.press("ControlOrMeta+z")
  await koCell.locator(".onsite-pair").waitFor({ state: "detached" })
}
