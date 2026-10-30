import { type Editor, Extension } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { createRenderer } from "../../render"
import type { DocumentCodec, Language, PostBundle } from "../../shared/onsite/document"
import type { GitHubAdapter } from "../../shared/onsite/github"
import type { ReviewThread } from "../../shared/onsite/review"
import { articleRanges } from "../composer/article-identity"
import { h } from "../composer/dom"
import {
  type AnchorContext,
  type BlockTexts,
  buildAnchor,
  placeThreads,
  type SelectionRange,
} from "../review/anchors"
import { extractBlockTexts } from "../review/frame"
import { describeGitHubError } from "../review/gates"
import { attachMentions, type Person } from "./mentions"
import "./comments.css"

/**
 * Confluence-style inline comments on the writing surface, stored as the draft pull request's
 * range comments (the same threads the review screen shows). @handles notify through GitHub.
 */
export interface SiteCommentsOptions {
  readonly github: GitHubAdapter
  readonly codec: DocumentCodec
  readonly people: () => Promise<readonly Person[]>
  readonly bundle: () => PostBundle | null
  /** Saves pending edits and returns the draft pull request and its head. */
  readonly ensureSaved: () => Promise<{ readonly number: number; readonly headSha: string }>
  readonly findPull: () => Promise<{ readonly number: number; readonly headSha: string } | null>
}

interface Indexed {
  readonly text: string
  /** Document position of each normalised character; one extra entry for the end. */
  readonly positions: readonly number[]
}

interface Normalised {
  readonly text: string
  /** Normalised index for each raw offset (raw.length + 1 entries). */
  readonly toNormal: readonly number[]
  /** Raw offset for each normalised index (text.length + 1 entries). */
  readonly toRaw: readonly number[]
}

interface Segment {
  readonly threadId: string
  readonly blockId: string
  readonly text: string
  readonly mode: "exact" | "suffix" | "prefix" | "whole"
  readonly occurrence: number
}

const marksKey = new PluginKey<DecorationSet>("siteCommentMarks")

function normalise(raw: string): Normalised {
  let text = ""
  const toNormal: number[] = []
  const toRaw: number[] = []
  let space = false
  for (let index = 0; index < raw.length; index += 1) {
    toNormal.push(text.length)
    const char = raw[index] ?? ""
    if (/\s/.test(char)) {
      if (!space && text.length > 0) {
        toRaw.push(index)
        text += " "
        space = true
      }
    } else {
      toRaw.push(index)
      text += char
      space = false
    }
  }
  toNormal.push(text.length)
  toRaw.push(raw.length)
  return { text, toNormal, toRaw }
}

function blockIndex(doc: PMNode, from: number, to: number): Indexed {
  let text = ""
  const positions: number[] = []
  let space = true
  doc.nodesBetween(from, to, (node, position) => {
    if (node.isText) {
      const value = node.text ?? ""
      for (let index = 0; index < value.length; index += 1) {
        const at = position + index
        if (at < from || at >= to) continue
        const char = value[index] ?? ""
        if (/\s/.test(char)) {
          if (!space) {
            text += " "
            positions.push(at)
            space = true
          }
        } else {
          text += char
          positions.push(at)
          space = false
        }
      }
      return false
    }
    if (node.isBlock && !space) {
      text += " "
      positions.push(position)
      space = true
    }
    return true
  })
  positions.push(to)
  return { text, positions }
}

function nth(haystack: string, needle: string, occurrence: number): number {
  let index = -1
  for (let count = 0; count <= occurrence; count += 1) {
    index = haystack.indexOf(needle, index + 1)
    if (index < 0) return -1
  }
  return index
}

function occurrencesBefore(haystack: string, needle: string, end: number): number {
  let count = 0
  let index = haystack.indexOf(needle)
  while (index >= 0 && index < end) {
    count += 1
    index = haystack.indexOf(needle, index + 1)
  }
  return count
}

function blockSpan(doc: PMNode, id: string): { from: number; to: number } | null {
  const ranges = articleRanges(doc).filter((range) => range.id === id)
  const first = ranges[0]
  const last = ranges.at(-1)
  return first && last ? { from: first.from, to: last.to } : null
}

