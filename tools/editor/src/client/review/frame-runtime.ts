export interface FrameRuntimeConfig {
  readonly contentId: string
  readonly markAttribute: string
  readonly messages: {
    readonly ready: string
    readonly height: string
    readonly selection: string
    readonly selectionCleared: string
    readonly commentShortcut: string
    readonly threadActivate: string
    readonly threadRect: string
    readonly escape: string
    readonly headingRect: string
    readonly highlights: string
    readonly reveal: string
    readonly clearSelection: string
    readonly heading: string
  }
}

// Serialized with Function.prototype.toString into the sandboxed srcdoc, so it must stay
// self-contained: no imports, no closure references, no TypeScript-only runtime features.
export function frameRuntime(config: FrameRuntimeConfig): void {
  const content = document.getElementById(config.contentId)
  if (!content) return
  const messages = config.messages
  const markAttribute = config.markAttribute
  const post = (message: Record<string, unknown>): void => {
    window.parent.postMessage(message, "*")
  }
  const topLevelBlocks = Array.from(
    content.querySelectorAll<HTMLElement>("[data-block-id]"),
  ).filter((element) => element.parentElement?.closest("[data-block-id]") === null)
  const blockById = new Map<string, HTMLElement>()
  for (const block of topLevelBlocks) {
    const id = block.getAttribute("data-block-id")
    if (id && !blockById.has(id)) blockById.set(id, block)
  }
  const textOf = (block: HTMLElement): string => block.textContent ?? ""
  const offsetWithin = (block: HTMLElement, container: Node, offset: number): number => {
    const range = document.createRange()
    range.setStart(block, 0)
    range.setEnd(container, offset)
    return range.toString().length
  }

  interface FrameSelection {
    blockIds: string[]
    startOffset: number
    endOffset: number
    quotedText: string
    rect: { top: number; left: number; width: number; height: number }
  }
  const readSelection = (): FrameSelection | null => {
    const selection = document.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
    const range = selection.getRangeAt(0)
    const selected = topLevelBlocks.filter((block) => range.intersectsNode(block))
    const first = selected[0]
    let last = selected[selected.length - 1]
    if (!first || !last) return null
    let startOffset = first.contains(range.startContainer)
      ? offsetWithin(first, range.startContainer, range.startOffset)
      : 0
    let endOffset = last.contains(range.endContainer)
      ? offsetWithin(last, range.endContainer, range.endOffset)
      : textOf(last).length
    while (selected.length > 1 && endOffset === 0) {
      selected.pop()
      last = selected[selected.length - 1] ?? first
      endOffset = textOf(last).length
    }
    while (selected.length > 1 && startOffset >= textOf(selected[0] ?? first).length) {
      selected.shift()
      startOffset = 0
    }
    if (selected.length === 1 && startOffset >= endOffset) return null
    const portions = selected.map((block, index) =>
      textOf(block).slice(
        index === 0 ? startOffset : 0,
        index === selected.length - 1 ? endOffset : undefined,
      ),
    )
    const quotedText = portions.join("\n")
    if (quotedText.trim() === "") return null
    const box = range.getBoundingClientRect()
    return {
      blockIds: selected.map((block) => block.getAttribute("data-block-id") ?? ""),
      startOffset,
      endOffset,
      quotedText,
      rect: {
        top: box.top + window.scrollY,
        left: box.left + window.scrollX,
        width: box.width,
        height: box.height,
      },
    }
  }

  let lastSignature: string | null = null
  const emitSelection = (): FrameSelection | null => {
    const current = readSelection()
    if (!current) {
      if (lastSignature !== null) {
        lastSignature = null
        post({ type: messages.selectionCleared })
      }
      return null
    }
    const signature = JSON.stringify([
      current.blockIds,
      current.startOffset,
      current.endOffset,
      Math.round(current.rect.top),
    ])
    if (signature !== lastSignature) {
      lastSignature = signature
      post({ type: messages.selection, ...current })
    }
    return current
  }

  const unwrapMarks = (): void => {
    const marks = content.querySelectorAll(`mark[${markAttribute}]`)
    for (const mark of Array.from(marks)) {
      const parent = mark.parentNode
      if (!parent) continue
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
      parent.removeChild(mark)
    }
    for (const block of topLevelBlocks) block.normalize()
  }
  interface HighlightItem {
    id: string
    blockIds: string[]
    startOffset: number
    endOffset: number
    state: string
    active: boolean
  }
  const wrapRange = (block: HTMLElement, start: number, end: number, item: HighlightItem): void => {
    if (end <= start) return
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    const targets: { node: Text; from: number; to: number }[] = []
    let position = 0
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text
      const length = text.data.length
      const nodeStart = position
      const nodeEnd = position + length
      position = nodeEnd
      if (length === 0 || nodeEnd <= start || nodeStart >= end) continue
      targets.push({
        node: text,
        from: Math.max(0, start - nodeStart),
        to: Math.min(length, end - nodeStart),
      })
    }
    for (const target of targets) {
      let node = target.node
      if (target.from > 0) node = node.splitText(target.from)
      if (target.to - target.from < node.data.length) node.splitText(target.to - target.from)
      const mark = document.createElement("mark")
      mark.setAttribute(markAttribute, item.id)
      mark.setAttribute("data-state", item.state)
      if (item.active) mark.setAttribute("data-active", "true")
      node.parentNode?.insertBefore(mark, node)
      mark.appendChild(node)
    }
  }
  const applyHighlights = (items: HighlightItem[]): void => {
    unwrapMarks()
    for (const item of items) {
      const lastIndex = item.blockIds.length - 1
      item.blockIds.forEach((id, index) => {
        const block = blockById.get(id)
        if (!block) return
        const start = index === 0 ? item.startOffset : 0
        const end = index === lastIndex ? item.endOffset : textOf(block).length
        wrapRange(block, start, end, item)
      })
    }
  }
  const revealThread = (threadId: string): void => {
    const mark = content.querySelector(`mark[${markAttribute}="${CSS.escape(threadId)}"]`)
    if (!mark) return
    const box = mark.getBoundingClientRect()
    post({
      type: messages.threadRect,
      threadId,
      top: box.top + window.scrollY,
      height: box.height,
    })
  }

  let dragging = false
  document.addEventListener("selectionchange", () => {
    if (!dragging) emitSelection()
  })
  document.addEventListener("mousedown", () => {
    dragging = true
  })
  document.addEventListener("mouseup", () => {
    dragging = false
    emitSelection()
  })
  document.addEventListener(
    "touchend",
    () => {
      dragging = false
      emitSelection()
    },
    { passive: true },
  )
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      post({ type: messages.escape })
      return
    }
    const modifier = event.metaKey || event.ctrlKey
    if (modifier && event.altKey && event.code === "KeyM") {
      event.preventDefault()
      if (emitSelection()) post({ type: messages.commentShortcut })
    }
  })
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null
    const anchor = target?.closest("a")
    if (anchor) event.preventDefault()
    const mark = target?.closest(`mark[${markAttribute}]`)
    const threadId = mark?.getAttribute(markAttribute)
    if (threadId) post({ type: messages.threadActivate, threadId })
  })
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return
    const data: unknown = event.data
    if (!data || typeof data !== "object") return
    const message = data as { type?: unknown; items?: unknown; threadId?: unknown; index?: unknown }
    if (message.type === messages.highlights && Array.isArray(message.items)) {
      applyHighlights(message.items as HighlightItem[])
    } else if (message.type === messages.reveal && typeof message.threadId === "string") {
      revealThread(message.threadId)
    } else if (message.type === messages.heading && typeof message.index === "number") {
      // Table of contents jump: report where the heading sits so the page can scroll to it.
      const heading = content.querySelectorAll("h1, h2, h3")[message.index]
      if (heading)
        post({
          type: messages.headingRect,
          top: heading.getBoundingClientRect().top + window.scrollY,
        })
    } else if (message.type === messages.clearSelection) {
      document.getSelection()?.removeAllRanges()
      lastSignature = null
    }
  })

  const postHeight = (): void => {
    post({
      type: messages.height,
      height: Math.ceil(document.documentElement.getBoundingClientRect().height),
    })
  }
  new ResizeObserver(postHeight).observe(document.body)
  window.addEventListener("load", postHeight)
  postHeight()
  post({ type: messages.ready })
}

export function frameRuntimeSource(config: FrameRuntimeConfig): string {
  const serialized = JSON.stringify(config).replaceAll("</", "<\\/")
  return `(${frameRuntime.toString()})(${serialized});`
}
