import { afterAll, beforeAll, expect, test } from "bun:test"
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { type Browser, chromium, type Page } from "playwright"
import { parse, stringify } from "yaml"
import { z } from "zod"
import { type BundleLanguage, frontMatterSchema } from "../shared/onsite/document"
import { fixtureBundles } from "../shared/onsite/fixtures"

const repo = resolve(import.meta.dir, "../../../..")
const fixtures = resolve(import.meta.dir, "../shared/onsite/fixtures")
let browser: Browser
let page: Page
let server: ReturnType<typeof Bun.serve>

beforeAll(async () => {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, "test-browser.ts")],
    target: "browser",
  })
  if (!build.success) throw new AggregateError(build.logs, "Renderer browser test bundle failed")
  const script = await build.outputs[0]?.text()
  if (!script) throw new TypeError("Missing browser test bundle")
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const image = /^\/(?:en\/)?posts\/([a-z-]+)\/images\/([a-z]+\.(?:svg|webp))$/.exec(
        new URL(request.url).pathname,
      )
      if (image)
        return new Response(Bun.file(join(fixtures, image[1] ?? "", "images", image[2] ?? "")))
      return new URL(request.url).pathname === "/test.js"
        ? new Response(script, { headers: { "Content-Type": "text/javascript" } })
        : new Response('<!doctype html><script type="module" src="/test.js"></script>', {
            headers: { "Content-Type": "text/html" },
          })
    },
  })
  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage()
  await page.route("https://**/*", (route) => route.abort())
  await page.goto(server.url.href)
  await page.waitForFunction(() => Boolean(window.onsiteRenderer))
})

afterAll(async () => {
  await browser?.close()
  server?.stop(true)
})

test("maps both fixture languages to full Markdown lines and DOM text", async () => {
  // Given / When: render the shared bundles using the browser's real DOM.
  const results = await page.evaluate(() =>
    window.fixtureBundles.flatMap((bundle) =>
      [bundle.ko, bundle.en].map((language) => ({
        language,
        result: window.onsiteRenderer.createRenderer().render(language),
      })),
    ),
  )
  // Then: every map entry locates exactly the source and rendered text.
  for (const { language, result } of results) {
    const source = await readFile(
      join(
        fixtures,
        language.path.split("/")[2] ?? "",
        language.language === "ko" ? "index.md" : "index.en.md",
      ),
      "utf8",
    )
    expect(result.blockSourceMap).toHaveLength(language.blocks.length)
    for (const [index, entry] of result.blockSourceMap.entries()) {
      expect(
        source
          .split("\n")
          .slice(entry.startLine - 1, entry.endLine)
          .join("\n"),
      ).toBe(language.blocks[index]?.markdown ?? "")
    }
    const renderedText = await page.evaluate((html) => {
      const container = document.createElement("div")
      container.innerHTML = html
      return [...container.querySelectorAll(".post-content > [data-block-id]")].map((block) => ({
        id: block.getAttribute("data-block-id"),
        text: block.textContent,
      }))
    }, result.html)
    expect(renderedText).toEqual(
      result.blockSourceMap.map((entry) => ({ id: entry.blockId, text: entry.text })),
    )
  }
})

test("removes active raw HTML and forged block anchors before previewing", async () => {
  // Given / When.
  const html = await page.evaluate(() => {
    const language = window.fixtureBundles[0]?.ko
    if (!language) throw new TypeError("Missing fixture")
    return window.onsiteRenderer.createRenderer().render({
      ...language,
      blocks: [
        {
          id: "safe",
          markdown:
            '{{< rawhtml >}}<div data-block-id="forged"><script>parent.evil=1</script><style>body{display:none}</style><img src=x onerror="parent.evil=1"><a href="javascript:alert(1)">link</a><iframe srcdoc="<script>alert(1)</script>"></iframe></div>{{< /rawhtml >}}',
        },
      ],
    }).html
  })
  // Then.
  expect(html).not.toMatch(/<script|<iframe|<style|onerror|javascript:|forged/)
  expect(html).toContain('data-block-id="safe"')
})