/** Converts a placed rendered range into per-block segments the editor can find again. */
function segments(threadId: string, range: SelectionRange, texts: BlockTexts): Segment[] {
  const result: Segment[] = []
  const lastIndex = range.blockIds.length - 1
  for (const [index, blockId] of range.blockIds.entries()) {
    const raw = texts.get(blockId) ?? ""
    const norm = normalise(raw)
    const start = norm.toNormal[index === 0 ? range.startOffset : 0] ?? 0
    const end =
      norm.toNormal[index === lastIndex ? range.endOffset : raw.length] ?? norm.text.length
    const text = norm.text.slice(start, end).trim()
    if (!text) continue
    if (lastIndex === 0) {
      result.push({
        threadId,
        blockId,
        text,
        mode: "exact",
        occurrence: occurrencesBefore(norm.text, text, start),
      })
    } else {
      result.push({
        threadId,
        blockId,
        text,
        mode: index === 0 ? "suffix" : index === lastIndex ? "prefix" : "whole",
        occurrence: 0,
      })
    }
  }
  return result
}

function decorate(doc: PMNode, items: readonly Segment[], active: string | null): DecorationSet {
  const decorations: Decoration[] = []
  for (const segment of items) {
    const span = blockSpan(doc, segment.blockId)
    if (!span) continue
    const index = blockIndex(doc, span.from, span.to)
    let start: number
    if (segment.mode === "whole") start = index.text.search(/\S/)
    else if (segment.mode === "prefix") start = index.text.indexOf(segment.text)
    else if (segment.mode === "suffix") start = index.text.lastIndexOf(segment.text)
    else start = nth(index.text, segment.text, segment.occurrence)
    if (start < 0) continue
    const length =
      segment.mode === "whole" ? index.text.trimEnd().length - start : segment.text.length
    const from = index.positions[start]
    const lastChar = index.positions[start + length - 1]
    if (from === undefined || lastChar === undefined) continue
    decorations.push(
      Decoration.inline(from, lastChar + 1, {
        class: `composer-comment-mark${segment.threadId === active ? " is-active" : ""}`,
        "data-comment-thread": segment.threadId,
      }),
    )
  }
  return DecorationSet.create(doc, decorations)
}

function editorLanguage(editor: Editor): Language {
  return editor.view.dom.closest<HTMLElement>("[data-lang]")?.dataset["lang"] === "en" ? "en" : "ko"
}

function rectFor(editor: Editor, from: number, to: number): DOMRect {
  const start = editor.view.coordsAtPos(from)
  const end = editor.view.coordsAtPos(to, -1)
  return new DOMRect(
    start.left,
    Math.min(start.top, end.top),
    Math.max(1, end.right - start.left),
    Math.max(start.bottom, end.bottom) - Math.min(start.top, end.top),
  )
}

const TIME = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

function bodyNodes(body: string): (Node | string)[] {
  return body
    .split(/(@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)/g)
    .map((part, index) => (index % 2 === 1 ? h("span", { class: "composer-mention" }, part) : part))
}

export class SiteComments {
  readonly extension: Extension
  readonly countButton: HTMLButtonElement
  private readonly editors = new Map<Language, Editor>()
  private readonly popover: HTMLElement
  private threads: readonly ReviewThread[] = []
  private placed = new Map<Language, Segment[]>()
  private active: string | null = null
  /** The selection being commented on keeps a highlight while the box is open. */
  private pending: {
    readonly language: Language
    readonly from: number
    readonly to: number
  } | null = null
  private people: readonly Person[] = []
  private disposed = false
  private detachMention: (() => void) | null = null

