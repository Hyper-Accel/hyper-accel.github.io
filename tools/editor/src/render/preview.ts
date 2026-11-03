import DOMPurify from "dompurify"
import { z } from "zod"
import {
  REVIEW_IFRAME_SANDBOX,
  type RenderResult,
  renderSelectionMessageSchema,
} from "../shared/onsite/render"
import { escapeHtml } from "./index"

const selectionRectSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative(),
  })
  .strict()

/** Rectangles are iframe viewport coordinates, not parent-page coordinates. */
export const selectionMessageSchema = renderSelectionMessageSchema
  .extend({ rects: z.array(selectionRectSchema).max(10000) })
  .strict()
  .refine(
    (message) => message.blockIds.length > 1 || message.startOffset < message.endOffset,
    "Empty selection",
  )
  .refine(
    (message) => new Set(message.blockIds).size === message.blockIds.length,
    "Duplicate blocks",
  )

export type SelectionMessage = z.infer<typeof selectionMessageSchema>

export interface PreviewOptions {
  /** Trusted, compiled site CSS including KaTeX and Chroma styles. */
  readonly cssText?: string
  readonly cssUrls?: readonly string[]
  /** Absolute bundle URL, used by legacy raw HTML/figure relative resources. */
  readonly baseUrl?: string
  readonly language?: "ko" | "en"
}

/** Runs only inside the opaque-origin frame; it has no imports or parent data access. */
function previewInteractions(): void {
  const content = document.querySelector(".post-content")
  if (!content) return
  const measureViewport = (): void =>
    document.body.style.setProperty(
      "--reading-viewport",
      `${document.documentElement.clientWidth}px`,
    )
  measureViewport()
  new ResizeObserver(measureViewport).observe(document.documentElement)
  for (const compare of content.querySelectorAll<HTMLElement>(".compare")) {
    const range = compare.querySelector("input")
    if (!range) continue
    const apply = (): void => compare.style.setProperty("--compare-pos", `${range.value}%`)
    range.addEventListener("input", apply)
    range.hidden = false
    compare.classList.add("is-ready")
    apply()
  }
  for (const tabs of content.querySelectorAll(".tabs")) {
    const buttons = [...tabs.querySelectorAll<HTMLButtonElement>(":scope > .tabs-list > .tabs-tab")]
    const panels = buttons.map((button) =>
      document.getElementById(button.getAttribute("aria-controls") ?? ""),
    )
    const select = (index: number, focus = false): void => {
      buttons.forEach((button, i) => {
        const selected = i === index
        button.setAttribute("aria-selected", String(selected))
        button.tabIndex = selected ? 0 : -1
        const panel = panels[i]
        if (panel) panel.hidden = !selected
      })
      if (focus) buttons[index]?.focus()
    }
    buttons.forEach((button, index) => {
      button.addEventListener("click", () => select(index))
      button.addEventListener("keydown", (event) => {
        let next: number
        switch (event.key) {
          case "ArrowRight":
            next = (index + 1) % buttons.length
            break
          case "ArrowLeft":
            next = (index + buttons.length - 1) % buttons.length
            break
          case "Home":
            next = 0
            break
          case "End":
            next = buttons.length - 1
            break
          default:
            return
        }
        event.preventDefault()
        select(next, true)
      })
    })
    tabs.classList.add("is-ready")
    select(0)
  }
  const emitSelection = (): void => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return
    const range = selection.getRangeAt(0)
    if (!content.contains(range.commonAncestorContainer)) return
    const pieces: { id: string; start: number; end: number; text: string }[] = []
    for (const block of content.querySelectorAll(":scope > [data-block-id]")) {
      if (!range.intersectsNode(block)) continue
      const local = document.createRange()
      local.selectNodeContents(block)
      if (local.compareBoundaryPoints(Range.START_TO_START, range) < 0) {
        local.setStart(range.startContainer, range.startOffset)
      }
      if (local.compareBoundaryPoints(Range.END_TO_END, range) > 0) {
        local.setEnd(range.endContainer, range.endOffset)
      }
      const prefix = document.createRange()
      prefix.selectNodeContents(block)
      prefix.setEnd(local.startContainer, local.startOffset)
      const start = prefix.toString().length
      const end = start + local.toString().length
      const id = block.getAttribute("data-block-id")
      if (id && end > start) {
        pieces.push({ id, start, end, text: (block.textContent ?? "").slice(start, end) })
      }
    }
    const first = pieces[0]
    const last = pieces[pieces.length - 1]
    if (!first || !last) return
    const rects = [...range.getClientRects()]
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map(({ x, y, width, height }) => ({ x, y, width, height }))
    parent.postMessage(
      {
        type: "onsite:selection",
        blockIds: pieces.map((piece) => piece.id),
        startOffset: first.start,
        endOffset: last.end,
        quotedText: pieces.map((piece) => piece.text).join("\n"),
        rects,
      },
      "*", // The parent origin is unknown to an opaque srcdoc frame; parent checks source.
    )
  }
  document.addEventListener("pointerup", emitSelection)
  document.addEventListener("keyup", emitSelection)
  content.addEventListener("click", (event) => {
    // Review links must not replace the document that owns the selection offsets.
    if (event.target instanceof Element && event.target.closest("a")) event.preventDefault()
  })
}