test("renders math while preserving code and literal shortcode examples", async () => {
  // Given / When.
  const result = await page.evaluate(() => {
    const language = window.fixtureBundles[0]?.ko
    if (!language) throw new TypeError("Missing fixture")
    const result = window.onsiteRenderer.createRenderer().render({
      ...language,
      blocks: [
        { id: "math", markdown: "$E=mc^2$ and `$x$`" },
        { id: "literal", markdown: "```md\n{{< pair >}}\n$x$\n{{< /pair >}}\n```" },
      ],
    })
    const dom = document.createElement("div")
    dom.innerHTML = result.html
    return {
      maths: dom.querySelectorAll(".katex").length,
      codes: [...dom.querySelectorAll("code")].map((node) => node.textContent),
    }
  })
  // Then.
  expect(result.maths).toBe(1)
  expect(result.codes).toEqual(["$x$", "{{< pair >}}\n$x$\n{{< /pair >}}\n"])
})

test("emits UTF-16 multi-block selection rectangles from an opaque sandbox", async () => {
  // Given: subscribe before loading the frame or selecting any text.
  const result = await page.evaluate(async () => {
    const language = window.fixtureBundles[0]?.ko
    if (!language) throw new TypeError("Missing fixture")
    const rendered = window.onsiteRenderer.createRenderer().render({
      ...language,
      blocks: [
        { id: "first", markdown: "A😀BC" },
        { id: "last", markdown: "마지막 문장" },
      ],
    })
    const iframe = document.createElement("iframe")
    document.body.append(iframe)
    const loaded = new Promise<void>((resolve) =>
      iframe.addEventListener("load", () => resolve(), { once: true }),
    )
    window.onsiteRenderer.mountPreview(iframe, rendered, { cssText: "body{font-size:20px}" })
    await loaded
    return { sandbox: iframe.getAttribute("sandbox"), readable: iframe.contentDocument !== null }
  })
  await page.evaluate(() => {
    window.nextRendererSelection = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Selection message timed out")), 5000)
      const listener = (event: MessageEvent<unknown>): void => {
        const iframe = document.querySelector("iframe")
        if (!iframe) return
        const parsed = window.onsiteRenderer.readSelectionMessage(event, iframe)
        if (!parsed) return
        clearTimeout(timeout)
        window.removeEventListener("message", listener)
        resolve(parsed)
      }
      window.addEventListener("message", listener)
    })
  })
  // When: interact in the sandbox via Chromium, not parent DOM access.
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame())
  if (!frame) throw new TypeError("Missing preview frame")
  await frame.evaluate(() => {
    const first = document.querySelector('[data-block-id="first"]')?.firstChild
    const last = document.querySelector('[data-block-id="last"]')?.firstChild
    if (!first || !last) throw new TypeError("Missing text")
    const range = document.createRange()
    range.setStart(first, 1)
    range.setEnd(last, 3)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    document.dispatchEvent(new Event("pointerup"))
  })
  // Then.
  expect(result).toEqual({ sandbox: "allow-scripts", readable: false })
  const selected = await page.evaluate(() => window.nextRendererSelection)
  expect(selected).toMatchObject({
    type: "onsite:selection",
    blockIds: ["first", "last"],
    startOffset: 1,
    endOffset: 3,
    quotedText: "😀BC\n마지막",
  })
  expect(
    z.object({ rects: z.array(z.unknown()).min(1) }).parse(selected).rects.length,
  ).toBeGreaterThan(0)
  await page.evaluate(() => document.querySelector("iframe")?.remove())
})

