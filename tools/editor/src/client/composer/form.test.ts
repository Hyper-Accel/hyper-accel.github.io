import { afterAll, beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import { type Browser, chromium, type Page } from "playwright"
import type { PostMetadata } from "./metadata"

let browser: Browser
let page: Page
let server: ReturnType<typeof Bun.serve>

beforeAll(async () => {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, "form.test-browser.ts")],
    target: "browser",
  })
  if (!build.success) throw new AggregateError(build.logs, "Metadata form browser bundle failed")
  const script = build.outputs.find((output) => output.path.endsWith(".js"))
  const stylesheet = build.outputs.find((output) => output.path.endsWith(".css"))
  if (!script || !stylesheet) throw new TypeError("Missing metadata form bundle outputs")
  const [js, css] = await Promise.all([script.text(), stylesheet.text()])
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      switch (new URL(request.url).pathname) {
        case "/test.js":
          return new Response(js, { headers: { "Content-Type": "text/javascript" } })
        case "/test.css":
          return new Response(css, { headers: { "Content-Type": "text/css" } })
        default:
          return new Response(
            '<!doctype html><html lang="ko" data-theme="light"><link rel="stylesheet" href="/test.css"><script type="module" src="/test.js"></script></html>',
            { headers: { "Content-Type": "text/html" } },
          )
      }
    },
  })
  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage()
  await page.goto(server.url.href)
  await page.waitForFunction(() => Boolean(window.__metadataForm))
})

afterAll(async () => {
  await browser?.close()
  server?.stop(true)
})

async function mount(mode: "create" | "edit", initial: Partial<PostMetadata> = {}): Promise<void> {
  await page.evaluate((args) => window.__metadataForm.mount(args.mode, args.initial), {
    mode,
    initial,
  })
}

function visibleAuthors(): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>('input[name="authors"]')]
      .filter((input) => input.offsetParent !== null)
      .map((input) => input.value),
  )
}

test("filters the author dropdown while chosen authors stay as chips", async () => {
  // Given: a new post with one author already selected.
  await mount("create", { authors: ["Donghyeon Choi"] })
  // When: the author search narrows the dropdown.
  await page.locator('input[name="authorQuery"]').fill("park")
  // Then: the dropdown shows the matches, the chosen author stays a chip, the selection is kept.
  expect(await visibleAuthors()).toEqual(["Hyunjun Park", "Minho Park", "Sinhyun Park"])
  expect(
    await page
      .locator('[data-picker="authors"] .metadata-chip')
      .evaluateAll((chips) => chips.map((chip) => chip.getAttribute("data-value"))),
  ).toEqual(["Donghyeon Choi"])
  expect(await page.evaluate(() => window.__metadataForm.read().authors)).toEqual([
    "Donghyeon Choi",
  ])
})

test("checks the single matching author on Enter instead of submitting", async () => {
  // Given: a new post and a filter that matches exactly one author.
  await mount("create")
  const query = page.locator('input[name="authorQuery"]')
  await query.fill("lim")
  // When: Enter is pressed inside the filter.
  await query.press("Enter")
  // Then: that author is selected, the filter is cleared and nothing was submitted.
  const state = await page.evaluate(() => ({
    authors: window.__metadataForm.read().authors,
    submitted: window.__metadataForm.submitted.length,
    query: document.querySelector<HTMLInputElement>('input[name="authorQuery"]')?.value,
  }))
  expect(state).toEqual({ authors: ["Jaewon Lim"], submitted: 0, query: "" })
})

test("does not report a change while typing in the author filter", async () => {
  // Given: an existing post being edited.
  await mount("edit", { slug: "example-post", authors: ["Donghyeon Choi"] })
  // When: only the filter text changes.
  await page.locator('input[name="authorQuery"]').fill("park")
  // Then: no metadata change is reported.
  expect(await page.evaluate(() => window.__metadataForm.changes.length)).toBe(0)
})

test("reports the new author list when an author is checked", async () => {
  // Given: an existing post being edited.
  await mount("edit", { slug: "example-post", authors: ["Donghyeon Choi"] })
  // When: a second author is picked from the dropdown.
  await page.locator('input[name="authorQuery"]').click()
  await page.locator('input[name="authors"][value="Hyunjun Park"]').check()
  // Then: every reported change carries both authors.
  const authors = await page.evaluate(() =>
    window.__metadataForm.changes.map((change) => change.authors),
  )
  expect(authors.length).toBeGreaterThanOrEqual(1)
  expect(authors).toEqual(Array.from(authors, () => ["Donghyeon Choi", "Hyunjun Park"]))
})

test("stores the converted cover path with its alt text", async () => {
  // Given: an existing post whose cover image is chosen; its alt field appears with the image.
  await mount("edit", { slug: "example-post" })
  await page.locator('input[name="coverFile"]').setInputFiles({
    name: "diagram.png",
    mimeType: "image/png",
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  })
  // When: the alt text is typed (the field shows once the image is read).
  await page.locator('input[name="coverAlt"]').fill("Diagram")
  await page.waitForFunction(() => window.__metadataForm.read().cover !== null, undefined, {
    timeout: 5000,
  })
  // Then: the converted path and the alt text are read back together.
  expect(await page.evaluate(() => window.__metadataForm.read().cover)).toEqual({
    image: "images/diagram.webp",
    alt: "Diagram",
  })
})

test("clears the cover and reports the change on remove", async () => {
  // Given: an existing post with a cover.
  await mount("edit", {
    slug: "example-post",
    cover: { image: "images/cover.webp", alt: "Cover" },
  })
  // When: the cover is removed.
  await page.locator('button[name="removeCover"]').click()
  // Then: the metadata has no cover and one change was reported.
  const state = await page.evaluate(() => ({
    cover: window.__metadataForm.read().cover,
    changes: window.__metadataForm.changes.length,
  }))
  expect(state).toEqual({ cover: null, changes: 1 })
})

test("keeps every visible control at the 44px target in both modes", async () => {
  for (const mode of ["create", "edit"] as const) {
    // Given: the rendered form in this mode.
    await mount(mode, { slug: "example-post" })
    // When: every visible control is measured.
    const short = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          ".composer-form .metadata-field > input, .composer-form .metadata-picker__box, .composer-form .metadata-slug, .composer-form .metadata-choice, .composer-form .metadata-check, .composer-form .composer-button",
        ),
      ]
        .filter((element) => element.offsetParent !== null)
        .map((element) => ({
          control: element.getAttribute("name") ?? element.className,
          height: element.getBoundingClientRect().height,
        }))
        .filter((entry) => entry.height < 44),
    )
    // Then: nothing falls under the target.
    expect(short).toEqual([])
  }
})
