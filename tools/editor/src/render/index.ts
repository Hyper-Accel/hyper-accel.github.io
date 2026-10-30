import DOMPurify from "dompurify"
import renderMathInElement from "katex/contrib/auto-render"
import { Marked } from "marked"
import {
  YOUTUBE_ALLOW,
  YOUTUBE_CONTAINER_STYLE,
  YOUTUBE_FRAME_STYLE,
  youtubeId,
  youtubeSource,
} from "../document/youtube"
import type { BundleLanguage } from "../shared/onsite/document"
import type { Renderer, RenderResult } from "../shared/onsite/render"
import { highlightCode } from "./highlight"
import { installPresets } from "./presets"
import { renderShortcodes } from "./shortcodes"

export interface RendererOptions {
  /** Resolve pending image Blobs here, without ever passing session data to the iframe. */
  readonly resolveImage?: (source: string, language: BundleLanguage) => string
  readonly resolveRef?: (reference: string, language: BundleLanguage) => string
  readonly imageSize?: (
    source: string,
  ) => { readonly width: number; readonly height: number } | undefined
  /** Use C's serialized file when edited metadata changes the YAML line count. */
  readonly serializedMarkdown?: (language: BundleLanguage) => string
}

const ALERT_ICONS: Readonly<Record<string, string>> = {
  note: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  tip: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.6 10.8c-.6.5-.6 1.2-.6 2.2h-6c0-1 0-1.7-.6-2.2A6 6 0 0 1 12 3z"/>',
  important: '<path d="M4 5h16v11H9l-5 4z"/><path d="M12 8v4M12 14h.01"/>',
  warning: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h.01"/>',
  caution: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M12 8v4M12 15h.01"/>',
}
const KOREAN_ALERT_LABELS: Readonly<Record<string, string>> = {
  note: "참고",
  tip: "팁",
  important: "중요",
  warning: "주의",
  caution: "경고",
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      default:
        return "&#39;"
    }
  })
}

export const MATH_OPTIONS = {
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "$", right: "$", display: false },
    { left: "\\(", right: "\\)", display: false },
    { left: "\\[", right: "\\]", display: true },
  ],
  throwOnError: false,
} as const

