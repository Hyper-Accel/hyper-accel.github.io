import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { getSchema, resolveExtensions } from "@tiptap/core"
import Image from "@tiptap/extension-image"
import { MarkdownManager } from "@tiptap/markdown"
import { EditorState } from "@tiptap/pm/state"
import StarterKit from "@tiptap/starter-kit"
import { BLOCK_ID_PATTERN } from "../../shared/onsite/blocks"
import { createHugoShortcode } from "../shortcode"
import { createBlockExtensions } from "./index"
import { createRawTrackingPlugin } from "./raw-tracking"

const extensions = [
  StarterKit.configure({ link: false, undoRedo: false }),
  ...createBlockExtensions(),
]
const manager = new MarkdownManager({
  extensions: resolveExtensions(extensions),
  markedOptions: { gfm: true },
})
const schema = getSchema(extensions)
const localEditorManager = new MarkdownManager({
  extensions: resolveExtensions([
    StarterKit.configure({ link: false, undoRedo: false }),
    Image.configure({ inline: false }),
    createHugoShortcode((source) => source),
  ]),
  markedOptions: { gfm: true },
})
const fixturesDir = resolve(import.meta.dir, "../../shared/onsite/fixtures")
const INLINE_REF = /\{\{[<%]\s*ref\b/

async function fixtureBody(slug: string, file: string): Promise<string> {
  const source = await Bun.file(resolve(fixturesDir, slug, file)).text()
  const withoutFrontMatter = source.replace(/^---\n[\s\S]*?\n---\n+/, "")
  return withoutFrontMatter.replace(/\n+$/, "")
}

function splitBlocks(body: string): string[] {
  return body
    .split(/\n\n(?=<!-- b:)/)
    .map((block) => block.replace(new RegExp(`${BLOCK_ID_PATTERN.source}\\n`, "m"), ""))
}

function roundTrip(markdown: string): string {
  return manager.serialize(manager.parse(markdown))
}

describe("fixture round trip", () => {
  for (const slug of ["image-layouts", "interactive-blocks"]) {
    for (const file of ["index.md", "index.en.md"]) {
      test(`${slug}/${file} serialises byte-identical when untouched`, async () => {
        const body = await fixtureBody(slug, file)
        const blocks = splitBlocks(body)
        expect(roundTrip(blocks.join("\n\n"))).toBe(blocks.join("\n\n"))
        for (const block of blocks) {
          expect(roundTrip(block)).toBe(block)
        }
      })
    }
  }

  for (const file of ["index.md", "index.en.md"]) {
    test(`math-and-legacy/${file} keeps math, code and shortcode blocks byte-identical`, async () => {
      const blocks = splitBlocks(await fixtureBody("math-and-legacy", file)).filter(
        (block) => !INLINE_REF.test(block),
      )
      expect(blocks.length).toBe(5)
      expect(roundTrip(blocks.join("\n\n"))).toBe(blocks.join("\n\n"))
    })
  }

  for (const slug of ["image-layouts", "interactive-blocks", "math-and-legacy"]) {
    test(`${slug} shortcodes stay verbatim atoms in the local editor configuration`, async () => {
      const blocks = splitBlocks(await fixtureBody(slug, "index.md")).filter((block) =>
        block.startsWith("{{"),
      )
      expect(blocks.length).toBeGreaterThanOrEqual(1)
      for (const block of blocks) {
        const json = localEditorManager.parse(block)
        expect(json.content?.map((node) => node.type)).toEqual(["hugoShortcode"])
        expect(localEditorManager.serialize(json)).toBe(block)
      }
    })
  }

  test("legacy-no-ids keeps the figure shortcode as an opaque atom", async () => {
    const body = await fixtureBody("legacy-no-ids", "index.md")
    const json = manager.parse(body)
    const figure = json.content?.find((node) => node.type === "hugoShortcode")
    expect(figure?.attrs?.["raw"]).toBe('{{< figure src="images/a.svg" caption="Legacy" >}}')
    expect(roundTrip(body)).toBe(body)
  })
})

describe("block parsing", () => {
  test("maps image presets and keeps the #side alias in raw", () => {
    const json = manager.parse('![별칭](images/a.svg#side)\n\n![넓게](images/a.svg#wide "캡션")')
    expect(json.content?.map((node) => node.attrs)).toEqual([
      {
        src: "images/a.svg",
        alt: "별칭",
        title: null,
        preset: "side-right",
        raw: "![별칭](images/a.svg#side)",
      },
      {
        src: "images/a.svg",
        alt: "넓게",
        title: "캡션",
        preset: "wide",
        raw: '![넓게](images/a.svg#wide "캡션")',
      },
    ])
  })

  test("parses compare params, tabs and alerts into structured nodes", () => {
    const json = manager.parse(
      [
        '{{< compare caption="전후 비교" start="40" >}}',
        "![이전](images/a.svg)",
        '![이후](images/b.svg "After")',
        "{{< /compare >}}",
        "",
        "{{< tabs >}}",
        '{{< tab name="한국어" >}}',
        "첫 번째",
        "{{< /tab >}}",
        '{{% tab name="코드" %}}',
        "```ts",
        "const x = 1",
        "```",
        "{{% /tab %}}",
        "{{< /tabs >}}",
        "",
        "> [!WARNING] 제목",
        "> 본문",
        ">",
        "> 둘째 단락",
      ].join("\n"),
    )
    const [compare, tabs, alert] = json.content ?? []
    expect(compare?.type).toBe("compare")
    expect(compare?.attrs?.["params"]).toEqual([
      { name: "caption", value: "전후 비교", quote: '"' },
      { name: "start", value: "40", quote: '"' },
    ])
    expect(compare?.attrs?.["after"]).toMatchObject({ src: "images/b.svg", title: "After" })
    expect(tabs?.type).toBe("tabs")
    expect(tabs?.content?.map((tab) => tab.attrs?.["delimiter"])).toEqual(["<", "%"])
    expect(tabs?.content?.[1]?.content?.[0]).toMatchObject({ type: "codeBlock" })
    expect(alert).toMatchObject({ type: "alert", attrs: { type: "WARNING", title: "제목" } })
    expect(alert?.content).toHaveLength(2)
  })

  test("falls back to an opaque atom for unknown or malformed blocks", () => {
    const json = manager.parse(
      "{{< pair >}}\n![only](images/a.svg)\n{{< /pair >}}\n\n{{< rawhtml >}}\n<b>x</b>\n{{< /rawhtml >}}",
    )
    expect(json.content?.map((node) => node.type)).toEqual(["hugoShortcode", "hugoShortcode"])
    expect(roundTrip("{{< rawhtml >}}\n<b>x</b>\n{{< /rawhtml >}}")).toBe(
      "{{< rawhtml >}}\n<b>x</b>\n{{< /rawhtml >}}",
    )
  })

  test("parses display and inline math into verbatim nodes", () => {
    const json = manager.parse(
      "인라인 $E=mc^2$와 $$a_b$$ 그리고 $5 and $6\n\n$$\n\\sum_{i=1}^{n} i\n$$\n\n$$x^2$$",
    )
    const [paragraph, block, single] = json.content ?? []
    expect(paragraph?.content?.map((node) => node.type)).toEqual([
      "text",
      "mathInline",
      "text",
      "mathInline",
      "text",
    ])
    expect(paragraph?.content?.[1]?.attrs).toEqual({
      source: "E=mc^2",
      display: false,
      raw: "$E=mc^2$",
    })
    expect(paragraph?.content?.[3]?.attrs).toMatchObject({ source: "a_b", display: true })
    expect(block).toEqual({
      type: "mathBlock",
      attrs: { source: "\\sum_{i=1}^{n} i", raw: "$$\n\\sum_{i=1}^{n} i\n$$" },
    })
    expect(single?.attrs).toEqual({ source: "x^2", raw: "$$x^2$$" })
    expect(
      manager.serialize({
        type: "doc",
        content: [{ type: "mathBlock", attrs: { source: "a+b" } }],
      }),
    ).toBe("$$\na+b\n$$")
  })

  test("does not split paragraphs around inline shortcodes or mid-line braces", () => {
    const source = '앞 문장\n{{< ref "/posts/x" >}} 뒤 문장'
    const json = manager.parse(source)
    expect(json.content).toHaveLength(1)
    expect(json.content?.[0]?.type).toBe("paragraph")
  })
})

describe("edited blocks serialise canonically", () => {
  const source = [
    "![별칭](images/a.svg#side)",
    "",
    '![본문](images/a.svg "캡션")',
    "",
    "{{< steps >}}",
    "1. 하나",
    "2. 둘",
    "{{< /steps >}}",
  ].join("\n")

  function createState() {
    return EditorState.create({
      doc: schema.nodeFromJSON(manager.parse(source)),
      plugins: [createRawTrackingPlugin()],
    })
  }

  test("changing a preset clears only that node's raw", () => {
    const state = createState()
    const image = state.doc.child(0)
    const next = state.apply(
      state.tr.setNodeMarkup(0, undefined, { ...image.attrs, preset: "side-left" }),
    )
    expect(next.doc.child(0).attrs["raw"]).toBeNull()
    expect(next.doc.child(1).attrs["raw"]).toBe('![본문](images/a.svg "캡션")')
    expect(manager.serialize(next.doc.toJSON())).toBe(
      [
        "![별칭](images/a.svg#side-left)",
        "",
        '![본문](images/a.svg "캡션")',
        "",
        "{{< steps >}}",
        "1. 하나",
        "2. 둘",
        "{{< /steps >}}",
      ].join("\n"),
    )
  })

  test("moving an untouched block keeps its raw", () => {
    const state = createState()
    const image = state.doc.child(0)
    const tr = state.tr.delete(0, image.nodeSize)
    tr.insert(tr.doc.content.size, image)
    const next = state.apply(tr)
    expect(next.doc.lastChild?.attrs["raw"]).toBe("![별칭](images/a.svg#side)")
  })

  test("editing inside a container clears the container's raw", () => {
    const state = createState()
    const stepsPos = state.doc.child(0).nodeSize + state.doc.child(1).nodeSize
    expect(state.doc.nodeAt(stepsPos)?.type.name).toBe("steps")
    const textPos = stepsPos + 4
    const next = state.apply(state.tr.insertText("첫째 ", textPos))
    expect(next.doc.nodeAt(stepsPos)?.attrs["raw"]).toBeNull()
    expect(manager.serialize(next.doc.toJSON())).toContain(
      "{{< steps >}}\n1. 첫째 하나\n2. 둘\n{{< /steps >}}",
    )
  })

  test("replacing the whole document keeps raw", () => {
    const state = createState()
    const replacement = schema.nodeFromJSON(manager.parse("![별칭](images/a.svg#side)"))
    const next = state.apply(state.tr.replaceWith(0, state.doc.content.size, replacement.content))
    expect(next.doc.child(0).attrs["raw"]).toBe("![별칭](images/a.svg#side)")
  })
})

describe("structure the published styles need", () => {
  test("steps that are not a numbered list are saved as numbered steps", () => {
    expect(
      roundTrip("{{< steps >}}\n입력을 준비합니다.\n\n결과를 확인합니다.\n{{< /steps >}}"),
    ).toBe("{{< steps >}}\n1. 입력을 준비합니다.\n2. 결과를 확인합니다.\n{{< /steps >}}")
  })

  test("an empty formula is not written out", () => {
    const saved = roundTrip("앞 문단\n\n$$\n\n$$\n\n뒤 문단")
    expect(saved).not.toContain("$$")
    expect(saved.replace(/\n+/g, "\n")).toBe("앞 문단\n뒤 문단")
  })
})
