import { strict as assert } from "node:assert"
import { join } from "node:path"
import type { Page } from "playwright"

export async function checkNewSyntax(page: Page, artifacts: string, width: number): Promise<void> {
  await page.evaluate(() =>
    window.harness.editor.commands.setContent(
      '{{< tabs >}}\n{{< tab name="유일" >}}\n유일한 탭 본문\n{{< /tab >}}\n{{< /tabs >}}',
      { contentType: "markdown" },
    ),
  )
  await page.locator(".onsite-tabs .tabs-panel p").click()
  await page.getByRole("button", { name: "유일 탭 삭제", exact: true }).click()
  await page.locator(".onsite-tabs").waitFor({ state: "detached" })
  await page.keyboard.press("ControlOrMeta+z")
  await page.getByRole("tab", { name: "유일", exact: true }).waitFor()
  assert.equal(await page.locator(".onsite-tabs .tabs-panel p").textContent(), "유일한 탭 본문")
  await page.evaluate(() => {
    window.harness.editor.commands.setContent(
      "도입 <mark>강조</mark> <sup>위</sup> <sub>아래</sub> <kbd>키</kbd> <small>작게</small>\n{.lead}\n\n참조[^n]\n\n[^n]: 각주 **내용**",
      { contentType: "markdown" },
    )
  })
  await page.locator(".ProseMirror .footnotes").waitFor()
  assert.equal(await page.locator(".ProseMirror .lead mark").textContent(), "강조")
  assert.equal(await page.locator(".footnote-ref").textContent(), "1")
  assert.equal(await page.locator(".footnote-backref").count(), 1)
  // A new empty paragraph before the endnotes is the slash insertion surface.
  await page.evaluate(() => {
    const editor = window.harness.editor
    const notes = editor.state.doc.lastChild
    if (!notes) throw new Error("Missing notes")
    const at = editor.state.doc.content.size - notes.nodeSize
    editor.commands.insertContentAt(at, { type: "paragraph" })
    editor.commands.setTextSelection(at + 1)
    editor.view.focus()
  })
  await page.keyboard.type("/동영상")
  await page.locator(".onsite-slash:not([hidden]) [data-item=youtube]").waitFor()
  await page.keyboard.press("Enter")
  // An empty video box appears in place; it is never written out and disappears when left empty.
  const address = page.getByRole("textbox", { name: "YouTube 주소" })
  await address.waitFor()
  assert.equal(await page.locator("[data-youtube]").count(), 1)
  assert.ok(
    !(await page.evaluate(() => window.harness.editor.getMarkdown())).includes("{{< youtube"),
  )
  await page.evaluate(() => {
    const editor = window.harness.editor
    editor.commands.setTextSelection(1)
    editor.view.focus()
  })
  await page.locator("[data-youtube]").waitFor({ state: "detached" })
  await page.evaluate(() => {
    const editor = window.harness.editor
    const notes = editor.state.doc.lastChild
    if (!notes) throw new Error("Missing notes")
    const at = editor.state.doc.content.size - notes.nodeSize
    editor.commands.insertContentAt(at, { type: "paragraph" })
    editor.commands.setTextSelection(at + 1)
    editor.view.focus()
  })
  await page.keyboard.type("/동영상")
  await page.locator(".onsite-slash:not([hidden]) [data-item=youtube]").waitFor()
  await page.keyboard.press("Enter")
  await address.fill("https://youtube.com/shorts/dQw4w9WgXcQ")
  await address.press("Enter")
  await page.locator('iframe[src*="/embed/dQw4w9WgXcQ"]').waitFor()
  await page.locator("[data-youtube] .onsite-video-tools:not([hidden])").waitFor()
  await page
    .getByRole("textbox", { name: "YouTube 주소" })
    .fill("https://youtube.com/embed/9bZkp7q19f0")
  await page.getByRole("button", { name: "적용", exact: true }).click()
  await page.locator('iframe[src*="/embed/9bZkp7q19f0"]').waitFor()
  assert.ok(
    (await page.evaluate(() => window.harness.editor.getMarkdown())).includes(
      "{{< youtube 9bZkp7q19f0 >}}",
    ),
  )
  assert.equal(await page.locator(".ProseMirror > :last-child").getAttribute("class"), "footnotes")
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: join(artifacts, `${width}-new-syntax.png`), fullPage: true })
}
