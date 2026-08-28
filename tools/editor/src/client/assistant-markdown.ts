import { Marked, Renderer } from "marked"

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function safeLink(href: string): boolean {
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(href).protocol)
  } catch {
    return false
  }
}

const renderer = new Renderer()
renderer.html = () => ""
renderer.image = ({ text }) => escapeAttribute(text)
renderer.link = function link({ href, title, tokens }) {
  const label = this.parser.parseInline(tokens)
  if (!safeLink(href)) {
    return label
  }
  const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : ""
  return `<a href="${escapeAttribute(href)}"${titleAttribute} target="_blank" rel="noopener noreferrer">${label}</a>`
}

const assistantMarkdown = new Marked({ renderer, gfm: true, breaks: true })

export function renderAssistantMarkdown(markdown: string): string {
  const rendered = assistantMarkdown.parse(markdown)
  if (typeof rendered !== "string") {
    throw new Error("에이전트 Markdown을 동기적으로 렌더링하지 못했습니다.")
  }
  return rendered
}
