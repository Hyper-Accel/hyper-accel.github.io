import { Extension } from "@tiptap/core"
import { NodeSelection, Plugin } from "@tiptap/pm/state"
import { createRenderer } from "../../render"
import type { DocumentCodec, Language, PostBundle } from "../../shared/onsite/document"
import { EMPTY_IMAGE } from "../blocks/attrs"
import { IMAGE_NODE } from "../blocks/image"
import type { ImageChoice } from "../blocks/options"
import { h } from "../composer/dom"
import { imageChooser } from "../composer/image-chooser"
import { splitTitle } from "../composer/post-surface"
import type { BlockExtensionContext } from "../composer/types"
import { buildFrameSrcdoc } from "../review/frame"
import { FRAME_CONTENT_ID } from "../review/protocol"
import { type EditorRegistry, insertBlock } from "./toolbox"

/** Drag data carried from the library to the article. */
const LIBRARY_MIME = "application/x-onsite-image"

/** A side panel opened from the toolbox (Naver's 라이브러리 and 모바일 미리보기). */
abstract class SidePanel {
  readonly toggle: HTMLButtonElement
  protected readonly panel: HTMLElement
  protected readonly body: HTMLElement
  private readonly title: HTMLElement

  constructor(
    label: string,
    icon: string,
    heading: string,
    private readonly onOpen: (panel: SidePanel) => void,
  ) {
    this.toggle = h(
      "button",
      {
        type: "button",
        class: "composer-toolbox__button",
        "aria-pressed": "false",
        "data-panel": label,
      },
      h("span", { class: "composer-toolbox__icon", "aria-hidden": "true" }, icon),
      h("span", { class: "composer-toolbox__label" }, label),
    )
    this.toggle.addEventListener("click", () => (this.isOpen ? this.close() : this.open()))
    this.title = h("h2", { class: "composer-panel__title" }, heading)
    this.body = h("div", { class: "composer-panel__body" })
    const close = h(
      "button",
      { type: "button", class: "composer-panel__close", "aria-label": "닫기" },
      "✕",
    )
    close.addEventListener("click", () => this.close())
    this.panel = h(
      "aside",
      { class: "composer-panel", "aria-label": heading, hidden: true, "data-onsite-ui": "" },
      h("header", { class: "composer-panel__head" }, this.title, close),
      this.body,
    )
    this.panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault()
        this.close()
        this.toggle.focus({ preventScroll: true })
      }
    })
    document.body.append(this.panel)
  }

  get isOpen(): boolean {
    return !this.panel.hidden
  }

  protected setTitle(text: string): void {
    this.title.textContent = text
  }

  open(): void {
    this.onOpen(this)
    // On phones the sheet starts right under the toolbox wherever the page is scrolled.
    const bar = document.querySelector<HTMLElement>(".composer-toolbox")
    if (bar)
      this.panel.style.setProperty(
        "--composer-panel-top",
        `${Math.max(0, Math.round(bar.getBoundingClientRect().bottom))}px`,
      )
    this.panel.hidden = false
    this.toggle.setAttribute("aria-pressed", "true")
    this.refresh()
  }

  close(): void {
    this.panel.hidden = true
    this.toggle.setAttribute("aria-pressed", "false")
  }

  /** Called after every edit while open. */
  abstract refresh(): void

  dispose(): void {
    this.panel.remove()
  }
}

export interface LibraryOptions {
  readonly bundle: () => PostBundle | null
  readonly context: () => BlockExtensionContext | null
  readonly registry: EditorRegistry
  readonly onOpen: (panel: SidePanel) => void
}

/**
 * 라이브러리: every picture of this post, with insert, drag-in and an unused marker. It is also where
 * picture buttons pick from (Premiere's project bin): add pictures once, then pick them quickly.
 */
export class ImageLibrary extends SidePanel {
  readonly extension: Extension
  /** A picture button waiting for a pick: one picture, or several in the order chosen. */
  private picking: {
    readonly multiple: boolean
    readonly chosen: string[]
    readonly resolve: (choices: ImageChoice[]) => void
  } | null = null

