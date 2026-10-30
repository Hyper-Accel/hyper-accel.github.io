import { type Editor, Node } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { NodeSelection } from "@tiptap/pm/state"
import type { NodeView } from "@tiptap/pm/view"
import {
  clampCompareStart,
  compareStart,
  getParam,
  type ImageModel,
  removeParam,
  type ShortcodeParam,
  serializeImageBlock,
  setParam,
} from "../shortcode"
import {
  attrJson,
  EMPTY_IMAGE,
  parseJsonAttribute,
  toDelimiter,
  toImageModel,
  toParams,
} from "./attrs"
import {
  attrNullableString,
  el,
  isUiTarget,
  keepControlsUndraggable,
  leaveSelectedNode,
  syncValue,
  toggleHidden,
  UI_ATTRIBUTE,
  uiButton,
  uiInput,
} from "./dom"
import { imageElement, syncImageElement } from "./image-fields"
import type { ResolvedBlockOptions } from "./options"
import { SHORTCODE_TOKEN, type ShortcodeToken, shortcodeBlockKind } from "./tokenizers"

export const COMPARE_NODE = "compare"

interface CompareModel {
  readonly before: ImageModel
  readonly after: ImageModel
  readonly params: readonly ShortcodeParam[]
}

function compareModel(attrs: PMNode["attrs"]): CompareModel {
  return {
    before: toImageModel(attrJson(attrs, "before")),
    after: toImageModel(attrJson(attrs, "after")),
    params: toParams(attrJson(attrs, "params")),
  }
}

function labelOf(image: ImageModel): string {
  return image.title ?? image.alt
}

class CompareView implements NodeView {
  readonly dom: HTMLElement
  private readonly stage: HTMLElement
  private readonly beforeImage: HTMLImageElement
  private readonly afterImage: HTMLImageElement
  private readonly beforeLabel: HTMLElement
  private readonly afterLabel: HTMLElement
  private readonly range: HTMLInputElement
  private readonly caption: HTMLElement
  private readonly captionInput: HTMLInputElement
  private readonly labelInputs: Record<"before" | "after", HTMLInputElement>
  private readonly pickButtons: Record<"before" | "after", HTMLButtonElement | null>
  private node: PMNode

  constructor(
    node: PMNode,
    private readonly editor: Editor,
    private readonly getPos: () => number | undefined,
    private readonly options: ResolvedBlockOptions,
  ) {
    this.node = node
    const model = compareModel(node.attrs)
    this.beforeImage = imageElement(options, model.before)
    this.afterImage = imageElement(options, model.after)
    this.beforeLabel = el("span", { className: "compare-label" })
    this.afterLabel = el("span", { className: "compare-label" })
    this.range = el("input", {
      className: "compare-range",
      type: "range",
      min: "0",
      max: "100",
      step: "1",
      "aria-label": "비교 위치",
      [UI_ATTRIBUTE]: true,
    })
    this.range.addEventListener("input", () => {
      this.stage.style.setProperty("--compare-pos", `${this.range.value}%`)
    })
    this.range.addEventListener("change", () => this.commitStart(Number(this.range.value)))
    // Everything is edited in place, as published: no settings card. Each side's label is typed on
    // the picture, 교체 swaps it, the slider sets the start position and the caption is typed under it.
    this.labelInputs = {
      before: uiInput(
        {
          className: "onsite-compare-label-input",
          placeholder: "이전",
          "aria-label": "이전 그림 라벨",
        },
        (value) => this.commitImage("before", { title: value.trim() === "" ? null : value }),
      ),
      after: uiInput(
        {
          className: "onsite-compare-label-input",
          placeholder: "이후",
          "aria-label": "이후 그림 라벨",
        },
        (value) => this.commitImage("after", { title: value.trim() === "" ? null : value }),
      ),
    }
    const pick = (side: "before" | "after"): HTMLButtonElement | null =>
      options.requestImage
        ? uiButton(
            "교체",
            {
              className: "onsite-compare-pick",
              "aria-label": side === "before" ? "이전 그림 교체" : "이후 그림 교체",
            },
            async () => {
              const choice = await options.requestImage?.()
              if (choice)
                this.commitImage(side, {
                  src: choice.src,
                  ...(choice.alt !== undefined ? { alt: choice.alt } : {}),
                })
            },
          )
        : null
    this.pickButtons = { before: pick("before"), after: pick("after") }
    this.stage = el("div", { className: "compare is-ready" }, [
      el("div", { className: "compare-pane compare-before" }, [
        el("figure", { className: "figure figure-body" }, [this.beforeImage]),
        this.beforeLabel,
      ]),
      el("div", { className: "compare-pane compare-after" }, [
        el("figure", { className: "figure figure-body" }, [this.afterImage]),
        this.afterLabel,
      ]),
      el("div", { className: "compare-divider", "aria-hidden": "true" }),
      this.range,
      // Over the slider (the clipped "after" pane cannot lift its own controls above it).
      el("div", { className: "onsite-compare-side is-before", [UI_ATTRIBUTE]: true }, [
        this.labelInputs.before,
        this.pickButtons.before,
      ]),
      el("div", { className: "onsite-compare-side is-after", [UI_ATTRIBUTE]: true }, [
        this.labelInputs.after,
        this.pickButtons.after,
      ]),
    ])
    this.caption = el("figcaption")
    this.captionInput = uiInput(
      { className: "onsite-caption-input", placeholder: "캡션 추가", "aria-label": "캡션" },
      (value) => {
        const trimmed = value.trim()
        this.commit({
          params:
            trimmed === ""
              ? removeParam(compareModel(this.node.attrs).params, "caption")
              : setParam(compareModel(this.node.attrs).params, "caption", value),
        })
      },
    )
    this.dom = el(
      "figure",
      {
        className: "figure figure-compare onsite-compare",
        "data-onsite-compare": true,
        contenteditable: "false",
      },
      [this.stage, this.caption, this.captionInput],
    )
    this.render()
    keepControlsUndraggable(this.dom)
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
  }