  constructor(private readonly options: SiteCommentsOptions) {
    const registry = this.editors
    const open = (id: string, editor: Editor): void => this.openThread(id, editor)
    this.extension = Extension.create({
      name: "siteCommentMarks",
      onCreate() {
        registry.set(editorLanguage(this.editor), this.editor)
      },
      onDestroy() {
        if (registry.get(editorLanguage(this.editor)) === this.editor)
          registry.delete(editorLanguage(this.editor))
      },
      addProseMirrorPlugins() {
        const editor = this.editor
        return [
          new Plugin<DecorationSet>({
            key: marksKey,
            state: {
              init: () => DecorationSet.empty,
              apply(tr, value) {
                const next = tr.getMeta(marksKey) as DecorationSet | undefined
                return next ?? value.map(tr.mapping, tr.doc)
              },
            },
            props: {
              decorations: (state) => marksKey.getState(state),
              handleClick(_view, _pos, event) {
                const target =
                  event.target instanceof Element
                    ? event.target.closest<HTMLElement>("[data-comment-thread]")
                    : null
                const id = target?.dataset["commentThread"]
                if (id) open(id, editor)
                return false
              },
            },
          }),
        ]
      },
    })
    this.countButton = h(
      "button",
      { type: "button", class: "composer-comments-count", "data-site-comments": "", hidden: true },
      "댓글",
    )
    this.countButton.addEventListener("click", () => this.openList())
    this.popover = h("div", { class: "composer-comment-popover", role: "dialog", hidden: true })
    document.body.append(this.popover)
    document.addEventListener("mousedown", this.onOutside, true)
    document.addEventListener("keydown", this.onEscape)
    window.addEventListener("scroll", this.onScroll, { passive: true })
    void options.people().then((people) => {
      this.people = people
    })
  }

  private readonly onOutside = (event: MouseEvent): void => {
    if (this.popover.hidden || !(event.target instanceof Node)) return
    if (this.popover.contains(event.target) || this.countButton.contains(event.target)) return
    if (
      event.target instanceof Element &&
      event.target.closest("[data-comment-thread], .composer-bubble")
    )
      return
    this.close()
  }

