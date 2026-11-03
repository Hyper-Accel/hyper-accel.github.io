import { type Editor, Mark } from "@tiptap/core"

/** Free text styling, as in Naver's editor: font, size, text colour and background colour. */
export const TEXT_STYLE_NODE = "textStyle"

export const STYLE_KEYS = ["fontFamily", "fontSize", "color", "backgroundColor"] as const
export type StyleKey = (typeof STYLE_KEYS)[number]
type StyleAttrs = Partial<Record<StyleKey, string | null>>

const CSS_PROPERTY: Record<StyleKey, string> = {
  fontFamily: "font-family",
  fontSize: "font-size",
  color: "color",
  backgroundColor: "background-color",
}

/** Korean web fonts offered by the font menu; the site and the editor load them on demand. */
export const FONTS: readonly { readonly label: string; readonly family: string }[] = [
  { label: "나눔고딕", family: "'Nanum Gothic', sans-serif" },
  { label: "나눔명조", family: "'Nanum Myeongjo', serif" },
  { label: "노토 세리프", family: "'Noto Serif KR', serif" },
  { label: "고운돋움", family: "'Gowun Dodum', sans-serif" },
  { label: "고운바탕", family: "'Gowun Batang', serif" },
  { label: "나눔펜", family: "'Nanum Pen Script', cursive" },
  { label: "나눔고딕코딩", family: "'Nanum Gothic Coding', monospace" },
]

/** The same stylesheet layouts/partials/d/fonts.html loads on editing pages and posts that use it. */
export const FONTS_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700&family=Nanum+Myeongjo:wght@400;700&family=Noto+Serif+KR:wght@400;700&family=Gowun+Dodum&family=Gowun+Batang:wght@400;700&family=Nanum+Pen+Script&family=Nanum+Gothic+Coding:wght@400;700&display=swap"

/** Naver's size list (px). */
export const FONT_SIZES = [11, 13, 15, 16, 19, 24, 28, 30, 34, 38] as const

/** Colours readable on the blog's dark page; any other colour comes from the colour picker. */
export const TEXT_COLORS = [
  "#ffffff",
  "#adb5bd",
  "#ff6b6b",
  "#ffa94d",
  "#ffd43b",
  "#69db7c",
  "#38d9a9",
  "#4dabf7",
  "#009ee2",
  "#9775fa",
  "#f783ac",
  "#495057",
] as const

const VALUE: Record<StyleKey, RegExp> = {
  // Quoted family names and generic fallbacks only: never url() or other CSS.
  fontFamily: /^(?:'[A-Za-z0-9 가-힣-]+'|[A-Za-z-]+)(?:,\s*(?:'[A-Za-z0-9 가-힣-]+'|[A-Za-z-]+))*$/,
  fontSize: /^\d{1,2}(?:\.\d)?px$/,
  color: /^#[0-9a-fA-F]{3,8}$/,
  backgroundColor: /^#[0-9a-fA-F]{3,8}$/,
}

function clean(key: StyleKey, value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim().replace(/"/g, "'")
  return VALUE[key].test(trimmed) ? trimmed : null
}

export function styleString(attrs: StyleAttrs): string {
  return STYLE_KEYS.flatMap((key) => {
    const value = clean(key, attrs[key])
    return value ? [`${CSS_PROPERTY[key]}: ${value}`] : []
  }).join("; ")
}

/** The style="" of a saved span; null when it holds anything but the four allowed properties. */
export function parseStyle(style: string): StyleAttrs | null {
  const attrs: StyleAttrs = {}
  for (const part of style.split(";")) {
    if (part.trim() === "") continue
    const colon = part.indexOf(":")
    const property = part.slice(0, colon).trim().toLowerCase()
    const key = STYLE_KEYS.find((candidate) => CSS_PROPERTY[candidate] === property)
    const value = key ? clean(key, part.slice(colon + 1)) : null
    if (!key || !value) return null
    attrs[key] = value
  }
  return Object.keys(attrs).length > 0 ? attrs : null
}

export const TextStyle = Mark.create({
  name: TEXT_STYLE_NODE,
  priority: 101,
  addAttributes() {
    return Object.fromEntries(
      STYLE_KEYS.map((key) => [
        key,
        {
          default: null,
          parseHTML: (element: HTMLElement) =>
            clean(key, element.style.getPropertyValue(CSS_PROPERTY[key])),
          renderHTML: () => ({}),
        },
      ]),
    )
  },
  // Only spans the editor wrote: styles pasted from other pages are not taken over.
  parseHTML: () => [{ tag: "span[data-text-style]" }],
  renderHTML: ({ mark }) => ["span", { "data-text-style": "", style: styleString(mark.attrs) }, 0],
  markdownTokenizer: {
    name: TEXT_STYLE_NODE,
    level: "inline",
    start: (source) => source.indexOf('<span style="'),
    tokenize(source, _tokens, lexer) {
      const match = /^<span style="([^"<>]*)">([\s\S]*?)<\/span>/.exec(source)
      const attrs = match ? parseStyle(match[1] ?? "") : null
      if (!match || !attrs) return undefined
      return {
        type: TEXT_STYLE_NODE,
        raw: match[0],
        styleAttrs: attrs,
        tokens: lexer.inlineTokens(match[2] ?? ""),
      }
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.applyMark(
      TEXT_STYLE_NODE,
      helpers.parseInline(token.tokens ?? []),
      token["styleAttrs"],
    ),
  renderMarkdown: (node, helpers) => {
    const style = styleString(node.attrs ?? {})
    const inner = helpers.renderChildren(node)
    return style ? `<span style="${style}">${inner}</span>` : inner
  },
})

/** Sets (or, with null, clears) one style of the selection; a span left with no style goes. */
export function applyTextStyle(editor: Editor, key: StyleKey, value: string | null): void {
  editor
    .chain()
    .focus()
    .setMark(TEXT_STYLE_NODE, { [key]: value })
    .command(({ tr, state }) => {
      const type = state.schema.marks[TEXT_STYLE_NODE]
      if (!type) return true
      const { from, to, empty } = tr.selection
      if (empty) {
        const stored = (tr.storedMarks ?? state.storedMarks ?? []).find(
          (mark) => mark.type === type,
        )
        if (stored && STYLE_KEYS.every((name) => !stored.attrs[name])) tr.removeStoredMark(type)
        return true
      }
      tr.doc.nodesBetween(from, to, (node, pos) => {
        for (const mark of node.marks)
          if (mark.type === type && STYLE_KEYS.every((name) => !mark.attrs[name]))
            tr.removeMark(Math.max(pos, from), Math.min(pos + node.nodeSize, to), mark)
      })
      return true
    })
    .run()
}

/** The value of one style at the selection (the first styled character), for the menus. */
export function currentStyle(editor: Editor, key: StyleKey): string | null {
  const value: unknown = editor.getAttributes(TEXT_STYLE_NODE)[key]
  return typeof value === "string" ? value : null
}