test("rejects spoofed sources, nonopaque origins and extra message fields", async () => {
  // Given / When.
  const rejected = await page.evaluate(() => {
    const iframe = document.createElement("iframe")
    document.body.append(iframe)
    const data = {
      type: "onsite:selection",
      blockIds: ["first"],
      startOffset: 0,
      endOffset: 1,
      quotedText: "x",
      rects: [],
    }
    const read = window.onsiteRenderer.readSelectionMessage
    const source = iframe.contentWindow
    const results = [
      read(new MessageEvent("message", { origin: "null", source: window, data }), iframe),
      read(new MessageEvent("message", { origin: location.origin, source, data }), iframe),
      read(
        new MessageEvent("message", { origin: "null", source, data: { ...data, token: "x" } }),
        iframe,
      ),
      read(
        new MessageEvent("message", { origin: "null", source, data: { ...data, endOffset: 0 } }),
        iframe,
      ),
      read(
        new MessageEvent("message", {
          origin: "null",
          source,
          data: { ...data, rects: [{ x: NaN, y: 0, width: 1, height: 1 }] },
        }),
        iframe,
      ),
    ]
    iframe.remove()
    return results
  })
  // Then.
  expect(rejected).toEqual([null, null, null, null, null])
})

const laneDPaths = [
  "layouts/_default/_markup/render-blockquote.html",
  ...["pair", "steps", "compare", "tabs", "tab"].map((name) => `layouts/shortcodes/${name}.html`),
]

test("rejects invalid structural shortcodes like the Hugo templates", async () => {
  // Given / When.
  const rejected = await page.evaluate(() => {
    const language = window.fixtureBundles[0]?.ko
    if (!language) throw new TypeError("Missing fixture")
    return [
      "{{< pair >}}\n![one](a.svg)\n{{< /pair >}}",
      "{{< compare >}}\n{{< /compare >}}",
      "{{< tabs >}}\n{{< /tabs >}}",
      '{{< tab name="outside" >}}\ntext\n{{< /tab >}}',
    ].map((markdown) => {
      try {
        window.onsiteRenderer.createRenderer().render({
          ...language,
          blocks: [{ id: "invalid", markdown }],
        })
        return false
      } catch (error) {
        if (error instanceof window.onsiteRenderer.RenderSyntaxError) return true
        throw error
      }
    })
  })
  // Then.
  expect(rejected).toEqual([true, true, true, true])
})

test("retains shortcode ordinals after legacy blocks and maps edited YAML", async () => {
  // Given / When.
  const result = await page.evaluate(() => {
    const baseline = window.fixtureBundles[0]?.ko
    if (!baseline) throw new TypeError("Missing fixture")
    const language = {
      ...baseline,
      blocks: [
        { id: "ref", markdown: '[link]({{< ref "/posts/image-layouts#anchor" >}})' },
        { id: "figure", markdown: '{{< figure src="images/a.svg" >}}' },
        { id: "tabs", markdown: '{{< tabs >}}{{< tab name="One" >}}text{{< /tab >}}{{< /tabs >}}' },
      ],
    }
    const source = `---\nextra: value\n${language.rawFrontMatter}---\n\n${language.blocks.map((block) => `<!-- b:${block.id} -->\n${block.markdown}`).join("\n\n")}\n`
    const rendered = window.onsiteRenderer
      .createRenderer({ serializedMarkdown: () => source })
      .render(language)
    const dom = document.createElement("div")
    dom.innerHTML = rendered.html
    return {
      id: dom.querySelector('[role="tabpanel"]')?.id,
      href: dom.querySelector("a")?.getAttribute("href"),
      blocks: rendered.blockSourceMap.map((entry) =>
        source
          .split("\n")
          .slice(entry.startLine - 1, entry.endLine)
          .join("\n"),
      ),
      expected: language.blocks.map((block) => block.markdown),
    }
  })
  // Then.
  expect(result.id).toBe("tabs-2-panel-0")
  expect(result.href).toBe("https://hyper-accel.github.io/posts/image-layouts/#anchor")
  expect(result.blocks).toEqual(result.expected)
})

