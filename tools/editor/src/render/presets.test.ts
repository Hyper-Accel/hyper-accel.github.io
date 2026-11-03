import { expect, test } from "bun:test"
import { chromium } from "playwright"

test("renders presets footnotes and trusted video like Hugo when reviewing a document", async () => {
  // Given the real browser renderer and two independent language documents.
  const build = await Bun.build({
    entrypoints: [`${import.meta.dir}/test-browser.ts`],
    target: "browser",
  })
  if (!build.success) throw new AggregateError(build.logs, "Renderer bundle failed")
  const script = await build.outputs[0]?.text()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      return new URL(request.url).pathname === "/test.js"
        ? new Response(script, { headers: { "Content-Type": "text/javascript" } })
        : new Response('<!doctype html><script type="module" src="/test.js"></script>', {
            headers: { "Content-Type": "text/html" },
          })
    },
  })
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(server.url.href)
    await page.waitForFunction(() => Boolean(window.onsiteRenderer))
    // When both are rendered through the review surface.
    const result = await page.evaluate(() => {
      const base = window.fixtureBundles[0]?.ko
      if (!base) throw new Error("Missing fixture")
      const render = window.onsiteRenderer.createRenderer()
      const ko = render.render({
        ...base,
        blocks: [
          {
            id: "p",
            markdown:
              "도입 <mark>강조</mark> <sup>위</sup> <sub>아래</sub> <kbd>키</kbd> <small>작게</small>\n{.lead}\n\n참조[^named] 반복[^named]",
          },
          { id: "video", markdown: "{{< youtube dQw4w9WgXcQ >}}" },
          { id: "note", markdown: "[^named]: 각주 **내용**" },
        ],
      })
      const en = render.render({
        ...base,
        language: "en",
        blocks: [{ id: "en", markdown: "English[^other]\n\n[^other]: English note" }],
      })
      const node = document.createElement("div")
      node.innerHTML = ko.html
      return {
        lead: node.querySelector("p.lead")?.textContent,
        marks: [...node.querySelectorAll("mark, sup:not([id]), sub, kbd, small")].map((n) =>
          n.tagName.toLowerCase(),
        ),
        references: [...node.querySelectorAll(".footnote-ref")].map((n) => n.textContent),
        backlinks: node.querySelectorAll(".footnote-backref").length,
        note: node.querySelector(".footnotes")?.textContent,
        video: node.querySelector("iframe")?.getAttribute("src"),
        sectionLast: node.querySelector(".post-content")?.lastElementChild?.className,
        en: en.html,
      }
    })
    // Then semantic HTML, ordered references and built-in embed defaults match Hugo.
    expect(result.lead).toContain("도입 강조")
    expect(result.marks).toEqual(["mark", "sup", "sub", "kbd", "small"])
    expect(result.references).toEqual(["1", "1"])
    expect(result.backlinks).toBe(2)
    expect(result.note).toContain("각주 내용")
    expect(result.sectionLast).toBe("footnotes")
    expect(result.video).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&controls=1&end=0&loop=0&mute=0&start=0",
    )
    expect(result.en).toContain('role="doc-noteref">1</a>')
    expect(result.en).not.toContain("각주 내용")
  } finally {
    await browser.close()
    server.stop(true)
  }
})
