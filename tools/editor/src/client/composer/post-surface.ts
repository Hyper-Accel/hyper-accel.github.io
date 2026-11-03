import type { Language } from "../../shared/onsite/document"
import { h, replaceChildren } from "./dom"
import { type PostMetadata, slugify } from "./metadata"
import "./post-surface.css"

export type SurfaceField = "authors" | "category" | "tags" | "date" | "series"

export interface PostSurfaceOptions {
  readonly mode: "create" | "edit"
  readonly info: HTMLDetailsElement
  readonly languages: HTMLElement | null
  readonly onTitle: (title: string) => void
  readonly onDescription?: (description: string) => void
  readonly onField: (field: SurfaceField) => void
}

/** The real post page (layouts/_default/single.html) with its editable regions. */
export interface PostSurface {
  readonly element: HTMLElement
  readonly title: HTMLElement
  readonly content: HTMLElement
  readonly after: HTMLElement
  /** Holds the tag picker while tags are edited under the post. */
  readonly tagPanel: HTMLElement
  update(metadata: PostMetadata, language: Language): void
  setDescription(description: string): void
  refresh(article: HTMLElement | null, language: Language): void
}

const TITLE_PARTS = /^\[([^\]]+)\]\s*(.+)$/

/** Mirrors layouts/partials/d/titleparts.html: "[Series - Part 01] Title". */
export function splitTitle(title: string): { readonly tag: string; readonly text: string } {
  const match = TITLE_PARTS.exec(title)
  return match ? { tag: match[1] ?? "", text: match[2] ?? "" } : { tag: "", text: title }
}

function formatDate(iso: string, language: Language): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  if (language === "en") {
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  }
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

/** Hugo's WordCount/ReadingTime without hasCJKLanguage: whitespace-separated words, 213 per minute. */
function countWords(text: string): { readonly words: number; readonly minutes: number } {
  const words = text.split(/\s+/).filter(Boolean).length
  return { words, minutes: Math.max(1, Math.floor((words + 212) / 213)) }
}

function categoryLink(category: string): HTMLAnchorElement | null {
  if (!category) return null
  return document.querySelector<HTMLAnchorElement>(
    `.tr-nav a[href$="/categories/${slugify(category)}/"]`,
  )
}

const SEPARATOR = "\u00a0·\u00a0"
const DIVIDER = "\u00a0|\u00a0"

