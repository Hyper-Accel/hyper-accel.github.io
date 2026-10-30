import type { Editor } from "@tiptap/core"
import { Fragment, type Node as PMNode, Slice } from "@tiptap/pm/model"
import { NodeSelection } from "@tiptap/pm/state"
import type { EditorView, NodeView } from "@tiptap/pm/view"
import type { ImageModel } from "../shortcode"
import { attrJson, toImageList } from "./attrs"
import {
  el,
  isUiTarget,
  keepControlsUndraggable,
  leaveNode,
  placePopover,
  syncValue,
  toggleHidden,
  UI_ATTRIBUTE,
  uiButton,
  uiInput,
} from "./dom"
import { IMAGE_NODE } from "./image"
import { imageElement, syncImageElement } from "./image-fields"
import {
  type GroupKind,
  PAIR_MAX,
  PAIR_NODE,
  pictureNode,
  SLIDES_MAX,
  SLIDES_NODE,
  setGroupDrag,
  setPendingActive,
  setPictureDragImage,
  takePendingActive,
} from "./image-groups"
import type { ResolvedBlockOptions } from "./options"

interface Item {
  readonly root: HTMLElement
  readonly image: HTMLImageElement
  readonly caption: HTMLElement
  readonly captionInput: HTMLInputElement
}

type Dragging = NonNullable<EditorView["dragging"]>

/**
 * A row of pictures (Naver's "나란히 놓기") or slides (its "슬라이드"), drawn exactly as published.
 * There is no settings card: each picture is picked on its own and edited in place (caption under
 * it, a small bar for alt text, replace, move, take out, delete), as in Naver's editor.
 */
export class PictureGroupView implements NodeView {
  readonly dom: HTMLElement
  private readonly track: HTMLElement
  private readonly bar: HTMLElement
  private readonly altPanel: HTMLElement
  private readonly altButton: HTMLButtonElement
  private readonly altInput: HTMLInputElement
  private readonly earlier: HTMLButtonElement
  private readonly later: HTMLButtonElement
  private readonly add: HTMLButtonElement
  private readonly convert: HTMLButtonElement
  private readonly slideControls: {
    prev: HTMLButtonElement
    next: HTMLButtonElement
    count: HTMLElement
  } | null
  private readonly editPanel: HTMLElement | null
  private readonly editButton: HTMLButtonElement | null
  private items: Item[] = []
  private active = 0
  private node: PMNode

