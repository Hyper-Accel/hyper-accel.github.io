import type { Language } from "../../shared/onsite/document"
import { REVIEW_IFRAME_SANDBOX } from "../../shared/onsite/render"
import type { BlockTexts } from "./anchors"
import { frameRuntimeSource } from "./frame-runtime"
import {
  FRAME_CONTENT_ID,
  FRAME_MESSAGES,
  type FrameMessage,
  frameMessageSchema,
  PARENT_MESSAGES,
  type ParentMessage,
  THREAD_MARK_ATTRIBUTE,
} from "./protocol"

export interface FrameDocument {
  readonly language: Language
  readonly theme: string
  readonly title: string
  readonly kicker: string | null
  readonly meta: readonly string[]
  readonly html: string
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

const FRAME_CSS = `
html { height: auto !important; min-height: 0 !important; }
body { margin: 0 !important; min-height: 0 !important; }
body.onsite-review-frame { background: var(--theme, transparent); }
.onsite-review-frame .main { min-height: 0 !important; padding-inline: 0 !important; }
.onsite-review-frame .post-reading-layout { max-width: var(--reading-width, 760px); margin-inline: auto; }
.onsite-review-frame .post-content { -webkit-user-select: text; user-select: text; }
mark[${THREAD_MARK_ATTRIBUTE}] {
  color: inherit;
  background: color-mix(in srgb, var(--tr-cyan, #009ee2) 26%, transparent);
  border-bottom: 2px solid color-mix(in srgb, var(--tr-cyan, #009ee2) 70%, transparent);
  border-radius: 2px;
  cursor: pointer;
}
mark[${THREAD_MARK_ATTRIBUTE}][data-state="resolved"] {
  background: transparent;
  border-bottom: 1px dashed var(--secondary, currentColor);
}
mark[${THREAD_MARK_ATTRIBUTE}][data-state="pending"] {
  background: color-mix(in srgb, var(--tr-cyan, #009ee2) 42%, transparent);
}
mark[${THREAD_MARK_ATTRIBUTE}][data-active="true"] {
  background: color-mix(in srgb, var(--tr-cyan, #009ee2) 48%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tr-cyan, #009ee2) 60%, transparent);
}
`

export function buildFrameSrcdoc(document: FrameDocument, stylesheets: readonly string[]): string {
  const links = stylesheets
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join("")
  const runtime = frameRuntimeSource({
    contentId: FRAME_CONTENT_ID,
    markAttribute: THREAD_MARK_ATTRIBUTE,
    messages: { ...FRAME_MESSAGES, ...PARENT_MESSAGES },
  })
  const kicker = document.kicker
    ? `<p class="post-kicker"><span class="tr-cat">${escapeHtml(document.kicker)}</span></p>`
    : ""
  const meta =
    document.meta.length > 0
      ? `<div class="post-meta">${document.meta
          .map((item) => `<span>${escapeHtml(item)}</span>`)
          .join("&nbsp;·&nbsp;")}</div>`
      : ""
  return [
    `<!doctype html><html lang="${document.language}" data-theme="${escapeHtml(document.theme)}">`,
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`,
    `${links}<style>${FRAME_CSS}</style></head>`,
    `<body class="reading-page onsite-review-frame"><main class="main"><div class="post-reading-layout">`,
    `<article class="post-single"><header class="post-header">${kicker}`,
    `<h1 class="post-title">${escapeHtml(document.title)}</h1>${meta}</header>`,
    `<div class="post-content" id="${FRAME_CONTENT_ID}">${document.html}</div>`,
    `</article></div></main><script>${runtime}</script></body></html>`,
  ].join("")
}

export function extractBlockTexts(html: string): BlockTexts {
  const parsed = new DOMParser().parseFromString(html, "text/html")
  const texts = new Map<string, string>()
  for (const element of parsed.body.querySelectorAll<HTMLElement>("[data-block-id]")) {
    if (element.parentElement?.closest("[data-block-id]")) continue
    const id = element.getAttribute("data-block-id")
    if (id && !texts.has(id)) texts.set(id, element.textContent ?? "")
  }
  return texts
}

export class ReviewFrame {
  readonly element: HTMLIFrameElement
  private readonly listener: (event: MessageEvent) => void

  constructor(
    host: HTMLElement,
    private readonly stylesheets: readonly string[],
    onMessage: (message: FrameMessage) => void,
  ) {
    this.element = document.createElement("iframe")
    this.element.className = "review-frame"
    this.element.setAttribute("sandbox", REVIEW_IFRAME_SANDBOX)
    this.element.title = "렌더된 글"
    host.append(this.element)
    this.listener = (event: MessageEvent): void => {
      if (event.source !== this.element.contentWindow) return
      const parsed = frameMessageSchema.safeParse(event.data)
      if (!parsed.success) return
      if (parsed.data.type === FRAME_MESSAGES.height) {
        this.element.style.height = `${parsed.data.height}px`
      }
      onMessage(parsed.data)
    }
    window.addEventListener("message", this.listener)
  }

  load(document: FrameDocument): void {
    this.element.srcdoc = buildFrameSrcdoc(document, this.stylesheets)
  }

  send(message: ParentMessage): void {
    this.element.contentWindow?.postMessage(message, "*")
  }

  dispose(): void {
    window.removeEventListener("message", this.listener)
    this.element.remove()
  }
}