  constructor(private readonly options: LibraryOptions) {
    super("라이브러리", "▤", "이 글의 그림", options.onOpen)
    imageChooser.current = (multiple) => this.pick(multiple)
    document.addEventListener("paste", this.onPaste, true)
    // Clicking in the library gives it focus, so a paste right after lands here.
    this.body.tabIndex = -1
    this.body.addEventListener("pointerdown", () => this.body.focus({ preventScroll: true }))
    this.extension = Extension.create({
      name: "siteImageLibraryDrop",
      addProseMirrorPlugins() {
        return [
          new Plugin({
            props: {
              handleDrop(view, event) {
                const path = event.dataTransfer?.getData(LIBRARY_MIME)
                const type = view.state.schema.nodes[IMAGE_NODE]
                if (!path || !type) return false
                const found = view.posAtCoords({ left: event.clientX, top: event.clientY })
                if (!found) return false
                const $pos = view.state.doc.resolve(found.pos)
                let at = found.pos
                if ($pos.depth > 0) {
                  const before = $pos.before(1)
                  const block = view.state.doc.nodeAt(before)
                  const rect = (view.nodeDOM(before) as HTMLElement | null)?.getBoundingClientRect()
                  at =
                    block && rect && event.clientY > rect.top + rect.height / 2
                      ? before + block.nodeSize
                      : before
                }
                const tr = view.state.tr.insert(at, type.create({ ...EMPTY_IMAGE, src: path }))
                view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)))
                view.focus()
                event.preventDefault()
                return true
              },
            },
          }),
        ]
      },
    })
  }

  /** Pictures just added (사진 추가 or pasted): in a pick they are picked straight away. */
  private added(added: readonly ImageChoice[]): void {
    if (this.picking && added.length > 0) {
      if (!this.picking.multiple) {
        this.finish([added[0]?.src ?? ""])
        return
      }
      this.picking.chosen.push(...added.map((choice) => choice.src))
    }
    this.refresh()
  }

  /**
   * Pictures pasted from the clipboard join the library: while a picture button is picking, or
   * when the paste happens inside the library itself.
   */
  private readonly onPaste = (event: ClipboardEvent): void => {
    if (!this.isOpen) return
    const inside = event.target instanceof Node && this.body.contains(event.target)
    if (!this.picking && !inside) return
    const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
      file.type.startsWith("image/"),
    )
    const context = this.options.context()
    if (files.length === 0 || !context) return
    event.preventDefault()
    event.stopPropagation()
    void context.addImageFiles(files).then((added) => this.added(added))
  }

  /** Opens the library to pick pictures for a picture button; closing it picks none. */
  pick(multiple: boolean): Promise<ImageChoice[]> {
    this.picking?.resolve([])
    return new Promise((resolve) => {
      this.picking = { multiple, chosen: [], resolve }
      if (this.isOpen) this.refresh()
      else this.open()
    })
  }

  override close(): void {
    this.finish([])
  }

  private finish(paths: readonly string[]): void {
    const picking = this.picking
    this.picking = null
    super.close()
    picking?.resolve(paths.map((src) => ({ src, alt: "" })))
  }

  private pickActions(count: number): HTMLElement {
    const done = h(
      "button",
      {
        type: "button",
        class: "composer-panel__action composer-library__done",
        disabled: count === 0,
      },
      count > 0 ? `${count}장 넣기` : "넣기",
    )
    done.addEventListener("click", () => this.finish([...(this.picking?.chosen ?? [])]))
    const cancel = h("button", { type: "button", class: "composer-panel__insert" }, "취소")
    cancel.addEventListener("click", () => this.finish([]))
    return h("div", { class: "composer-library__actions" }, done, cancel)
  }

  /** In a pick, clicking a picture takes it (one) or adds it to the pick (several). */
  private choose(path: string): void {
    const picking = this.picking
    if (!picking) return
    if (!picking.multiple) {
      this.finish([path])
      return
    }
    const at = picking.chosen.indexOf(path)
    if (at >= 0) picking.chosen.splice(at, 1)
    else picking.chosen.push(path)
    this.refresh()
  }

  refresh(): void {
    if (!this.isOpen) return
    const picking = this.picking
    const bundle = this.options.bundle()
    const context = this.options.context()
    const images = bundle?.images ?? []
    this.setTitle(`이 글의 그림 ${images.length}장`)
    const markdown = bundle
      ? [...bundle.ko.blocks, ...bundle.en.blocks].map((block) => block.markdown).join("\n")
      : ""
    const cover = bundle?.ko.frontMatter["cover"]
    const coverImage =
      typeof cover === "object" && cover !== null && "image" in cover ? String(cover.image) : ""
    const add = h("button", { type: "button", class: "composer-panel__action" }, "사진 추가")
    // 사진 추가 registers pictures from the computer; in a pick they are picked straight away.
    add.addEventListener("click", () => {
      void context?.addImages().then((added) => this.added(added))
    })
    const items = images.map((image) => {
      const name = image.path.split("/").at(-1) ?? image.path
      const state =
        coverImage.endsWith(image.path) || coverImage === image.path
          ? "대표 이미지"
          : markdown.includes(image.path)
            ? "본문에 있음"
            : "본문에 없음"
      const order = picking ? picking.chosen.indexOf(image.path) : -1
      const insert = picking
        ? h(
            "button",
            {
              type: "button",
              class: "composer-panel__insert composer-library__pick",
              "aria-pressed": String(order >= 0),
            },
            order >= 0 ? `${order + 1}` : picking.multiple ? "고르기" : "넣기",
          )
        : h("button", { type: "button", class: "composer-panel__insert" }, "넣기")
      insert.addEventListener("click", () => {
        if (this.picking) {
          this.choose(image.path)
          return
        }
        const editor = this.options.registry.active()
        if (!editor) return
        insertBlock(editor, { type: IMAGE_NODE, attrs: { ...EMPTY_IMAGE, src: image.path } }, null)
        this.refresh()
      })
      const item = h(
        "li",
        {
          class: "composer-library__item",
          draggable: "true",
          "data-path": image.path,
          "data-state":
            state === "본문에 없음" ? "unused" : state === "대표 이미지" ? "cover" : "used",
        },
        h("img", {
          src: context?.mediaUrl(image.path) ?? "",
          alt: "",
          loading: "lazy",
          draggable: "false",
        }),
        h(
          "div",
          { class: "composer-library__text" },
          h("span", { class: "composer-library__name", title: image.path }, name),
          h(
            "span",
            { class: "composer-library__state" },
            image.status === "pending" ? `${state} · 저장 전` : state,
          ),
        ),
        insert,
      )
      if (order >= 0) item.dataset["chosen"] = String(order + 1)
      // While picking, the whole tile picks (not just its button).
      item.addEventListener("click", (event) => {
        if (this.picking && !(event.target instanceof Element && event.target.closest("button")))
          this.choose(image.path)
      })
      item.addEventListener("dragstart", (event) => {
        event.dataTransfer?.setData(LIBRARY_MIME, image.path)
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy"
      })
      return item
    })
    const pickBar = picking?.multiple ? [this.pickActions(picking.chosen.length)] : []
    this.body.replaceChildren(
      ...pickBar,
      h("div", { class: "composer-panel__bar" }, add),
      items.length
        ? h("ul", { class: picking ? "composer-library is-picking" : "composer-library" }, ...items)
        : h("p", { class: "composer-panel__empty" }, "아직 그림이 없습니다."),
    )
  }
}

