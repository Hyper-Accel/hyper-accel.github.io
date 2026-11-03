import { type Editor, Node } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state"
import type { NodeView } from "@tiptap/pm/view"
import type { ImagePreset } from "../../shared/onsite/blocks"
import {
  type ImageModel,
  isImagePreset,
  parseImageMarkdown,
  serializeImageMarkdown,
  splitImageDestination,
} from "../shortcode"
import {
  attrNullableString,
  attrString,
  el,
  isUiTarget,
  keepControlsUndraggable,
  leaveNode,
  leaveSelectedNode,
  placePopover,
  syncValue,
  toggleHidden,
  UI_ATTRIBUTE,
  uiButton,
  uiField,
  uiInput,
} from "./dom"
import { imageElement, presetControl, syncImageElement } from "./image-fields"
import type { ResolvedBlockOptions } from "./options"

export const IMAGE_NODE = "image"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    onsiteImage: {
      setImagePreset: (preset: ImagePreset) => ReturnType
    }
  }
}

export function imageModelFromAttrs(attrs: PMNode["attrs"]): ImageModel {
  const preset: unknown = attrs["preset"]
  return {
    src: attrString(attrs, "src"),
    alt: attrString(attrs, "alt"),
    title: attrNullableString(attrs, "title"),
    preset: isImagePreset(preset) ? preset : "body",
  }
}

function imageModelFromToken(token: {
  readonly href?: unknown
  readonly text?: unknown
  readonly title?: unknown
}): ImageModel {
  const { src, preset } = splitImageDestination(typeof token.href === "string" ? token.href : "")
  const title = typeof token.title === "string" && token.title !== "" ? token.title : null
  return { src, alt: typeof token.text === "string" ? token.text : "", title, preset }
}

function isSidePreset(preset: unknown): boolean {
  return preset === "side-left" || preset === "side-right"
}

/**
 * Text written beside a side picture is the paragraph right after it (the published page floats
 * the figure). Like Naver's "문단 내 배치", choosing a side layout guarantees that paragraph exists
 * and returns the position where the caret goes to write beside the picture.
 */
function ensureParagraphAfter(tr: Transaction, pos: number): number | null {
  const node = tr.doc.nodeAt(pos)
  const paragraph = tr.doc.type.schema.nodes["paragraph"]
  if (!node || !paragraph) return null
  const after = pos + node.nodeSize
  const $after = tr.doc.resolve(after)
  if ($after.nodeAfter?.type !== paragraph) {
    if (!$after.parent.canReplaceWith($after.index(), $after.index(), paragraph)) return null
    tr.insert(after, paragraph.create())
  }
  return after + 1
}

/** Snaps a dragged width onto the Hugo figure presets (narrow sides, body column, wide). */
function presetForWidth(ratio: number, edge: "left" | "right"): ImagePreset {
  if (ratio > 1.08) return "wide"
  if (ratio < 0.65) return edge === "right" ? "side-left" : "side-right"
  return "body"
}

class ImageView implements NodeView {
  readonly dom: HTMLElement
  private readonly image: HTMLImageElement
  private readonly caption: HTMLElement
  private readonly captionInput: HTMLInputElement
  private readonly placeholder: HTMLElement
  private readonly tools: HTMLElement
  private readonly presets
  private readonly altInput: HTMLInputElement
  private readonly menus: { readonly button: HTMLButtonElement; readonly panel: HTMLElement }[] = []
  private node: PMNode

