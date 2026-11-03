import DOMPurify from "dompurify"
import { youtubeId } from "../document/youtube"
import type { BundleLanguage } from "../shared/onsite/document"
import { escapeHtml } from "./index"

interface ShortcodeContext {
  readonly parse: (source: string) => string
  readonly language: BundleLanguage
  readonly resolveRef: ((reference: string, language: BundleLanguage) => string) | undefined
  readonly nextOrdinal: () => number
}

export class RenderSyntaxError extends Error {
  constructor(
    readonly shortcode: string,
    message: string,
  ) {
    super(message)
    this.name = "RenderSyntaxError"
  }
}

function attributes(source: string): Record<string, string> {
  return Object.fromEntries(
    [...source.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g)].map((match) => [
      match[1] ?? "",
      match[2] ?? match[3] ?? match[4] ?? "",
    ]),
  )
}

export function renderShortcodes(source: string, context: ShortcodeContext): string {
  // Code spans/fences are literal, including shortcode-looking text.
  const code: string[] = []
  const protectedSource = source.replace(
    /`{3,}[^\n]*\n[\s\S]*?\n`{3,}|~{3,}[^\n]*\n[\s\S]*?\n~{3,}|`[^`\n]*`/g,
    (literal) => {
      code.push(literal)
      return `\uE000${code.length - 1}\uE001`
    },
  )
  const restore = (value: string): string =>
    value.replace(/\uE000(\d+)\uE001/g, (marker, index: string) => code[Number(index)] ?? marker)
  const result = replaceShortcodes(protectedSource, {
    ...context,
    parse: (value) => context.parse(restore(value)),
  })
  if (/{{[<%]\s*\/?tab\b[^}]*[>%]}}/.test(result)) {
    throw new RenderSyntaxError("tab", "The tab shortcode must be nested inside tabs")
  }
  return restore(result)
}

function replaceShortcodes(source: string, context: ShortcodeContext): string {
  const ref = source.replace(/{{[<%]\s*ref\s+(.*?)\s*[>%]}}/g, (_raw, args: string) => {
    context.nextOrdinal()
    const attrs = attributes(args)
    const target = attrs["path"] ?? /["']([^"']+)["']/.exec(args)?.[1] ?? args.trim()
    if (context.resolveRef) return context.resolveRef(target, context.language)
    const prefix = (attrs["lang"] ?? context.language.language) === "en" ? "/en" : ""
    const [path = "", anchor] = target.split("#")
    return `https://hyper-accel.github.io${prefix}/${path.replace(/^\/|(?:\/index)?(?:\.en)?\.md$/g, "").replace(/\/$/, "")}/${anchor ? `#${anchor}` : ""}`
  })
  return ref
    .replace(/\{\{<\s*youtube\s+["']?([\w-]{11})["']?\s*>\}\}/g, (raw, id: string) =>
      youtubeId(id) ? `<div data-youtube-video="${id}"></div>\n\n` : escapeHtml(raw),
    )
    .replace(
      /{{[<%]\s*rawhtml\s*[>%]}}([\s\S]*?){{[<%]\s*\/rawhtml\s*[>%]}}/g,
      (_raw, inner: string) => {
        context.nextOrdinal()
        return inner
      },
    )
    .replace(/{{[<%]\s*figure\s+(.*?)\s*[>%]}}/g, (_raw, args: string) => {
      context.nextOrdinal()
      const a = attributes(args)
      const captionText = document.createElement("span")
      captionText.innerHTML = DOMPurify.sanitize(context.parse(a["caption"] ?? ""))
      const alt = a["alt"] ?? captionText.textContent?.trim() ?? ""
      const img = `<img loading="lazy" src="${escapeHtml(a["src"] ?? "")}${a["align"] === "center" ? "#center" : ""}"${alt ? ` alt="${escapeHtml(alt)}"` : ""}${a["width"] ? ` width="${escapeHtml(a["width"])}"` : ""}${a["height"] ? ` height="${escapeHtml(a["height"])}"` : ""}>`
      const image = a["link"]
        ? `<a href="${escapeHtml(a["link"])}"${a["target"] ? ` target="${escapeHtml(a["target"])}"` : ""}${a["rel"] ? ` rel="${escapeHtml(a["rel"])}"` : ""}>${img}</a>`
        : img
      const caption = a["title"] || a["caption"] || a["attr"]
      const classes = `${a["align"] === "center" ? "align-center " : ""}${a["class"] ?? ""}`
      const attr = context.parse(a["attr"] ?? "").replace(/^<p>|<\/p>\s*$/g, "")
      return `<figure${classes ? ` class="${escapeHtml(classes)}"` : ""}>${image}${caption ? `<figcaption>${a["title"] ? `\n ${escapeHtml(a["title"])}` : ""}${a["caption"] || a["attr"] ? `<p>${context.parse(a["caption"] ?? "").replace(/^<p>|<\/p>\s*$/g, "")}${a["attrlink"] ? `<a href="${escapeHtml(a["attrlink"])}">${attr}</a>` : attr}</p>` : ""}</figcaption>` : ""}</figure>`
    })
    .replace(
      /{{[<%]\s*(pair|slides|steps|compare|tabs)\b([^}]*?)[>%]}}([\s\S]*?){{[<%]\s*\/\1\s*[>%]}}/g,
      (_raw, name: string, args: string, inner: string) => {
        const a = attributes(args)
        const ordinal = context.nextOrdinal()
        switch (name) {
          case "pair": {
            const images = inner.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []
            if (images.length < 2 || images.length > 3)
              throw new RenderSyntaxError(name, "Expected two or three images")
            // As layouts/shortcodes/pair.html: a picture of known size carries its aspect ratio.
            const figures = images.map((image) => {
              const html = context.parse(image)
              const size = /<img [^>]*\bwidth="(\d+)" height="(\d+)"/.exec(html)
              const ratio = size ? Number(size[1]) / Number(size[2]) : 0
              return ratio > 0
                ? html.replace("<figure ", `<figure style="--pair-ratio:${ratio.toFixed(4)}" `)
                : html
            })
            return `<div class="figure-pair" data-count="${images.length}">${figures.join("")}</div>\n\n`
          }
          case "slides": {
            const images = inner.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []
            if (images.length < 2 || images.length > 10)
              throw new RenderSyntaxError(name, "Expected two to ten images")
            const ko = context.language.language === "ko"
            const slides = images
              .map(
                (image, index) =>
                  `<div class="slide" role="group" aria-roledescription="slide" aria-label="${index + 1} / ${images.length}">${context.parse(image)}</div>`,
              )
              .join("")
            return `<figure class="figure figure-slides" role="group" aria-roledescription="carousel" aria-label="${ko ? "사진 슬라이드" : "Photo slides"}"><div class="slides-stage"><div class="slides" tabindex="0">${slides}</div><button class="slides-prev" type="button" aria-label="${ko ? "이전 사진" : "Previous photo"}" hidden>‹</button><button class="slides-next" type="button" aria-label="${ko ? "다음 사진" : "Next photo"}" hidden>›</button><span class="slides-count" aria-hidden="true" hidden>1 / ${images.length}</span></div></figure>\n\n`
          }
          case "steps":
            return `<div class="steps">${context.parse(inner.trim())}</div>\n\n`
          case "compare": {
            const start = Math.max(0, Math.min(100, Math.trunc(Number(a["start"] ?? "50") || 0)))
            const images = inner.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []
            if (images.length !== 2)
              throw new RenderSyntaxError(name, "Expected exactly two images")
            const panes = images
              .map((image, index) => {
                const label =
                  /"([^"]*)"\s*\)$/.exec(image)?.[1] ?? /^!\[([^\]]*)\]/.exec(image)?.[1] ?? ""
                return `<div class="compare-pane compare-${index === 0 ? "before" : "after"}">${context.parse(image)}<span class="compare-label">${escapeHtml(label)}</span></div>`
              })
              .join("")
            return `<figure class="figure figure-compare" data-start="${start}"><div class="compare" style="--compare-pos:${start}%">${panes}<div class="compare-divider" aria-hidden="true"></div><input class="compare-range" type="range" min="0" max="100" step="1" value="${start}" aria-label="${context.language.language === "ko" ? "비교 위치" : "Comparison position"}" hidden></div>${a["caption"] ? `<figcaption>${escapeHtml(a["caption"])}</figcaption>` : ""}</figure>\n\n`
          }
          case "tabs": {
            const tabs = [
              ...inner.matchAll(/{{[<%]\s*tab\b([^}]*?)[>%]}}([\s\S]*?){{[<%]\s*\/tab\s*[>%]}}/g),
            ]
            const panels = tabs.map((tab, index) => ({
              id: `tabs-${ordinal}-panel-${index}`,
              name: attributes(tab[1] ?? "")["name"] || `Tab ${index + 1}`,
              content: context.parse((tab[2] ?? "").trim()),
            }))
            if (!panels.length) throw new RenderSyntaxError(name, "Expected at least one tab")
            return `<div class="tabs"><div class="tabs-list" role="tablist" aria-label="${context.language.language === "ko" ? "탭" : "Tabs"}">${panels.map((panel, index) => `<button class="tabs-tab" type="button" role="tab" id="${panel.id}-tab" aria-controls="${panel.id}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${escapeHtml(panel.name)}</button>`).join("")}</div>${panels.map((panel) => `<div class="tabs-panel" role="tabpanel" id="${panel.id}" aria-labelledby="${panel.id}-tab" tabindex="0"><h4 class="tabs-panel-title">${escapeHtml(panel.name)}</h4>${panel.content}</div>`).join("")}</div>\n\n`
          }
          default:
            return escapeHtml(_raw)
        }
      },
    )
}
