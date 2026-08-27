import { Node } from "@tiptap/core"

function shortcodeLabel(raw: string): string {
  const name = /^\{\{[<%]\s*\/?([a-zA-Z0-9_-]+)/.exec(raw)?.[1]
  return name ? `Hugo · ${name}` : "Hugo shortcode"
}

function figureSource(raw: string): string | undefined {
  if (!/^\{\{[<%]\s*figure\b/.test(raw)) {
    return undefined
  }
  return /\bsrc=["']([^"']+)["']/.exec(raw)?.[1]
}

function matchShortcodeBlock(source: string): RegExpExecArray | null {
  const paired =
    /^(\{\{[<%]\s*rawhtml\s*[>%]\}\}[\s\S]*?\{\{[<%]\s*\/rawhtml\s*[>%]\}\})(?:\n+|$)/.exec(source)
  return paired ?? /^(\{\{[<%][^\n]*?[>%]\}\})(?:\n+|$)/.exec(source)
}

export function createHugoShortcode(mediaUrl: (source: string) => string): Node {
  return Node.create({
    name: "hugoShortcode",
    group: "block",
    atom: true,
    draggable: true,

    addAttributes() {
      return {
        raw: { default: "" },
      }
    },

    parseHTML() {
      return [{ tag: "div[data-hugo-shortcode]" }]
    },

    renderHTML({ node }) {
      return ["div", { "data-hugo-shortcode": "", "data-raw": String(node.attrs["raw"]) }]
    },

    markdownTokenizer: {
      name: "hugoShortcode",
      level: "block",
      start: (source) => {
        const angle = source.indexOf("{{<")
        const percent = source.indexOf("{{%")
        if (angle < 0) {
          return percent
        }
        return percent < 0 ? angle : Math.min(angle, percent)
      },
      tokenize: (source) => {
        const match = matchShortcodeBlock(source)
        const raw = match?.[1]
        if (!match || raw === undefined) {
          return undefined
        }
        return { type: "hugoShortcode", raw: match[0], shortcode: raw }
      },
    },

    parseMarkdown: (token) => ({
      type: "hugoShortcode",
      attrs: {
        raw: typeof token["shortcode"] === "string" ? token["shortcode"] : (token.raw ?? ""),
      },
    }),

    renderMarkdown: (node) => `${String(node.attrs?.["raw"] ?? "")}\n\n`,

    addNodeView() {
      return ({ node }) => {
        const raw = String(node.attrs["raw"])
        const dom = document.createElement("div")
        dom.className = "hugo-shortcode"
        dom.dataset["hugoShortcode"] = ""
        dom.contentEditable = "false"

        const source = figureSource(raw)
        if (source) {
          const image = document.createElement("img")
          image.src = mediaUrl(source)
          image.alt = ""
          dom.append(image)
        }

        const label = document.createElement("span")
        label.className = "hugo-shortcode__label"
        label.textContent = shortcodeLabel(raw)
        dom.append(label)

        const code = document.createElement("code")
        code.textContent = raw
        dom.append(code)
        return { dom }
      }
    },
  })
}