  deselectNode(): void {
    this.dom.classList.remove("ProseMirror-selectednode", "is-selected")
  }

  stopEvent(event: Event): boolean {
    return isUiTarget(event.target)
  }

  ignoreMutation(): boolean {
    return true
  }

  private commitImage(side: "before" | "after", patch: Partial<ImageModel>): void {
    const current = compareModel(this.node.attrs)[side]
    this.commit({ [side]: { ...current, ...patch } })
  }

  private commitStart(value: number): void {
    const start = clampCompareStart(value)
    this.commit({ params: setParam(compareModel(this.node.attrs).params, "start", String(start)) })
  }

  private commit(patch: Record<string, unknown>): void {
    const pos = this.getPos()
    if (pos === undefined) {
      return
    }
    const tr = this.editor.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...patch })
    tr.setSelection(NodeSelection.create(tr.doc, pos))
    this.editor.view.dispatch(tr)
  }

  private render(): void {
    const model = compareModel(this.node.attrs)
    const start = compareStart(model.params)
    const caption = getParam(model.params, "caption")
    this.dom.dataset["start"] = String(start)
    this.stage.style.setProperty("--compare-pos", `${start}%`)
    syncValue(this.range, String(start))
    syncImageElement(this.beforeImage, this.options, model.before)
    syncImageElement(this.afterImage, this.options, model.after)
    this.beforeLabel.textContent = labelOf(model.before)
    this.afterLabel.textContent = labelOf(model.after)
    this.caption.textContent = caption ?? ""
    toggleHidden(this.caption, caption === null)
    syncValue(this.labelInputs.before, model.before.title ?? "")
    syncValue(this.labelInputs.after, model.after.title ?? "")
    this.labelInputs.before.placeholder = model.before.alt || "이전"
    this.labelInputs.after.placeholder = model.after.alt || "이후"
    for (const side of ["before", "after"] as const) {
      const button = this.pickButtons[side]
      const empty = model[side].src === ""
      if (button) {
        button.textContent = empty
          ? side === "before"
            ? "이전 그림 선택"
            : "이후 그림 선택"
          : "교체"
        button.classList.toggle("is-empty", empty)
      }
    }
    syncValue(this.captionInput, caption ?? "")
  }
}

export function createCompareNode(options: ResolvedBlockOptions) {
  return Node.create({
    name: COMPARE_NODE,
    group: "block",
    atom: true,
    draggable: true,
    markdownTokenName: SHORTCODE_TOKEN,

    addAttributes() {
      return {
        before: { default: EMPTY_IMAGE, rendered: false },
        after: { default: EMPTY_IMAGE, rendered: false },
        params: { default: [], rendered: false },
        delimiter: { default: "<", rendered: false },
        raw: { default: null, rendered: false },
      }
    },

    parseHTML() {
      return [
        {
          tag: "figure[data-onsite-compare]",
          getAttrs: (element) => {
            const data = parseJsonAttribute(element, "data-onsite-compare")
            const record =
              typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {}
            return {
              before: toImageModel(record["before"]),
              after: toImageModel(record["after"]),
              params: toParams(record["params"]),
            }
          },
        },
      ]
    },

    renderHTML({ node }) {
      const model = compareModel(node.attrs)
      const start = compareStart(model.params)
      const caption = getParam(model.params, "caption")
      const pane = (side: "before" | "after", image: ImageModel) =>
        [
          "div",
          { class: `compare-pane compare-${side}` },
          [
            "figure",
            { class: "figure figure-body" },
            ["img", { src: image.src, alt: image.alt, loading: "lazy" }],
          ],
          ["span", { class: "compare-label" }, labelOf(image)],
        ] as const
      const figure = [
        "figure",
        {
          class: "figure figure-compare",
          "data-start": String(start),
          "data-onsite-compare": JSON.stringify(model),
        },
        [
          "div",
          { class: "compare", style: `--compare-pos:${start}%` },
          pane("before", model.before),
          pane("after", model.after),
          ["div", { class: "compare-divider", "aria-hidden": "true" }],
        ],
      ] as const
      return caption ? [...figure, ["figcaption", {}, caption]] : figure
    },

    parseMarkdown: (token) => {
      if (shortcodeBlockKind(token) !== COMPARE_NODE) {
        return []
      }
      const block = token as ShortcodeToken
      const images = Array.isArray(block.images) ? block.images : []
      return {
        type: COMPARE_NODE,
        attrs: {
          before: toImageModel(images[0]),
          after: toImageModel(images[1]),
          params: toParams(block.params),
          delimiter: toDelimiter(block.delimiter),
          raw: typeof token.raw === "string" ? token.raw : null,
        },
      }
    },

    renderMarkdown: (node) => {
      const attrs = node.attrs ?? {}
      const model = compareModel(attrs)
      return (
        attrNullableString(attrs, "raw") ??
        serializeImageBlock(
          COMPARE_NODE,
          model.params,
          [model.before, model.after],
          toDelimiter(attrJson(attrs, "delimiter")),
        )
      )
    },

    addKeyboardShortcuts() {
      return { Escape: () => leaveSelectedNode(this.editor, this.name) }
    },

    addNodeView() {
      return ({ node, editor, getPos }) => new CompareView(node, editor, getPos, options)
    },
  })
}