  /** Escape closes an open comment box wherever focus is (mention lists handle it first). */
  private readonly onEscape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || event.defaultPrevented || this.popover.hidden) return
    event.preventDefault()
    this.close()
  }

  private anchorRect: (() => DOMRect | null) | null = null
  private readonly onScroll = (): void => {
    const rect = this.anchorRect?.()
    if (rect && !this.popover.hidden) this.place(rect)
  }

  /** Reloads threads from the pull request and places them on both languages. */
  async refresh(): Promise<void> {
    const pull = await this.options.findPull()
    if (this.disposed || !pull) return
    const result = await this.options.github.getReviewThreads(pull.number)
    if (this.disposed) return
    if (!result.ok) return
    this.threads = result.value
    await this.place_threads()
  }

  private async context(language: Language): Promise<AnchorContext | null> {
    const bundle = this.options.bundle()
    if (!bundle) return null
    const serialized = await this.options.codec.serialize(bundle)
    const renderer = createRenderer({
      serializedMarkdown: (entry) => {
        const file = serialized.files.find((candidate) => candidate.path === entry.path)
        if (file?.encoding !== "utf-8") throw new Error("Serialized language source is missing")
        return file.content
      },
    })
    const result = renderer.render(bundle[language])
    return {
      sourceMap: result.blockSourceMap,
      blockTexts: extractBlockTexts(result.html),
      snapshotHash: bundle.snapshotHash,
    }
  }

  private async place_threads(): Promise<void> {
    const open = this.threads.filter((thread) => !thread.resolved)
    this.countButton.hidden = this.threads.length === 0
    this.countButton.textContent = open.length
      ? `댓글 ${open.length}`
      : `댓글 ${this.threads.length} ✓`
    for (const language of ["ko", "en"] as const) {
      const context = await this.context(language)
      const editor = this.editors.get(language)
      if (!context || !editor || this.disposed) continue
      const placements = placeThreads(open, language, context)
      const items = placements.flatMap((placement) =>
        placement.range ? segments(placement.thread.id, placement.range, context.blockTexts) : [],
      )
      this.placed.set(language, items)
      this.paint(language)
    }
  }

  private paint(language: Language): void {
    const editor = this.editors.get(language)
    if (!editor) return
    let set = decorate(editor.state.doc, this.placed.get(language) ?? [], this.active)
    const pending = this.pending
    if (pending?.language === language) {
      set = set.add(editor.state.doc, [
        Decoration.inline(pending.from, pending.to, { class: "composer-comment-mark is-pending" }),
      ])
    }
    editor.view.dispatch(editor.state.tr.setMeta(marksKey, set).setMeta("addToHistory", false))
  }

  /** Starts a comment on the selection (selection toolbar "댓글"). */
  start(editor: Editor): void {
    const { from, to } = editor.state.selection
    if (from === to) return
    const language = editorLanguage(editor)
    const portions = articleRanges(editor.state.doc)
      .filter((range) => range.to > from && range.from < to)
      .map((range) => ({
        id: range.id,
        text: normalise(
          editor.state.doc.textBetween(
            Math.max(from, range.from),
            Math.min(to, range.to),
            " ",
            " ",
          ),
        ).text.trim(),
        start: blockIndex(editor.state.doc, range.from, range.to).positions.findIndex(
          (position) => position >= from,
        ),
        index: blockIndex(editor.state.doc, range.from, range.to),
      }))
      .filter((portion) => portion.text !== "")
    if (portions.length === 0) return
    const quoted = portions.map((portion) => portion.text).join(" ")
    this.anchorRect = () => rectFor(editor, from, to)
    this.pending = { language, from, to }
    const textarea = h("textarea", {
      "aria-label": "댓글",
      placeholder: "댓글을 입력하세요. @로 사람을 멘션할 수 있습니다.",
      rows: "3",
    })
    const error = h("p", { class: "composer-comment-error", role: "alert", hidden: true })
    const submit = h("button", { type: "submit", class: "composer-comment-primary" }, "댓글 달기")
    const form = h(
      "form",
      { class: "composer-comment-form" },
      h(
        "blockquote",
        { class: "composer-comment-quote" },
        quoted.length > 120 ? `${quoted.slice(0, 120)}…` : quoted,
      ),
      textarea,
      error,
      h(
        "div",
        { class: "composer-comment-actions" },
        h("button", { type: "button", onclick: () => this.close() }, "취소"),
        submit,
      ),
    )
    form.addEventListener("submit", (event) => {
      event.preventDefault()
      const body = textarea.value.trim()
      if (!body) {
        error.hidden = false
        error.textContent = "댓글 내용을 입력하세요."
        textarea.focus()
        return
      }
      submit.disabled = true
      error.hidden = true
      submit.textContent = "저장하고 다는 중…"
      void this.post(language, portions, body)
        .then((thread) => {
          this.close()
          this.active = thread.id
          editor.commands.setTextSelection(to)
          this.openThread(thread.id, editor)
        })
        .catch((value: unknown) => {
          error.hidden = false
          error.textContent = value instanceof Error ? value.message : "댓글을 달지 못했습니다."
          submit.disabled = false
          submit.textContent = "댓글 달기"
        })
    })
    this.show("댓글 달기", form, this.anchorRect())
    this.paint(language)
    this.detachMention = attachMentions(textarea, () => this.people)
    textarea.focus()
  }

  private async post(
    language: Language,
    portions: readonly {
      readonly id: string
      readonly text: string
      readonly start: number
      readonly index: Indexed
    }[],
    body: string,
  ): Promise<ReviewThread> {
    const pull = await this.options.ensureSaved()
    const context = await this.context(language)
    if (!context) throw new Error("글을 불러오지 못했습니다.")
    const range = locate(portions, context.blockTexts)
    if (!range)
      throw new Error("선택한 글의 위치를 찾지 못했습니다. 한 문단 안에서 다시 선택해 주세요.")
    const built = buildAnchor(range, context)
    if (!built.ok) throw new Error(built.reason)
    const result = await this.options.github.addRangeComment(
      pull.number,
      pull.headSha,
      built.anchor,
      body,
    )
    if (!result.ok) throw new Error(describeGitHubError(result.error))
    this.threads = [...this.threads.filter((thread) => thread.id !== result.value.id), result.value]
    await this.place_threads()
    return result.value
  }

  private openThread(id: string, editor: Editor): void {
    const thread = this.threads.find((entry) => entry.id === id)
    if (!thread) return
    this.active = id
    const language = editorLanguage(editor)
    this.paint(language)
    this.anchorRect = () => {
      const mark = editor.view.dom.querySelector<HTMLElement>(
        `[data-comment-thread="${CSS.escape(id)}"]`,
      )
      return mark?.getBoundingClientRect() ?? null
    }
    const reply = h("textarea", {
      "aria-label": "답글",
      placeholder: "답글을 입력하세요. @로 멘션",
      rows: "2",
    })
    const error = h("p", { class: "composer-comment-error", role: "alert", hidden: true })
    const send = h("button", { type: "submit", class: "composer-comment-primary" }, "답글")
    const resolve = h("button", { type: "button" }, thread.resolved ? "다시 열기" : "해결")
    const form = h(
      "form",
      { class: "composer-comment-form" },
      reply,
      error,
      h("div", { class: "composer-comment-actions" }, resolve, send),
    )
    const people = new Map(this.people.map((person) => [person.handle.toLowerCase(), person]))
    const list = h(
      "ol",
      { class: "composer-comment-thread" },
      ...thread.comments.map((comment) => {
        const person = people.get(comment.author.toLowerCase())
        return h(
          "li",
          {},
          h(
            "div",
            { class: "composer-comment-meta" },
            person?.avatar
              ? h("img", { src: person.avatar, alt: "", width: "20", height: "20" })
              : null,
            h("strong", {}, person ? person.name : comment.author),
            h("span", {}, `@${comment.author}`),
            h("time", { datetime: comment.createdAt }, TIME.format(new Date(comment.createdAt))),
          ),
          h("p", { class: "composer-comment-body" }, ...bodyNodes(comment.body)),
        )
      }),
    )
    form.addEventListener("submit", (event) => {
      event.preventDefault()
      const body = reply.value.trim()
      if (!body) return
      send.disabled = true
      void this.options.github.replyComment(thread, body).then((result) => {
        if (!result.ok) {
          error.hidden = false
          error.textContent = describeGitHubError(result.error)
          send.disabled = false
          return
        }
        this.threads = this.threads.map((entry) =>
          entry.id === thread.id
            ? { ...entry, comments: [...entry.comments, result.value] }
            : entry,
        )
        this.openThread(id, editor)
      })
    })
    resolve.addEventListener("click", () => {
      resolve.disabled = true
      void this.options.github.resolveThread(thread, !thread.resolved).then(async (result) => {
        if (!result.ok) {
          error.hidden = false
          error.textContent = describeGitHubError(result.error)
          resolve.disabled = false
          return
        }
        this.threads = this.threads.map((entry) => (entry.id === thread.id ? result.value : entry))
        this.close()
        await this.place_threads()
      })
    })
    const quote = h(
      "blockquote",
      { class: "composer-comment-quote" },
      thread.anchor.quotedText.length > 120
        ? `${thread.anchor.quotedText.slice(0, 120)}…`
        : thread.anchor.quotedText,
    )
    this.show(
      thread.resolved ? "해결된 댓글" : "댓글",
      h("div", {}, quote, list, form),
      this.anchorRect() ?? this.countButton.getBoundingClientRect(),
    )
    this.detachMention = attachMentions(reply, () => this.people)
  }

  private openList(): void {
    if (!this.popover.hidden && this.popover.dataset["view"] === "list") {
      this.close()
      return
    }
    const editorFor = (language: Language): Editor | undefined => this.editors.get(language)
    const items = this.threads.map((thread) => {
      const language: Language = thread.anchor.markdown.path.endsWith(".en.md") ? "en" : "ko"
      const button = h(
        "button",
        { type: "button", class: "composer-comment-item" },
        h("span", { class: "composer-comment-item__quote" }, thread.anchor.quotedText),
        h(
          "span",
          { class: "composer-comment-item__meta" },
          `${thread.resolved ? "해결됨 · " : ""}@${thread.comments[0]?.author ?? ""} · 댓글 ${thread.comments.length}`,
        ),
      )
      button.addEventListener("click", () => {
        const editor = editorFor(language)
        if (!editor) return
        const panel = editor.view.dom.closest<HTMLElement>("[data-lang]")
        if (panel?.hidden)
          document
            .querySelector<HTMLButtonElement>(`.composer-tab[data-lang="${language}"]`)
            ?.click()
        const mark = editor.view.dom.querySelector<HTMLElement>(
          `[data-comment-thread="${CSS.escape(thread.id)}"]`,
        )
        mark?.scrollIntoView({ block: "center" })
        this.openThread(thread.id, editor)
      })
      return h("li", {}, button)
    })
    this.anchorRect = () => this.countButton.getBoundingClientRect()
    this.show(
      "이 글의 댓글",
      h("ol", { class: "composer-comment-list" }, ...items),
      this.anchorRect(),
    )
    this.popover.dataset["view"] = "list"
  }

  private show(title: string, content: HTMLElement, rect: DOMRect | null): void {
    this.detachMention?.()
    this.detachMention = null
    this.popover.dataset["view"] = "panel"
    this.popover.setAttribute("aria-label", title)
    this.popover.replaceChildren(
      h(
        "div",
        { class: "composer-comment-head" },
        h("strong", {}, title),
        h("button", { type: "button", "aria-label": "닫기", onclick: () => this.close() }, "✕"),
      ),
      content,
    )
    this.popover.hidden = false
    if (rect) this.place(rect)
  }

  private place(rect: DOMRect): void {
    const width = this.popover.offsetWidth
    const height = this.popover.offsetHeight
    const below = rect.bottom + 8
    const top =
      below + height < window.innerHeight - 88 || rect.top - height - 8 < 72
        ? below
        : rect.top - height - 8
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
    this.popover.style.top = `${Math.round(Math.max(8, Math.min(top, window.innerHeight - height - 8)))}px`
    this.popover.style.left = `${Math.round(left)}px`
  }

  close(): void {
    this.detachMention?.()
    this.detachMention = null
    this.popover.hidden = true
    this.anchorRect = null
    if (this.active || this.pending) {
      this.active = null
      this.pending = null
      for (const language of ["ko", "en"] as const) this.paint(language)
    }
  }

  dispose(): void {
    this.disposed = true
    this.close()
    document.removeEventListener("mousedown", this.onOutside, true)
    document.removeEventListener("keydown", this.onEscape)
    window.removeEventListener("scroll", this.onScroll)
    this.popover.remove()
  }
}