export interface PreviewOptions {
  readonly codec: DocumentCodec
  readonly stylesheets: readonly string[]
  readonly bundle: () => PostBundle | null
  readonly language: () => Language
  readonly context: () => BlockExtensionContext | null
  readonly onOpen: (panel: SidePanel) => void
}

/** 모바일 미리보기: the post rendered at 390px so the site's phone rules really apply. */
export class MobilePreview extends SidePanel {
  private readonly frame: HTMLIFrameElement
  private readonly error: HTMLElement
  private timer: ReturnType<typeof setTimeout> | null = null
  private shownLanguage: Language | null = null
  private run = 0

  constructor(private readonly options: PreviewOptions) {
    super("모바일", "▯", "모바일 미리보기", options.onOpen)
    // No scripts run inside; same-origin only so edits update in place and keep the scroll.
    this.frame = h("iframe", {
      class: "composer-preview__frame",
      title: "모바일 화면 미리보기",
      sandbox: "allow-same-origin",
      width: "390",
    })
    this.error = h("p", { class: "composer-panel__empty", role: "alert", hidden: true })
    this.body.append(
      h(
        "div",
        { class: "composer-preview" },
        h("div", { class: "composer-preview__phone" }, this.frame),
      ),
      this.error,
    )
    this.panel.classList.add("composer-panel--preview")
  }