  constructor(
    node: PMNode,
    private readonly editor: Editor,
    private readonly getPos: () => number | undefined,
    private readonly options: ResolvedBlockOptions,
  ) {
    this.node = node
    const model = imageModelFromAttrs(node.attrs)
    this.image = imageElement(options, model)
    this.caption = el("figcaption")
    this.captionInput = uiInput(
      { className: "onsite-caption-input", placeholder: "캡션 추가", "aria-label": "캡션" },
      (value) => this.commit({ title: value.trim() === "" ? null : value }),
    )
    this.placeholder = el("div", { className: "onsite-placeholder", contenteditable: "false" }, [
      "이미지 경로를 입력하거나 파일을 선택하세요.",
    ])
    this.presets = presetControl((preset) => {
      this.commit({ preset })
      this.closeMenus()
      this.editor.view.focus()
    })
    this.altInput = uiInput(
      { placeholder: "그림을 설명하는 문장", "aria-label": "대체 텍스트" },
      (value) => this.commit({ alt: value }),
    )
    const leave = (): void => leaveNode(this.editor, this.getPos(), this.node)
    const pick = options.requestImage
      ? uiButton(
          "교체",
          {
            className: "onsite-bar__button",
            "data-icon": "replace",
            title: "다른 그림으로 바꾸기",
          },
          async () => {
            const choice = await options.requestImage?.()
            if (choice)
              this.commit({
                src: choice.src,
                ...(choice.alt !== undefined ? { alt: choice.alt } : {}),
              })
          },
        )
      : null
    this.tools = el(
      "div",
      {
        className: "onsite-tools onsite-bar",
        [UI_ATTRIBUTE]: true,
        contenteditable: "false",
        hidden: true,
        role: "toolbar",
        "aria-label": "그림 도구",
      },
      [
        // Placement is picked right in the bar: four layout icons, no dropdown.
        this.presets.root,
        el("span", { className: "onsite-bar__sep", "aria-hidden": "true" }),
        uiButton("캡션", { className: "onsite-bar__button" }, () => this.captionInput.focus()),
        ...this.menu(
          "대체 텍스트",
          "대체 텍스트",
          [uiField("대체 텍스트", this.altInput)],
          this.altInput,
        ),
        el("span", { className: "onsite-bar__sep", "aria-hidden": "true" }),
        pick,
        uiButton(
          "삭제",
          {
            className: "onsite-bar__button onsite-bar__danger",
            "data-icon": "delete",
            title: "그림 삭제",
          },
          () => this.remove(),
        ),
        uiButton(
          "✕",
          { className: "onsite-bar__button", "aria-label": "그림 도구 닫기", title: "닫기 (Esc)" },
          leave,
        ),
      ],
    )
    this.tools.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      if (this.menus.some((entry) => !entry.panel.hidden)) {
        this.closeMenus()
        this.editor.view.focus()
      } else leave()
    })
    this.dom = el("figure", { "data-onsite-image": true }, [
      this.image,
      this.placeholder,
      this.caption,
      this.captionInput,
      this.handle("left"),
      this.handle("right"),
      this.tools,
    ])
    this.render()
    keepControlsUndraggable(this.dom)
  }

  /** A toolbar button with its dropdown panel, as in Confluence's media toolbar. */
  private menu(
    label: string,
    title: string,
    content: readonly (HTMLElement | null)[],
    focusTarget?: HTMLElement,
  ): readonly HTMLElement[] {
    const panel = el(
      "div",
      { className: "onsite-bar__menu", hidden: true, role: "group", "aria-label": `${title} 메뉴` },
      content,
    )
    const button = uiButton(
      label,
      {
        className: "onsite-bar__button",
        "aria-haspopup": "true",
        "aria-expanded": "false",
        "aria-label": title,
        title,
      },
      () => {
        const open = panel.hidden
        this.closeMenus()
        panel.hidden = !open
        button.setAttribute("aria-expanded", String(open))
        if (open) (focusTarget ?? panel.querySelector<HTMLElement>("button, input"))?.focus()
      },
    )
    this.menus.push({ button, panel })
    return [button, panel]
  }

  private closeMenus(): void {
    for (const entry of this.menus) {
      entry.panel.hidden = true
      entry.button.setAttribute("aria-expanded", "false")
    }
  }

  /** Side handles resize by snapping to the nearest figure preset. */
  private handle(edge: "left" | "right"): HTMLElement {
    const grip = el("span", {
      className: `onsite-resize onsite-resize--${edge}`,
      [UI_ATTRIBUTE]: true,
      contenteditable: "false",
      "aria-hidden": "true",
    })
    grip.addEventListener("pointerdown", (event) => {
      event.preventDefault()
      grip.setPointerCapture(event.pointerId)
      const column = this.editor.view.dom.getBoundingClientRect().width
      const start = this.image.getBoundingClientRect().width
      const originX = event.clientX
      let ratio = start / column
      const move = (next: PointerEvent): void => {
        const delta = (next.clientX - originX) * (edge === "right" ? 1 : -1)
        const width = Math.max(48, start + delta * 2)
        ratio = width / column
        this.image.style.width = `${Math.round(Math.min(width, column * 1.4))}px`
        this.dom.dataset["resize"] = presetForWidth(ratio, edge)
      }
      const end = (): void => {
        grip.removeEventListener("pointermove", move)
        this.image.style.removeProperty("width")
        delete this.dom.dataset["resize"]
        this.commit({ preset: presetForWidth(ratio, edge) })
        this.editor.view.focus()
      }
      grip.addEventListener("pointermove", move)
      grip.addEventListener("pointerup", end, { once: true })
      grip.addEventListener("pointercancel", end, { once: true })
    })
    return grip
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) {
      return false
    }
    this.node = node
    this.render()
    return true
  }

  selectNode(): void {
    this.dom.classList.add("ProseMirror-selectednode", "is-selected")
    toggleHidden(this.tools, false)
    placePopover(this.tools)
  }

  deselectNode(): void {
    this.dom.classList.remove("ProseMirror-selectednode", "is-selected")
    toggleHidden(this.tools, true)
    this.closeMenus()
  }

  stopEvent(event: Event): boolean {
    return isUiTarget(event.target)
  }

  ignoreMutation(): boolean {
    return true
  }

  private remove(): void {
    const pos = this.getPos()
    if (pos === undefined) return
    this.editor.view.dispatch(this.editor.state.tr.delete(pos, pos + this.node.nodeSize))
    this.editor.view.focus()
  }

  private commit(patch: Partial<ImageModel>): void {
    const pos = this.getPos()
    if (pos === undefined) {
      return
    }
    const tr = this.editor.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...patch })
    // Switching to a side layout puts the caret beside the picture, ready to write there.
    const beside =
      isSidePreset(patch.preset) && !isSidePreset(this.node.attrs["preset"])
        ? ensureParagraphAfter(tr, pos)
        : null
    tr.setSelection(
      beside === null ? NodeSelection.create(tr.doc, pos) : TextSelection.create(tr.doc, beside),
    )
    this.editor.view.dispatch(tr)
  }

  private render(): void {
    const model = imageModelFromAttrs(this.node.attrs)
    this.dom.className = `figure figure-${model.preset} onsite-image${
      this.dom.classList.contains("is-selected") ? " is-selected ProseMirror-selectednode" : ""
    }`
    this.dom.dataset["preset"] = model.preset
    syncImageElement(this.image, this.options, model)
    toggleHidden(this.image, model.src === "")
    toggleHidden(this.placeholder, model.src !== "")
    this.caption.textContent = model.title ?? ""
    toggleHidden(this.caption, model.title === null)
    syncValue(this.captionInput, model.title ?? "")
    syncValue(this.altInput, model.alt)
    this.presets.sync(model.preset)
  }
}