export function createPreviewSrcdoc(result: RenderResult, options: PreviewOptions = {}): string {
  const nonce = crypto.randomUUID().replace(/-/g, "")
  const cssUrls = (options.cssUrls ?? []).map((url) => {
    const parsed = new URL(url, options.baseUrl ?? document.baseURI)
    if (!["https:", "http:"].includes(parsed.protocol)) {
      throw new TypeError("Preview stylesheet URLs must use HTTP(S)")
    }
    return `<link rel="stylesheet" href="${escapeHtml(parsed.href)}">`
  })
  const base = options.baseUrl ? new URL(options.baseUrl) : undefined
  if (base && !["http:", "https:"].includes(base.protocol)) {
    throw new TypeError("Preview base URL must use HTTP(S)")
  }
  const html = DOMPurify.sanitize(result.html, {
    ADD_ATTR: ["focusable", "encoding"],
    ADD_TAGS: ["semantics", "annotation"],
    FORBID_TAGS: ["style", "script", "iframe", "form", "link", "meta", "base"],
    FORBID_ATTR: ["srcdoc"],
  })
  return `<!doctype html><html lang="${options.language ?? "ko"}" dir="auto" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' https: http:; img-src https: http: data: blob:; font-src https: http: data:; base-uri https: http:; form-action 'none'">${base ? `<base href="${escapeHtml(base.href)}">` : ""}${cssUrls.join("")}<style>${(options.cssText ?? "").replace(/<\/style/gi, "<\\/style")}</style></head><body class="reading-page" id="top"><main class="main" id="main-content"><div class="post-reading-layout"><article class="post-single">${html}</article></div></main><script nonce="${nonce}">(${previewInteractions.toString()})()</script></body></html>`
}

export function mountPreview(
  iframe: HTMLIFrameElement,
  result: RenderResult,
  options: PreviewOptions = {},
): void {
  iframe.setAttribute("sandbox", REVIEW_IFRAME_SANDBOX)
  iframe.setAttribute("title", "Post preview")
  iframe.srcdoc = createPreviewSrcdoc(result, options)
}

/** Call only for this mounted frame. Opaque origins intentionally report "null". */
export function readSelectionMessage(
  event: MessageEvent<unknown>,
  iframe: HTMLIFrameElement,
): SelectionMessage | null {
  if (!iframe.contentWindow || event.source !== iframe.contentWindow || event.origin !== "null") {
    return null
  }
  const parsed = selectionMessageSchema.safeParse(event.data)
  return parsed.success ? parsed.data : null
}