  override close(): void {
    super.close()
    this.frame.removeAttribute("srcdoc")
    this.shownLanguage = null
  }

  refresh(): void {
    if (!this.isOpen) return
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = setTimeout(
      () => {
        this.timer = null
        void this.render()
      },
      this.shownLanguage ? 400 : 0,
    )
  }

  private async render(): Promise<void> {
    const bundle = this.options.bundle()
    if (!bundle || !this.isOpen) return
    const run = ++this.run
    const language = this.options.language()
    const media = this.options.context()?.mediaUrl ?? ((source: string) => source)
    try {
      const serialized = await this.options.codec.serialize(bundle)
      if (run !== this.run || !this.isOpen) return
      // Keep sources relative through sanitising, then point them at the editor's previews.
      const renderer = createRenderer({
        resolveImage: (source) => source,
        serializedMarkdown: (entry) => {
          const file = serialized.files.find((candidate) => candidate.path === entry.path)
          if (file?.encoding !== "utf-8") throw new Error("Serialized language source is missing")
          return file.content
        },
      })
      const parsed = new DOMParser().parseFromString(
        renderer.render(bundle[language]).html,
        "text/html",
      )
      const wrapper = parsed.body.firstElementChild
      const content = wrapper?.classList.contains("post-content") ? wrapper : parsed.body
      for (const image of content.querySelectorAll("img[src]"))
        image.setAttribute("src", media(image.getAttribute("src") ?? ""))
      const front = bundle[language].frontMatter
      // "[Series - Part 01] Title" shows the series above the title, as on the post page.
      const parts = splitTitle(typeof front["title"] === "string" ? front["title"] : "")
      const title = parts.text
      const authors = Array.isArray(front["authors"]) ? front["authors"].map(String).join(", ") : ""
      const date = typeof front["date"] === "string" ? front["date"].slice(0, 10) : ""
      const live = this.frame.contentDocument?.getElementById(FRAME_CONTENT_ID)
      if (live && this.shownLanguage === language) {
        live.innerHTML = content.innerHTML
        const heading = this.frame.contentDocument?.querySelector(".post-title")
        if (heading) heading.textContent = title
      } else {
        // The review runtime script is not needed (and not allowed) in the preview.
        this.frame.srcdoc = buildFrameSrcdoc(
          {
            language,
            theme: "dark",
            title,
            kicker: parts.tag || null,
            meta: [date, authors].filter((value) => value !== ""),
            html: content.innerHTML,
          },
          this.options.stylesheets,
        ).replace(/<script>[\s\S]*<\/script>/, "")
        this.shownLanguage = language
      }
      this.error.hidden = true
    } catch (value: unknown) {
      this.error.hidden = false
      this.error.textContent = `미리보기를 만들지 못했습니다: ${value instanceof Error ? value.message : String(value)}`
    }
  }

  override dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    super.dispose()
  }
}

export type { SidePanel }