export function createImageNode(options: ResolvedBlockOptions) {
  return Node.create({
    name: IMAGE_NODE,
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,

    addAttributes() {
      return {
        src: { default: "" },
        alt: { default: "" },
        title: { default: null },
        preset: {
          default: "body",
          parseHTML: (element) => {
            const value = element.getAttribute("data-preset")
            return isImagePreset(value) ? value : "body"
          },
          renderHTML: (attributes) => ({ "data-preset": attrString(attributes, "preset", "body") }),
        },
        raw: { default: null, rendered: false },
      }
    },

    parseHTML() {
      return [
        {
          tag: "figure[data-onsite-image]",
          getAttrs: (element) => {
            const image = element.querySelector("img")
            if (!image) {
              return false
            }
            const caption = element.querySelector("figcaption")?.textContent ?? ""
            return {
              src: image.getAttribute("src") ?? "",
              alt: image.getAttribute("alt") ?? "",
              title: caption === "" ? null : caption,
            }
          },
        },
        {
          tag: 'img[src]:not([src^="data:"])',
          getAttrs: (element) => ({
            src: element.getAttribute("src") ?? "",
            alt: element.getAttribute("alt") ?? "",
            title: element.getAttribute("title") || null,
          }),
        },
      ]
    },

    renderHTML({ node, HTMLAttributes }) {
      const model = imageModelFromAttrs(node.attrs)
      const figure: Record<string, string> = {
        class: `figure figure-${model.preset}`,
        "data-onsite-image": "",
        "data-preset": attrString(HTMLAttributes, "data-preset", model.preset),
      }
      const image = { src: model.src, alt: model.alt, loading: "lazy" }
      return model.title
        ? ["figure", figure, ["img", image], ["figcaption", {}, model.title]]
        : ["figure", figure, ["img", image]]
    },

    parseMarkdown: (token) => {
      const raw = typeof token.raw === "string" ? token.raw.trim() : ""
      const fromRaw = raw === "" ? null : parseImageMarkdown(raw)
      const model = fromRaw ?? imageModelFromToken(token)
      return { type: IMAGE_NODE, attrs: { ...model, raw: fromRaw ? raw : null } }
    },

    renderMarkdown: (node) => {
      const attrs = node.attrs ?? {}
      return attrNullableString(attrs, "raw") ?? serializeImageMarkdown(imageModelFromAttrs(attrs))
    },

    addCommands() {
      return {
        setImagePreset:
          (preset) =>
          ({ state, tr, dispatch }) => {
            const { selection } = state
            if (!(selection instanceof NodeSelection) || selection.node.type.name !== this.name) {
              return false
            }
            if (dispatch) {
              tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, preset })
              // Shortcuts keep the picture selected so presets can be cycled; Escape then
              // lands in the paragraph beside it.
              if (isSidePreset(preset)) ensureParagraphAfter(tr, selection.from)
              tr.setSelection(NodeSelection.create(tr.doc, selection.from))
            }
            return true
          },
      }
    },

    addKeyboardShortcuts() {
      const set = (preset: ImagePreset) => () => this.editor.commands.setImagePreset(preset)
      return {
        Escape: () => leaveSelectedNode(this.editor, this.name),
        "Alt-ArrowLeft": set("side-left"),
        "Alt-ArrowRight": set("side-right"),
        "Alt-ArrowUp": set("wide"),
        "Alt-ArrowDown": set("body"),
      }
    },

    addNodeView() {
      return ({ node, editor, getPos }) => new ImageView(node, editor, getPos, options)
    },
  })
}