/** Requires a browser DOM. Rendering is synchronous; no network or auth is involved. */
export function createRenderer(options: RendererOptions = {}): Renderer {
  return {
    render(language): RenderResult {
      const headings = new Map<string, number>()
      let blockImages = false
      const shortcodeOrdinal = { value: 0 }
      const markdown: Marked = new Marked({
        async: false,
        gfm: true,
        renderer: {
          heading({ depth, tokens }) {
            const content = this.parser.parseInline(tokens)
            const text = document.createElement("span")
            text.innerHTML = DOMPurify.sanitize(content)
            const base = (text.textContent ?? "")
              .toLowerCase()
              .replace(/[^\p{L}\p{N}_ -]/gu, "")
              .replace(/ /g, "-")
            const occurrence = headings.get(base) ?? 0
            headings.set(base, occurrence + 1)
            const id = occurrence ? `${base}-${occurrence}` : base
            const anchor =
              language.frontMatter["disableAnchoredHeadings"] === true
                ? ""
                : `<a hidden class="anchor" aria-hidden="true" href="#${id}">#</a>`
            return `<h${depth} id="${escapeHtml(id)}">${content}${anchor}</h${depth}>\n`
          },
          image({ href, title, tokens }) {
            const [source = "", fragment = ""] = href.split("#")
            const preset = fragment === "side" ? "side-right" : fragment
            const known = ["wide", "side-left", "side-right"].includes(preset)
            const alt = document.createElement("span")
            alt.innerHTML = DOMPurify.sanitize(this.parser.parseInline(tokens))
            const resolved = options.resolveImage
              ? options.resolveImage(source, language)
              : /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(source)
                ? source
                : `/${language.path.split("/").slice(1, -1).join("/")}/${source.replace(/^\.\//, "")}`
            const size = options.imageSize?.(source)
            const img = `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt.textContent ?? "")}"${!blockImages && title ? ` title="${escapeHtml(title)}"` : ""} loading="lazy"${size ? ` width="${size.width}" height="${size.height}"` : ""}>`
            return blockImages
              ? `<figure class="figure figure-${known ? preset : "body"}">${img}${title ? `<figcaption>${escapeHtml(title)}</figcaption>` : ""}</figure>`
              : img
          },
          paragraph({ tokens }) {
            const previous = blockImages
            const images = tokens.every(
              (token) => token.type === "image" || /^\s*$/.test(token.raw),
            )
            blockImages = images
            const content = this.parser.parseInline(tokens)
            blockImages = previous
            return images ? `${content}\n` : `<p>${content}</p>\n`
          },
          blockquote({ text, tokens }): string {
            const alert =
              /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]+([^\n]*))?(?:\n|$)/.exec(text)
            if (!alert) return `<blockquote>\n${this.parser.parse(tokens)}</blockquote>\n`
            const type = (alert[1] ?? "NOTE").toLowerCase()
            const title = alert[2]
            const label =
              language.language === "ko"
                ? (KOREAN_ALERT_LABELS[type] ?? type)
                : `${type[0]?.toUpperCase()}${type.slice(1)}`
            return `<blockquote class="alert alert-${type}" role="note"><p class="alert-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ALERT_ICONS[type] ?? ""}</svg><span class="alert-type">${label}</span>${title ? `<span class="alert-heading">${markdown.parseInline(title)}</span>` : ""}</p>${markdown.parse(text.slice(alert[0].length), { async: false })}</blockquote>\n`
          },
          code({ text, lang }) {
            return highlightCode(text, lang ?? "")
          },
        },
      })
      const parse = (source: string, ordinal = shortcodeOrdinal): string =>
        markdown.parse(
          renderShortcodes(source, {
            parse: (inner) => parse(inner, { value: 0 }),
            language,
            resolveRef: options.resolveRef,
            nextOrdinal: () => ordinal.value++,
          }),
          { async: false },
        )
      const presets = installPresets(markdown)
      presets.collect(language.blocks.map((block) => block.markdown))
      const container = document.createElement("div")
      container.className = "post-content"
      const blockSourceMap: RenderResult["blockSourceMap"] = []
      const serializedLines = options
        .serializedMarkdown?.(language)
        .replace(/\r\n/g, "\n")
        .split("\n")
      let sourceCursor = 0
      // C's serialization: YAML delimiters, one empty line, marker, then Markdown.
      let startLine = language.rawFrontMatter.replace(/\n$/, "").split("\n").length + 5
      for (const block of language.blocks) {
        if (serializedLines) {
          const marker = serializedLines.indexOf(`<!-- b:${block.id} -->`, sourceCursor)
          if (marker < 0) throw new TypeError(`Serialized Markdown lacks block ${block.id}`)
          startLine = marker + 2
          sourceCursor = marker + 1 + block.markdown.split("\n").length
        }
        const fragment = document.createElement("div")
        fragment.innerHTML = DOMPurify.sanitize(parse(block.markdown), {
          ADD_ATTR: ["focusable", "encoding"],
          ADD_TAGS: ["semantics", "annotation"],
          FORBID_TAGS: ["style", "iframe", "form", "script", "link", "meta"],
          FORBID_ATTR: ["srcdoc"],
        })
        renderMathInElement(fragment, MATH_OPTIONS)
        // Sanitize after math too, keeping KaTeX's HTML, SVG and MathML.
        fragment.innerHTML = DOMPurify.sanitize(fragment.innerHTML, {
          ADD_ATTR: ["focusable", "encoding"],
          ADD_TAGS: ["semantics", "annotation"],
          FORBID_TAGS: ["style", "iframe", "form", "script", "link", "meta"],
          FORBID_ATTR: ["srcdoc"],
        })
        // Only an ID parsed from our own shortcode can create an iframe after sanitization.
        for (const video of fragment.querySelectorAll<HTMLElement>("[data-youtube-video]")) {
          const id = youtubeId(video.dataset["youtubeVideo"] ?? "")
          if (!id) continue
          video.removeAttribute("data-youtube-video")
          video.setAttribute("style", YOUTUBE_CONTAINER_STYLE)
          const frame = document.createElement("iframe")
          frame.src = youtubeSource(id)
          frame.title = "YouTube video"
          frame.setAttribute("style", YOUTUBE_FRAME_STYLE)
          frame.setAttribute("allow", YOUTUBE_ALLOW)
          frame.setAttribute("loading", "eager")
          frame.referrerPolicy = "strict-origin-when-cross-origin"
          video.append(frame)
        }
        for (const element of fragment.querySelectorAll("[data-block-id]")) {
          element.removeAttribute("data-block-id")
        }
        const only = fragment.children.length === 1 ? fragment.firstElementChild : null
        const element =
          only &&
          [...fragment.childNodes].every((node) => node === only || !node.textContent?.trim())
            ? only
            : fragment
        element.setAttribute("data-block-id", block.id)
        if (!element.id) element.id = `block-${block.id}`
        const count = block.markdown.split("\n").length
        blockSourceMap.push({
          blockId: block.id,
          path: language.path,
          startLine,
          endLine: startLine + count - 1,
          text: element.textContent ?? "",
        })
        startLine += count + 2
        container.append(element)
      }
      const notes = document.createElement("div")
      notes.innerHTML = DOMPurify.sanitize(presets.footnotes())
      container.append(...notes.childNodes)
      return { html: container.outerHTML, blockSourceMap }
    },
  }
}

export type { PreviewOptions, SelectionMessage } from "./preview"
export { createPreviewSrcdoc, mountPreview, readSelectionMessage } from "./preview"
export { RenderSyntaxError } from "./shortcodes"
