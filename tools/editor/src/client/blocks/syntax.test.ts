import { describe, expect, test } from "bun:test"
import {
  compareStart,
  parseAlertHead,
  parseImageLines,
  parseImageMarkdown,
  parseShortcodeTag,
  removeParam,
  scanShortcodeBlock,
  serializeAlert,
  serializeImageBlock,
  serializeImageMarkdown,
  serializeShortcodeTag,
  setParam,
} from "../shortcode"

describe("shortcode tags", () => {
  test("parses named, positional and quoted parameters", () => {
    const tag = parseShortcodeTag('{{< compare caption="전후 \\"비교\\"" start=50 `raw` >}}')
    expect(tag).not.toBeNull()
    expect(tag?.name).toBe("compare")
    expect(tag?.params).toEqual([
      { name: "caption", value: '전후 "비교"', quote: '"' },
      { name: "start", value: "50", quote: null },
      { name: null, value: "raw", quote: "`" },
    ])
    expect(tag?.delimiter).toBe("<")
    expect(tag?.closing).toBe(false)
  })

  test("recognises closing, self-closing and percent delimiters", () => {
    expect(parseShortcodeTag("{{< /pair >}}")).toMatchObject({ name: "pair", closing: true })
    expect(parseShortcodeTag("{{% steps %}}")).toMatchObject({ name: "steps", delimiter: "%" })
    expect(parseShortcodeTag('{{< figure src="a.png" />}}')).toMatchObject({ selfClosing: true })
    expect(parseShortcodeTag('{{< ref "/posts/x" >}})을 읽으세요.')).toBeNull()
    expect(parseShortcodeTag("{{< pairx")).toBeNull()
    expect(parseShortcodeTag('{{< tab name="unterminated >}}')).toBeNull()
  })

  test("serialises tags in the contract form", () => {
    expect(serializeShortcodeTag({ name: "pair" })).toBe("{{< pair >}}")
    expect(serializeShortcodeTag({ name: "pair", closing: true })).toBe("{{< /pair >}}")
    expect(
      serializeShortcodeTag({
        name: "compare",
        params: [
          { name: "caption", value: "전후 비교", quote: '"' },
          { name: "start", value: "50", quote: '"' },
        ],
      }),
    ).toBe('{{< compare caption="전후 비교" start="50" >}}')
    expect(serializeShortcodeTag({ name: "tabs", delimiter: "%" })).toBe("{{% tabs %}}")
  })

  test("scans paired blocks with same-name nesting and leaves unpaired tags single-line", () => {
    const source =
      '{{< tabs >}}\n{{< tab name="a" >}}\n{{< tabs >}}\n{{< /tabs >}}\n{{< /tab >}}\n{{< /tabs >}}\n\nafter'
    const block = scanShortcodeBlock(source)
    expect(block?.close?.name).toBe("tabs")
    expect(block?.raw).toBe(source.slice(0, source.indexOf("\n\nafter")))
    expect(block?.inner).toBe('{{< tab name="a" >}}\n{{< tabs >}}\n{{< /tabs >}}\n{{< /tab >}}')
    const single = scanShortcodeBlock('{{< figure src="images/a.svg" >}}\n\ntext')
    expect(single?.close).toBeNull()
    expect(single?.raw).toBe('{{< figure src="images/a.svg" >}}')
    expect(scanShortcodeBlock("plain paragraph")).toBeNull()
  })

  test("updates and removes parameters without reordering", () => {
    const caption = { name: "caption", value: "c", quote: '"' as const }
    const start = { name: "start", value: "50", quote: '"' as const }
    const params = [caption, start]
    expect(setParam(params, "start", "40")).toEqual([
      caption,
      { name: "start", value: "40", quote: '"' },
    ])
    expect(setParam(params, "foo", "x")).toHaveLength(3)
    expect(removeParam(params, "caption")).toEqual([start])
    expect(compareStart(params)).toBe(50)
    expect(compareStart([{ name: "start", value: "140", quote: null }])).toBe(100)
    expect(compareStart([])).toBe(50)
  })
})

describe("image syntax", () => {
  test("parses presets and the #side alias", () => {
    expect(parseImageMarkdown('![본문](images/a.svg "본문 캡션")')).toEqual({
      src: "images/a.svg",
      alt: "본문",
      title: "본문 캡션",
      preset: "body",
    })
    expect(parseImageMarkdown("![넓게](images/a.svg#wide)")?.preset).toBe("wide")
    expect(parseImageMarkdown("![별칭](images/a.svg#side)")).toMatchObject({
      src: "images/a.svg",
      preset: "side-right",
    })
    expect(parseImageMarkdown("![왼쪽](images/a.svg#side-left)")?.preset).toBe("side-left")
    expect(parseImageMarkdown("![x](images/a.svg#section)")).toMatchObject({
      src: "images/a.svg#section",
      preset: "body",
    })
    expect(parseImageMarkdown("not an image")).toBeNull()
  })

  test("serialises canonical syntax", () => {
    expect(
      serializeImageMarkdown({
        src: "images/a.svg",
        alt: "별칭",
        title: null,
        preset: "side-right",
      }),
    ).toBe("![별칭](images/a.svg#side-right)")
    expect(
      serializeImageMarkdown({
        src: "images/a.svg",
        alt: "a [b]",
        title: 'say "hi"',
        preset: "wide",
      }),
    ).toBe('![a \\[b\\]](images/a.svg#wide "say \\"hi\\"")')
    expect(
      serializeImageMarkdown({ src: "images/a.svg#section", alt: "", title: null, preset: "wide" }),
    ).toBe("![](images/a.svg#wide)")
  })

  test("parses two-image blocks", () => {
    const images = parseImageLines("![첫째](images/a.svg)\n\n![둘째](images/b.svg)\n")
    expect(images?.map((image) => image.src)).toEqual(["images/a.svg", "images/b.svg"])
    expect(parseImageLines("![첫째](images/a.svg)\ntext")).toBeNull()
    expect(
      serializeImageBlock(
        "pair",
        [],
        [
          { src: "images/a.svg", alt: "첫째", title: null, preset: "body" },
          { src: "images/b.svg", alt: "둘째", title: null, preset: "body" },
        ],
      ),
    ).toBe("{{< pair >}}\n![첫째](images/a.svg)\n![둘째](images/b.svg)\n{{< /pair >}}")
  })
})

describe("alert syntax", () => {
  test("parses the head line", () => {
    expect(parseAlertHead("> [!NOTE] 안내")).toEqual({ type: "NOTE", title: "안내" })
    expect(parseAlertHead("> [!CAUTION]")).toEqual({ type: "CAUTION", title: null })
    expect(parseAlertHead("> [!note] x")).toBeNull()
    expect(parseAlertHead("> plain quote")).toBeNull()
  })

  test("serialises the head and quoted body", () => {
    expect(serializeAlert({ type: "TIP", title: "안내" }, "검증할 내용입니다.")).toBe(
      "> [!TIP] 안내\n> 검증할 내용입니다.",
    )
    expect(serializeAlert({ type: "WARNING", title: null }, "a\n\nb")).toBe(
      "> [!WARNING]\n> a\n>\n> b",
    )
    expect(serializeAlert({ type: "NOTE", title: null }, "")).toBe("> [!NOTE]")
  })
})
