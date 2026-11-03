import type { Marked } from "marked"
import { scanFootnote } from "../document/footnotes"
import { escapeHtml } from "./index"

/** Per-render state, never shared between languages or preview sessions. */
export function installPresets(markdown: Marked) {
  const definitions = new Map<string, string>()
  const references = new Map<string, number>()
  const counts = new Map<string, number>()
  markdown.use({
    extensions: [
      {
        name: "leadParagraph",
        level: "block",
        start: (source) => /(?:^|\n\n)[^\n][\s\S]*?\n\{\.lead\}(?:\n|$)/.exec(source)?.index,
        tokenizer(source) {
          const match = /^((?:(?!\n\n)[\s\S])+)\n\{\.lead\}(?:\n|$)/.exec(source)
          if (!match || /^(?:#|>|[-*] |```|~~~|\{\{)/.test(match[1] ?? "")) return undefined
          return { type: "leadParagraph", raw: match[0], text: match[1] ?? "" }
        },
        renderer(token) {
          return `<p class="lead">${markdown.parseInline(token["text"] ?? "")}</p>\n`
        },
      },
      {
        name: "footnoteDefinition",
        level: "block",
        start: (source) => /^ {0,3}\[\^[^\]\s]+\]:/m.exec(source)?.index,
        tokenizer(source) {
          const footnote = scanFootnote(source)
          if (!footnote) return undefined
          definitions.set(footnote.label, footnote.body)
          return { type: "footnoteDefinition", raw: footnote.raw }
        },
        renderer: () => "",
      },
      {
        name: "footnoteReference",
        level: "inline",
        start: (source) => source.indexOf("[^"),
        tokenizer(source) {
          const match = /^\[\^([^\]\s]+)\]/.exec(source)
          return match ? { type: "footnoteReference", raw: match[0], label: match[1] } : undefined
        },
        renderer(token) {
          const label = String(token["label"])
          if (!definitions.has(label)) return escapeHtml(token.raw)
          const number = references.get(label) ?? references.size + 1
          references.set(label, number)
          const count = counts.get(label) ?? 0
          counts.set(label, count + 1)
          return `<sup id="fnref${count || ""}:${number}"><a href="#fn:${number}" class="footnote-ref" role="doc-noteref">${number}</a></sup>`
        },
      },
    ],
  })
  return {
    collect(sources: readonly string[]) {
      for (const source of sources) markdown.lexer(source)
    },
    footnotes(): string {
      if (!references.size) return ""
      const items = [...references]
        .map(([label, number]) => {
          const body = markdown.parse(definitions.get(label) ?? "", { async: false })
          const back = Array.from(
            { length: counts.get(label) ?? 1 },
            (_, index) =>
              `&#160;<a href="#fnref${index || ""}:${number}" class="footnote-backref" role="doc-backlink">&#8617;&#xfe0e;</a>`,
          ).join("")
          return `<li id="fn:${number}">${body.replace(/<\/p>\s*$/, `${back}</p>`)}</li>`
        })
        .join("")
      return `<div class="footnotes" role="doc-endnotes"><hr><ol>${items}</ol></div>`
    },
  }
}