  constructor(
    node: PMNode,
    private readonly editor: Editor,
    private readonly getPos: () => number | undefined,
    private readonly options: ResolvedBlockOptions,
    private readonly kind: GroupKind,
  ) {
    this.node = node
    const slides = kind === SLIDES_NODE
    this.altInput = uiInput(
      { placeholder: "그림을 설명하는 문장", "aria-label": "대체 텍스트" },
      (value) => this.patchActive({ alt: value }),
    )
    this.altInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return
      event.preventDefault()
      this.toggleAlt(false)
      this.editor.view.focus()
    })
    this.altPanel = el(
      "div",
      { className: "onsite-bar__menu", hidden: true, role: "group", "aria-label": "대체 텍스트" },
      [this.altInput],
    )
    this.altButton = uiButton(
      "대체 텍스트",
      { className: "onsite-bar__button", "aria-haspopup": "true", "aria-expanded": "false" },
      () => this.toggleAlt(this.altPanel.hidden),
    )
    this.earlier = uiButton(
      slides ? "앞으로" : "◀",
      {
        className: "onsite-bar__button",
        "aria-label": slides ? "앞으로" : "왼쪽으로",
        title: slides ? "앞으로" : "왼쪽으로",
      },
      () => this.move(-1),
    )
    this.later = uiButton(
      slides ? "뒤로" : "▶",
      {
        className: "onsite-bar__button",
        "aria-label": slides ? "뒤로" : "오른쪽으로",
        title: slides ? "뒤로" : "오른쪽으로",
      },
      () => this.move(1),
    )
    this.add = uiButton(
      "+ 사진",
      { className: "onsite-bar__button", title: slides ? "사진 추가" : "옆에 사진 추가" },
      () => {
        void this.addPicture()
      },
    )
    this.convert = uiButton(
      slides ? "나란히로" : "슬라이드로",
      {
        className: "onsite-bar__button",
        title: slides ? "한 줄에 나란히 놓기 (3장까지)" : "한 장씩 넘겨 보는 슬라이드로",
      },
      () => this.switchKind(),
    )
    const pick = options.requestImage
      ? uiButton("교체", { className: "onsite-bar__button", title: "다른 그림으로 바꾸기" }, () => {
          void this.replaceActive()
        })
      : null
    const close = uiButton(
      "✕",
      { className: "onsite-bar__button", "aria-label": "그림 도구 닫기", title: "닫기 (Esc)" },
      () => leaveNode(this.editor, this.getPos(), this.node),
    )
    this.editButton = slides
      ? uiButton(
          "그룹 편집",
          {
            className: "onsite-bar__button",
            "aria-expanded": "false",
            title: "순서 바꾸기·교체·삭제",
          },
          () => this.toggleEdit(),
        )
      : null
    this.bar = el(
      "div",
      {
        className: "onsite-tools onsite-bar onsite-group-bar",
        [UI_ATTRIBUTE]: true,
        contenteditable: "false",
        hidden: true,
        role: "toolbar",
        "aria-label": "그림 도구",
      },
      [
        this.earlier,
        this.later,
        el("span", { className: "onsite-bar__sep", "aria-hidden": "true" }),
        this.altButton,
        this.altPanel,
        pick,
        uiButton(
          slides ? "빼내기" : "따로 두기",
          { className: "onsite-bar__button", title: "이 그림만 묶음 밖으로 빼기" },
          () => this.takeOut(),
        ),
        uiButton(
          "삭제",
          { className: "onsite-bar__button onsite-bar__danger", title: "이 그림 삭제" },
          () => this.removeActive(),
        ),
        el("span", { className: "onsite-bar__sep", "aria-hidden": "true" }),
        this.add,
        this.editButton,
        this.convert,
        close,
      ],
    )
    this.bar.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      if (!this.altPanel.hidden) {
        this.toggleAlt(false)
        this.editor.view.focus()
      } else leaveNode(this.editor, this.getPos(), this.node)
    })
    if (slides) {
      this.track = el("div", { className: "slides" })
      const prev = uiButton("‹", { className: "slides-prev", "aria-label": "이전 사진" }, () =>
        this.show(this.active - 1),
      )
      const next = uiButton("›", { className: "slides-next", "aria-label": "다음 사진" }, () =>
        this.show(this.active + 1),
      )
      const count = el("span", { className: "slides-count", "aria-hidden": "true" })
      this.slideControls = { prev, next, count }
      this.track.addEventListener(
        "scroll",
        () => requestAnimationFrame(() => this.syncSlideControls()),
        { passive: true },
      )
      this.editPanel = el("div", {
        className: "onsite-group-edit",
        [UI_ATTRIBUTE]: true,
        contenteditable: "false",
        hidden: true,
        role: "list",
        "aria-label": "슬라이드 사진 순서",
      })
      this.dom = el(
        "figure",
        {
          className: "figure figure-slides is-ready onsite-slides onsite-group",
          "data-onsite-slides": true,
          contenteditable: "false",
        },
        [
          el("div", { className: "slides-stage" }, [this.track, prev, next, count]),
          this.editPanel,
          this.bar,
        ],
      )
    } else {
      this.slideControls = null
      this.editPanel = null
      this.track = el("div", {
        className: "figure-pair onsite-pair onsite-group",
        "data-onsite-pair": true,
        contenteditable: "false",
      })
      this.track.append(this.bar)
      this.dom = this.track
    }
    // Picking a picture inside the group makes it the one the bar edits.
    this.track.addEventListener("mousedown", (event) => {
      const item =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-group-index]")
          : null
      if (!item || isUiTarget(event.target)) return
      this.setActive(Number(item.dataset["groupIndex"]))
    })
    // The pictures are draggable (to move one out), so a plain click selects the group here.
    this.track.addEventListener("click", (event) => {
      const item =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-group-index]")
          : null
      const pos = this.getPos()
      if (!item || isUiTarget(event.target) || pos === undefined) return
      // Already selected: the mousedown above made this picture the active one.
      if (this.dom.classList.contains("is-selected")) return
      setPendingActive(Number(item.dataset["groupIndex"]))
      const { tr } = this.editor.state
      this.editor.view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)))
      this.editor.view.focus()
    })
    this.render()
    keepControlsUndraggable(this.dom)
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    // A picture just joined (or moved) becomes the one the bar edits.
    if (this.dom.classList.contains("is-selected"))
      this.setActive(takePendingActive() ?? this.active)
    return true
  }

  selectNode(): void {
    this.dom.classList.add("ProseMirror-selectednode", "is-selected")
    this.setActive(takePendingActive() ?? this.active)
    toggleHidden(this.bar, false)
    placePopover(this.bar)
  }

  deselectNode(): void {
    this.dom.classList.remove("ProseMirror-selectednode", "is-selected")
    toggleHidden(this.bar, true)
    this.toggleAlt(false)
    if (this.editPanel) this.toggleEdit(false)
  }

  stopEvent(event: Event): boolean {
    // A picture dragged out of the group is handled here, not as a drag of the whole group.
    if (event.type === "dragstart") return true
    return isUiTarget(event.target)
  }

  ignoreMutation(): boolean {
    return true
  }

  private images(): ImageModel[] {
    return toImageList(attrJson(this.node.attrs, "images"))
  }

  private setActive(index: number): void {
    this.active = Math.max(0, Math.min(index, this.items.length - 1))
    for (const [i, item] of this.items.entries())
      item.root.classList.toggle("is-active", i === this.active)
    const image = this.images()[this.active]
    if (image) syncValue(this.altInput, image.alt)
    this.earlier.disabled = this.active === 0
    this.later.disabled = this.active === this.items.length - 1
    if (this.kind === SLIDES_NODE) this.show(this.active)
  }

  private toggleAlt(open: boolean): void {
    this.altPanel.hidden = !open
    this.altButton.setAttribute("aria-expanded", String(open))
    if (open) this.altInput.focus()
  }

  private toggleEdit(open = this.editPanel?.hidden ?? false): void {
    if (!this.editPanel || !this.editButton) return
    this.editPanel.hidden = !open
    this.editButton.setAttribute("aria-expanded", String(open))
  }

  /** Writes the group's pictures; one picture left stands on its own again. */
  private commit(
    images: readonly ImageModel[],
    active = this.active,
    kind: GroupKind = this.kind,
  ): void {
    const pos = this.getPos()
    if (pos === undefined) return
    const replacement = pictureNode(this.editor.schema, kind, images)
    const { tr } = this.editor.state
    if (!replacement) tr.delete(pos, pos + this.node.nodeSize)
    else if (replacement.type === this.node.type)
      tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, images: [...images], raw: null })
    else tr.replaceWith(pos, pos + this.node.nodeSize, replacement)
    if (replacement) tr.setSelection(NodeSelection.create(tr.doc, pos))
    setPendingActive(active)
    this.editor.view.dispatch(tr)
    this.setActive(active)
  }

  private patchActive(patch: Partial<ImageModel>): void {
    const images = this.images()
    const current = images[this.active]
    if (!current) return
    images[this.active] = { ...current, ...patch }
    this.commit(images)
  }

  private patchAt(index: number, patch: Partial<ImageModel>): void {
    const images = this.images()
    const current = images[index]
    if (!current) return
    images[index] = { ...current, ...patch }
    this.commit(images, index)
  }

  private move(step: -1 | 1): void {
    this.reorder(this.active, this.active + step)
  }

  private reorder(from: number, to: number): void {
    const images = this.images()
    if (to < 0 || to >= images.length || from === to) return
    const [moved] = images.splice(from, 1)
    if (!moved) return
    images.splice(to, 0, moved)
    this.commit(images, to)
  }

  private removeActive(): void {
    this.removeAt(this.active)
  }

  private removeAt(index: number): void {
    const images = this.images()
    images.splice(index, 1)
    this.commit(images, Math.min(index, images.length - 1))
    if (images.length <= 1) this.editor.view.focus()
  }

  /** "따로 두기": the picture leaves the group and stands on its own right after it. */
  private takeOut(): void {
    const pos = this.getPos()
    const images = this.images()
    const [taken] = images.splice(this.active, 1)
    const single = this.editor.schema.nodes[IMAGE_NODE]
    if (pos === undefined || !taken || !single) return
    const rest = pictureNode(this.editor.schema, this.kind, images)
    const { tr } = this.editor.state
    if (rest) tr.replaceWith(pos, pos + this.node.nodeSize, rest)
    const after = pos + (rest?.nodeSize ?? 0)
    tr.insert(after, single.create({ ...taken, raw: null }))
    tr.setSelection(NodeSelection.create(tr.doc, after))
    this.editor.view.dispatch(tr.scrollIntoView())
    this.editor.view.focus()
  }

  private async replaceActive(): Promise<void> {
    const index = this.active
    const choice = await this.options.requestImage?.()
    if (!choice) return
    this.patchAt(index, {
      src: choice.src,
      ...(choice.alt !== undefined ? { alt: choice.alt } : {}),
    })
  }

  private async addPicture(): Promise<void> {
    const choice = await this.options.requestImage?.()
    if (!choice) return
    const images = this.images()
    const at = this.active + 1
    images.splice(at, 0, { src: choice.src, alt: choice.alt ?? "", title: null, preset: "body" })
    this.commit(images, at)
  }

  /** Row ↔ slides, as Naver's 콜라주/슬라이드 switch. A row holds three at most. */
  private switchKind(): void {
    const images = this.images()
    const kind = this.kind === PAIR_NODE ? SLIDES_NODE : PAIR_NODE
    if (kind === PAIR_NODE && images.length > PAIR_MAX) return
    this.commit(images, this.active, kind)
  }

  private show(index: number): void {
    if (!this.slideControls) return
    const target = Math.max(0, Math.min(index, this.items.length - 1))
    this.track.scrollTo({ left: target * this.track.clientWidth })
    if (target !== this.active) this.setActive(target)
    this.syncSlideControls(target)
  }

  private syncSlideControls(
    index = Math.round(this.track.scrollLeft / Math.max(1, this.track.clientWidth)),
  ): void {
    if (!this.slideControls) return
    const last = this.items.length - 1
    const current = Math.max(0, Math.min(index, last))
    this.slideControls.count.textContent = `${current + 1} / ${this.items.length}`
    this.slideControls.prev.disabled = current === 0
    this.slideControls.next.disabled = current === last
    if (current !== this.active && this.dom.classList.contains("is-selected")) {
      this.active = current
      for (const [i, item] of this.items.entries())
        item.root.classList.toggle("is-active", i === current)
      this.earlier.disabled = current === 0
      this.later.disabled = current === last
    }
  }

  private makeItem(index: number): Item {
    const image = imageElement(this.options, { src: "", alt: "", title: null, preset: "body" })
    const caption = el("figcaption")
    const captionInput = uiInput(
      { className: "onsite-caption-input", placeholder: "캡션 추가", "aria-label": "캡션" },
      (value) =>
        this.patchAt(Number(root.dataset["groupIndex"]), {
          title: value.trim() === "" ? null : value,
        }),
    )
    const root = el(
      "figure",
      {
        className: "figure figure-body onsite-group__item",
        "data-group-index": String(index),
        draggable: "true",
      },
      [image, caption, captionInput],
    )
    if (this.kind === PAIR_NODE) {
      const ratio = (): void => {
        if (image.naturalWidth && image.naturalHeight)
          root.style.setProperty("--pair-ratio", String(image.naturalWidth / image.naturalHeight))
      }
      image.addEventListener("load", ratio)
    }
    // Dragging one picture moves only that picture: beside another picture, or out of the group.
    root.addEventListener("dragstart", (event) => {
      const pos = this.getPos()
      const at = Number(root.dataset["groupIndex"])
      const model = this.images()[at]
      const single = this.editor.schema.nodes[IMAGE_NODE]
      if (pos === undefined || !model || !single || isUiTarget(event.target)) {
        event.preventDefault()
        return
      }
      const dragging: Dragging = {
        slice: new Slice(Fragment.from(single.create({ ...model, raw: null })), 0, 0),
        move: false,
      }
      this.editor.view.dragging = dragging
      setGroupDrag({ pos, index: at })
      event.dataTransfer?.setData("text/plain", model.alt)
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copyMove"
      setPictureDragImage(event, image)
    })
    root.addEventListener("dragend", () => setGroupDrag(null))
    return { root, image, caption, captionInput }
  }

  private render(): void {
    const images = this.images()
    if (this.items.length !== images.length) {
      this.items = images.map((_, index) => this.makeItem(index))
      if (this.kind === SLIDES_NODE)
        this.track.replaceChildren(
          ...this.items.map((item) => el("div", { className: "slide" }, [item.root])),
        )
      else this.track.replaceChildren(...this.items.map((item) => item.root), this.bar)
    }
    images.forEach((model, index) => {
      const item = this.items[index]
      if (!item) return
      syncImageElement(item.image, this.options, model)
      item.caption.textContent = model.title ?? ""
      toggleHidden(item.caption, model.title === null)
      syncValue(item.captionInput, model.title ?? "")
      if (this.kind === PAIR_NODE && !(item.image.naturalWidth && item.image.naturalHeight))
        item.root.style.removeProperty("--pair-ratio")
      else if (this.kind === PAIR_NODE)
        item.root.style.setProperty(
          "--pair-ratio",
          String(item.image.naturalWidth / item.image.naturalHeight),
        )
    })
    if (this.kind === PAIR_NODE) this.track.dataset["count"] = String(images.length)
    this.add.disabled = images.length >= (this.kind === PAIR_NODE ? PAIR_MAX : SLIDES_MAX)
    this.convert.disabled = this.kind === SLIDES_NODE && images.length > PAIR_MAX
    this.renderEditPanel(images)
    this.setActive(this.active)
  }

  /** "그룹 편집" (Naver): thumbnails to drag into order; hover shows replace and delete. */
  private renderEditPanel(images: readonly ImageModel[]): void {
    const panel = this.editPanel
    if (!panel) return
    let dragged: number | null = null
    const thumbs = images.map((model, index) => {
      const thumb = el(
        "div",
        {
          className: "onsite-group-edit__thumb",
          role: "listitem",
          draggable: "true",
          "data-thumb": String(index),
        },
        [
          imageElement(this.options, model),
          el("span", { className: "onsite-group-edit__number" }, [String(index + 1)]),
          el("span", { className: "onsite-group-edit__actions" }, [
            uiButton(
              "교체",
              { className: "onsite-group-edit__action", "aria-label": `${index + 1}번 사진 교체` },
              () => {
                this.setActive(index)
                void this.replaceActive()
              },
            ),
            uiButton(
              "삭제",
              {
                className: "onsite-group-edit__action is-danger",
                "aria-label": `${index + 1}번 사진 삭제`,
              },
              () => this.removeAt(index),
            ),
          ]),
        ],
      )
      thumb.addEventListener("click", (event) => {
        if (event.target instanceof Element && event.target.closest("button")) return
        this.setActive(index)
      })
      thumb.addEventListener("dragstart", (event) => {
        dragged = index
        event.stopPropagation()
        event.dataTransfer?.setData("text/plain", String(index))
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"
      })
      thumb.addEventListener("dragover", (event) => {
        if (dragged === null) return
        event.preventDefault()
        event.stopPropagation()
        const rect = thumb.getBoundingClientRect()
        thumb.dataset["dropSide"] = event.clientX < rect.left + rect.width / 2 ? "before" : "after"
      })
      thumb.addEventListener("dragleave", () => delete thumb.dataset["dropSide"])
      thumb.addEventListener("drop", (event) => {
        if (dragged === null) return
        event.preventDefault()
        event.stopPropagation()
        const after = thumb.dataset["dropSide"] === "after"
        delete thumb.dataset["dropSide"]
        let to = index + (after ? 1 : 0)
        if (dragged < to) to -= 1
        const from = dragged
        dragged = null
        this.reorder(from, to)
      })
      return thumb
    })
    const add =
      images.length < SLIDES_MAX
        ? uiButton("+ 사진 추가", { className: "onsite-group-edit__add" }, () => {
            this.setActive(images.length - 1)
            void this.addPicture()
          })
        : null
    panel.replaceChildren(...thumbs, ...(add ? [add] : []))
  }
}