export function createPostSurface(options: PostSurfaceOptions): PostSurface {
  let titleTag = ""
  let language: Language = "ko"
  const field = (name: SurfaceField, className: string, label: string): HTMLAnchorElement => {
    const control = h("a", {
      class: `${className} composer-inline`,
      role: "button",
      tabindex: "0",
      "data-field": name,
      "aria-label": label,
      onclick: (event: Event) => {
        event.preventDefault()
        options.onField(name)
      },
      onkeydown: (event: Event) => {
        if (!(event instanceof KeyboardEvent) || (event.key !== "Enter" && event.key !== " "))
          return
        event.preventDefault()
        options.onField(name)
      },
    })
    return control
  }
  const category = field("category", "tr-cat", "카테고리 바꾸기")
  const part = h("span", { class: "tr-part" })
  const kicker = h("p", { class: "post-kicker" }, category, part)
  const title = h("h1", {
    class: "post-title entry-hint-parent composer-title",
    contenteditable: "plaintext-only",
    role: "textbox",
    spellcheck: "true",
    "aria-multiline": "false",
  })
  const description = h("div", {
    class: "post-description composer-description",
    contenteditable: "plaintext-only",
    role: "textbox",
    "aria-multiline": "false",
    hidden: !options.onDescription,
  })
  const date = field("date", "composer-meta-date", "작성일 바꾸기")
  const minutes = h("span")
  const words = h("span")
  const authors = field("authors", "composer-meta-authors", "작성자 바꾸기")
  const meta = h("div", { class: "post-meta composer-post-meta" })
  const tags = h("ul", { class: "post-tags" })
  const content = h("div", { class: "composer-post-content" })
  const after = h("div", { class: "composer-post-after" })
  const tagPanel = h("div", { class: "composer-tag-panel", hidden: true })
  const toc = h("nav", { id: "TableOfContents", "aria-label": "목차" })
  const tocTitle = h("a", {
    href: "#",
    class: "reading-toc-post",
    onclick: (event: Event) => {
      event.preventDefault()
      title.scrollIntoView({ block: "start" })
    },
  })
  const tocAside = h(
    "aside",
    { class: "reading-toc composer-toc", "aria-labelledby": "composer-toc-title", hidden: true },
    h("div", { class: "reading-toc-header" }, h("h2", { id: "composer-toc-title" }, "목차")),
    h("div", { class: "reading-toc-links" }, tocTitle, toc),
  )
  const article = h(
    "article",
    { class: "post-single composer-post", "data-mode": options.mode },
    h(
      "header",
      { class: "post-header" },
      h(
        "div",
        { class: "breadcrumbs" },
        h("a", { href: "/" }, "홈"),
        "\u00a0»\u00a0",
        h("a", { href: "/" }, "작성 중인 글"),
      ),
      kicker,
      title,
      description,
      meta,
      options.info,
    ),
    content,
    h("footer", { class: "post-footer" }, tags, tagPanel),
    after,
  )
  const element = h("div", { class: "post-reading-layout composer-post-layout" }, article, tocAside)

  title.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return
    event.preventDefault()
    content
      .querySelector<HTMLElement>(".composer-article-language:not([hidden]) .ProseMirror")
      ?.focus()
  })
  title.addEventListener("input", () => {
    const text = (title.textContent ?? "").replace(/\s+/g, " ").trim()
    title.toggleAttribute("data-empty", text === "")
    options.onTitle(titleTag ? `[${titleTag}] ${text}` : text)
  })

  description.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return
    event.preventDefault()
    content
      .querySelector<HTMLElement>(".composer-article-language:not([hidden]) .ProseMirror")
      ?.focus()
  })
  description.addEventListener("input", () => {
    const text = (description.textContent ?? "").replace(/\s+/g, " ").trim()
    description.toggleAttribute("data-empty", text === "")
    options.onDescription?.(text)
  })

  // Like the reading page's trailing "수정 제안" link, post information opens from the meta line.
  const infoToggle = h(
    "a",
    {
      class: "composer-info-toggle composer-inline",
      role: "button",
      tabindex: "0",
      "aria-expanded": String(options.info.open),
      onclick: (event: Event) => {
        event.preventDefault()
        options.info.open = !options.info.open
      },
      onkeydown: (event: Event) => {
        if (!(event instanceof KeyboardEvent) || (event.key !== "Enter" && event.key !== " "))
          return
        event.preventDefault()
        options.info.open = !options.info.open
      },
    },
    options.mode === "edit" ? "글 정보 수정" : "글 정보",
  )
  options.info.addEventListener("toggle", () => {
    infoToggle.setAttribute("aria-expanded", String(options.info.open))
  })

  const renderMeta = (metadata: PostMetadata): void => {
    date.textContent = formatDate(metadata.date, language) || "작성일 선택"
    authors.textContent = metadata.authors.length ? metadata.authors.join(", ") : "작성자 선택"
    authors.toggleAttribute("data-empty", metadata.authors.length === 0)
    const parts: (Node | string)[] = [date]
    if (options.mode === "edit") parts.push(SEPARATOR, minutes, SEPARATOR, words)
    parts.push(DIVIDER, authors)
    if (options.languages) parts.push(DIVIDER, h("span", {}, "번역:"), options.languages)
    parts.push(DIVIDER, infoToggle)
    meta.replaceChildren(...parts)
  }

  const surface: PostSurface = {
    element,
    title,
    content,
    after,
    tagPanel,
    update(metadata, next) {
      language = next
      const parts = splitTitle(metadata.title[language])
      titleTag = parts.tag
      if (document.activeElement !== title) title.textContent = parts.text
      title.lang = language
      title.dataset["placeholder"] = language === "ko" ? "제목을 입력하세요" : "Title"
      title.setAttribute("aria-label", language === "ko" ? "한국어 제목" : "English title")
      title.toggleAttribute("data-empty", parts.text.trim() === "")
      const link = categoryLink(metadata.category)
      kicker.setAttribute("style", link?.getAttribute("style") ?? "")
      category.textContent = metadata.category
        ? language === "ko" && link
          ? (link.textContent ?? "").trim()
          : metadata.category
        : "카테고리 선택"
      category.toggleAttribute("data-empty", metadata.category === "")
      const series =
        metadata.series && metadata.seriesIndex !== null
          ? `${metadata.series} - Part ${String(metadata.seriesIndex).padStart(2, "0")}`
          : ""
      part.textContent = parts.tag || series
      part.hidden = part.textContent === ""
      renderMeta(metadata)
      replaceChildren(
        tags,
        ...metadata.tags.map((tag) => h("li", {}, h("a", {}, tag))),
        h("li", { class: "composer-tags-edit" }, field("tags", "", "태그 편집")),
      )
      const edit = tags.querySelector<HTMLElement>(".composer-tags-edit a")
      if (edit) {
        edit.textContent = !tagPanel.hidden
          ? "태그 접기"
          : metadata.tags.length
            ? "태그 편집"
            : "+ 태그 추가"
        edit.setAttribute("aria-expanded", String(!tagPanel.hidden))
      }
    },
    setDescription(text) {
      if (document.activeElement !== description) description.textContent = text
      description.lang = language
      description.dataset["placeholder"] =
        language === "ko" ? "글 설명 (검색 결과와 목록에 표시)" : "Description"
      description.setAttribute(
        "aria-label",
        language === "ko" ? "한국어 설명" : "English description",
      )
      description.toggleAttribute("data-empty", text.trim() === "")
    },
    refresh(articleRoot, next) {
      language = next
      const counted = countWords(articleRoot?.innerText ?? "")
      minutes.textContent = language === "ko" ? `${counted.minutes} 분` : `${counted.minutes} min`
      words.textContent = language === "ko" ? `${counted.words} 단어` : `${counted.words} words`
      // Same as the published TOC (layouts/partials/reading_toc.html): the post title, then
      // body headings # / ## / ### nested like Hugo's Fragments.ToHTML 1 3.
      const headings = Array.from(
        articleRoot?.querySelectorAll<HTMLElement>("h1, h2, h3") ?? [],
      ).filter((heading) => (heading.textContent ?? "").trim() !== "")
      tocAside.hidden = headings.length === 0
      element.classList.toggle("has-toc", headings.length > 0)
      const link = (target: HTMLElement): HTMLAnchorElement =>
        h(
          "a",
          {
            href: "#",
            onclick: (event: Event) => {
              event.preventDefault()
              target.scrollIntoView({ block: "start" })
            },
          },
          (target.textContent ?? "").trim(),
        )
      const root = h("ul")
      const stack: { level: number; list: HTMLElement; last: HTMLElement | null }[] = [
        { level: 1, list: root, last: null },
      ]
      for (const heading of headings) {
        const level = Number(heading.tagName.slice(1))
        while (stack.length > 1 && (stack.at(-1)?.level ?? 1) > level) stack.pop()
        let top = stack.at(-1) ?? stack[0]
        while (top && top.level < level) {
          // A skipped level gets an empty wrapper item, as in Hugo's output.
          const parent = top.last ?? h("li")
          if (!top.last) {
            top.list.append(parent)
            top.last = parent
          }
          const list = h("ul")
          parent.append(list)
          top = { level: top.level + 1, list, last: null }
          stack.push(top)
        }
        if (!top) continue
        const item = h("li", {}, link(heading))
        top.list.append(item)
        top.last = item
      }
      tocTitle.textContent = (title.textContent ?? "").trim()
      tocTitle.hidden = tocTitle.textContent === ""
      toc.replaceChildren(root)
    },
  }
  return surface
}