test("matches normalized Hugo post-content for every shared bilingual fixture", async () => {
  // Given: an isolated site, with repository templates/assets/theme and shared fixtures.
  const temporary = await mkdtemp(join(tmpdir(), "onsite-render-parity-"))
  try {
    const legacyLanguages: BundleLanguage[] = []
    for (const language of ["ko", "en"] as const) {
      const filename = language === "ko" ? "index.md" : "index.en.md"
      const source = await readFile(join(fixtures, "legacy-no-ids", filename), "utf8")
      const match = /^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/.exec(source)
      if (!match?.[1] || !match[2]) throw new TypeError("Invalid legacy fixture")
      legacyLanguages.push({
        language,
        path: `content/posts/legacy-no-ids/${filename}`,
        rawFrontMatter: `${match[1]}\n`,
        frontMatter: frontMatterSchema.parse(parse(match[1])),
        // This fixture has three known blocks; document migration remains C's responsibility.
        blocks: match[2]
          .trimEnd()
          .split("\n\n")
          .map((markdown, index) => ({
            id: `legacy-no-ids-${index + 1}`,
            markdown,
          })),
      })
    }
    const [ko, en] = legacyLanguages
    if (!ko || !en) throw new TypeError("Missing legacy language")
    const parityBundles = [...fixtureBundles, { slug: "legacy-no-ids", ko, en }]
    const missing: string[] = []
    for (const path of laneDPaths) {
      try {
        await access(join(repo, path))
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error
        missing.push(path)
      }
    }
    await mkdir(join(temporary, "content/posts"), { recursive: true })
    const differences: { fixture: string; hugo: string; renderer: string }[] = []
    for (const bundle of parityBundles) {
      await cp(join(fixtures, bundle.slug), join(temporary, "content/posts", bundle.slug), {
        recursive: true,
      })
    }
    const config = z
      .record(z.string(), z.unknown())
      .parse(parse(await readFile(join(repo, "hugo.yaml"), "utf8")))
    await writeFile(
      join(temporary, "hugo.yaml"),
      stringify({
        ...config,
        themesDir: join(repo, "themes"),
        layoutDir: join(repo, "layouts"),
        assetDir: join(repo, "assets"),
        i18nDir: join(repo, "i18n"),
        minify: { minifyOutput: false },
        caches: { assets: { dir: join(temporary, "cache") } },
      }),
    )
    // When: run the actual Hugo binary. No files under repository content/ are written.
    const hugo = Bun.spawn(
      [
        "hugo",
        "--source",
        temporary,
        "--buildDrafts",
        "--buildFuture",
        "--destination",
        join(temporary, "public"),
      ],
      { stdout: "pipe", stderr: "pipe" },
    )
    const [exitCode, stdout, stderr] = await Promise.all([
      hugo.exited,
      new Response(hugo.stdout).text(),
      new Response(hugo.stderr).text(),
    ])
    if (missing.length) {
      throw new Error(
        `Hugo parity awaits lane D: ${missing.join(", ")}. Hugo exit ${exitCode}.\n${stdout}\n${stderr}`,
      )
    }
    expect({ exitCode, stdout: exitCode ? stdout : "", stderr: exitCode ? stderr : "" }).toEqual({
      exitCode: 0,
      stdout: "",
      stderr: "",
    })
    for (const bundle of parityBundles) {
      for (const language of [bundle.ko, bundle.en]) {
        const html = await readFile(
          join(
            temporary,
            "public",
            language.language === "en" ? "en" : "",
            "posts",
            bundle.slug,
            "index.html",
          ),
          "utf8",
        )
        const compared = await page.evaluate(
          ({ html, language }) => {
            const hugo = new DOMParser()
              .parseFromString(html, "text/html")
              .querySelector(".post-content")
            if (!(hugo instanceof HTMLElement))
              throw new TypeError("Hugo did not render post-content")
            window.renderFixtureMath(hugo, window.onsiteRenderer.MATH_OPTIONS)
            const preview = document.createElement("div")
            preview.innerHTML = window.onsiteRenderer.createRenderer().render(language).html
            const js = preview.querySelector(".post-content")
            if (!js) throw new TypeError("Renderer did not return post-content")
            const normalize = (element: Element): string => {
              const clone = element.cloneNode(true)
              if (!(clone instanceof Element)) throw new TypeError("Missing clone")
              // Hugo emits a fingerprinted interaction asset; the sandbox adds trusted code itself.
              for (const script of clone.querySelectorAll("script")) script.remove()
              for (const node of [clone, ...clone.querySelectorAll("*")]) {
                node.removeAttribute("data-block-id")
                if (node.id.startsWith("block-")) node.removeAttribute("id")
                // Attribute order and insignificant inter-tag whitespace are not DOM structure.
                const attributes = [...node.attributes].sort((a, b) => a.name.localeCompare(b.name))
                for (const attr of [...node.attributes]) node.removeAttribute(attr.name)
                for (const attr of attributes) node.setAttribute(attr.name, attr.value)
              }
              const walker = document.createTreeWalker(
                clone,
                NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT,
              )
              const remove: Node[] = []
              while (walker.nextNode()) {
                const node = walker.currentNode
                if (node.nodeType === Node.COMMENT_NODE) remove.push(node)
                else if (!node.parentElement?.closest("pre,code")) {
                  if (!node.textContent?.trim()) remove.push(node)
                  else node.textContent = node.textContent?.replace(/\s+/g, " ") ?? ""
                }
              }
              for (const node of remove) node.parentNode?.removeChild(node)
              return clone.outerHTML
            }
            return { hugo: normalize(hugo), renderer: normalize(js) }
          },
          { html, language },
        )
        // Then: retain every element, class, attribute and meaningful text, including code/math.
        if (compared.renderer !== compared.hugo) {
          let offset = 0
          while (
            offset < compared.hugo.length &&
            compared.renderer[offset] === compared.hugo[offset]
          )
            offset++
          differences.push({
            fixture: `${bundle.slug}/${language.language}`,
            hugo: compared.hugo.slice(Math.max(0, offset - 80), offset + 180),
            renderer: compared.renderer.slice(Math.max(0, offset - 80), offset + 180),
          })
        }
      }
    }
    expect(differences).toEqual([])
    const artifacts = await mkdtemp(join(tmpdir(), "onsite-render-visual-"))
    const styles: string[] = []
    for await (const path of new Bun.Glob("**/*.css").scan({
      cwd: join(temporary, "public/assets"),
      absolute: true,
    })) {
      styles.push(await readFile(path, "utf8"))
    }
    styles.push(
      await readFile(
        resolve(import.meta.dir, "../../node_modules/katex/dist/katex.min.css"),
        "utf8",
      ),
    )
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      for (const bundle of parityBundles) {
        await page.evaluate(
          async ({ bundle, cssText, baseUrl, width }) => {
            document.body.style.margin = "0"
            document.querySelector("iframe")?.remove()
            const iframe = document.createElement("iframe")
            iframe.style.cssText = `display:block;border:0;width:${width}px;height:1000px`
            document.body.append(iframe)
            const loaded = new Promise<void>((resolve) =>
              iframe.addEventListener("load", () => resolve(), { once: true }),
            )
            window.onsiteRenderer.mountPreview(
              iframe,
              window.onsiteRenderer
                .createRenderer({
                  resolveImage: (src, language) =>
                    `${baseUrl}posts/${language.path.split("/")[2]}/${src}`,
                })
                .render(bundle.ko),
              { cssText, baseUrl: `${baseUrl}posts/${bundle.slug}/` },
            )
            await loaded
          },
          { bundle, cssText: styles.join("\n"), baseUrl: server.url.href, width },
        )
        const frame = page.frames().find((candidate) => candidate !== page.mainFrame())
        if (!frame) throw new TypeError("Missing visual preview frame")
        await frame.evaluate(async () => {
          await document.fonts.ready
          await Promise.all(
            [...document.images].map((image) => {
              image.loading = "eager"
              return image.decode()
            }),
          )
        })
        expect(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        if (bundle.slug === "interactive-blocks") {
          await frame.getByRole("tab", { name: "코드", exact: true }).click()
          expect(await frame.getByRole("tabpanel").filter({ visible: true }).count()).toBe(1)
          await frame.locator(".compare-range").fill("75")
          expect(await frame.locator(".compare").getAttribute("style")).toContain("75%")
        }
        await page
          .locator("iframe")
          .screenshot({ path: join(artifacts, `${bundle.slug}-${width}.png`) })
      }
    }
    console.info(`Renderer visual evidence: ${artifacts}`)
    await page.evaluate(() => document.querySelector("iframe")?.remove())
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}, 30000)