/** Maps the editor selection onto rendered block text (the review's anchor coordinates). */
function locate(
  portions: readonly {
    readonly id: string
    readonly text: string
    readonly start: number
    readonly index: Indexed
  }[],
  texts: BlockTexts,
): SelectionRange | null {
  const first = portions[0]
  const last = portions.at(-1)
  if (!first || !last) return null
  const firstNorm = normalise(texts.get(first.id) ?? "")
  const lastNorm = normalise(texts.get(last.id) ?? "")
  if (portions.length === 1) {
    const occurrence = occurrencesBefore(first.index.text, first.text, Math.max(0, first.start))
    const start = nth(firstNorm.text, first.text, occurrence)
    if (start < 0) return null
    return {
      blockIds: [first.id],
      startOffset: firstNorm.toRaw[start] ?? 0,
      endOffset: (firstNorm.toRaw[start + first.text.length - 1] ?? 0) + 1,
    }
  }
  const head = firstNorm.text.trimEnd()
  if (!head.endsWith(first.text) || !lastNorm.text.startsWith(last.text)) return null
  const start = head.length - first.text.length
  return {
    blockIds: portions.map((portion) => portion.id),
    startOffset: firstNorm.toRaw[start] ?? 0,
    endOffset: (lastNorm.toRaw[last.text.length - 1] ?? 0) + 1,
  }
}
