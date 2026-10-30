import { Extension } from "@tiptap/core"
import type { Node as PMNode, Slice } from "@tiptap/pm/model"
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import type { ImagePreset } from "../../shared/onsite/blocks"
import { PRESET_LABELS } from "../shortcode"
import { el } from "./dom"
import { IMAGE_NODE, imageModelFromAttrs } from "./image"
import {
  currentGroupDrag,
  joinBeside,
  PAIR_MAX,
  PAIR_NODE,
  type PictureSpot,
  pictureList,
  pictureSpotAt,
  setGroupDrag,
  setPendingActive,
  setPictureDragImage,
  takeFromGroup,
} from "./image-groups"

type Zone =
  | {
      readonly kind: "preset"
      readonly preset: ImagePreset
      readonly element: ZoneName
      /** The gap between blocks the picture snaps to (Naver-style magnet), and where it is drawn. */
      readonly pos: number
      readonly y: number
    }
  | { readonly kind: "pair"; readonly spot: PictureSpot }

type ZoneName = "wide-left" | "side-left" | "body" | "side-right" | "wide-right" | "pair"

const ZONE_LABELS: Readonly<Record<ZoneName, string>> = {
  "wide-left": PRESET_LABELS.wide,
  "side-left": PRESET_LABELS["side-left"],
  body: PRESET_LABELS.body,
  "side-right": PRESET_LABELS["side-right"],
  "wide-right": PRESET_LABELS.wide,
  pair: "나란히",
}
const SIDE_FRACTION = 0.2
/** A picture's edge pulls a dragged picture beside it from this far outside (px). */
const MAGNET = 48
/** A side picture takes about a third of the column. */
const SIDE_WIDTH = 0.36
const MIN_RAIL = 48
const MAX_RAIL = 240

interface DragSource {
  readonly node: PMNode
  readonly pos: number | null
}

interface ViewDragging {
  readonly slice: Slice
  readonly move: boolean
  readonly node?: NodeSelection
}

function draggedImage(view: EditorView): DragSource | null {
  const dragging = view.dragging as ViewDragging | null
  if (dragging?.slice.content.childCount !== 1) {
    return null
  }
  const node = dragging.slice.content.firstChild
  if (!node || node.type.name !== IMAGE_NODE) {
    return null
  }
  if (dragging.node instanceof NodeSelection) {
    return { node, pos: dragging.node.from }
  }
  const { selection } = view.state
  if (selection instanceof NodeSelection && selection.node.type.name === IMAGE_NODE) {
    return { node, pos: selection.from }
  }
  return { node, pos: null }
}

export class DropZoneController {
  private view: EditorView | null = null
  private overlay: HTMLElement | null = null
  private indicator: HTMLElement | null = null
  private label: HTMLElement | null = null
  private source: DragSource | null = null
  private zone: Zone | null = null
  private clientY = 0
  private clientX = 0

  attach(view: EditorView): void {
    this.view = view
    view.dom.addEventListener("dragstart", this.onDragStart)
  }

  detach(): void {
    this.view?.dom.removeEventListener("dragstart", this.onDragStart)
    this.endDrag()
    this.overlay?.remove()
    this.overlay = null
    this.view = null
  }

  private readonly onDragStart = (event: DragEvent): void => {
    // A picture leaves a small thumbnail under the pointer and fades in place while it moves.
    const figure =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-onsite-image], [data-group-index]")
        : null
    if (figure) {
      setPictureDragImage(event, figure.querySelector("img"))
      figure.classList.add("is-drag-source")
      this.fading = figure
    }
    document.addEventListener("dragover", this.onDragOver, true)
    document.addEventListener("drop", this.onDrop, true)
    document.addEventListener("dragend", this.onDragEnd, true)
  }

  private readonly onDragEnd = (): void => this.endDrag()

  private readonly onDragOver = (event: DragEvent): void => {
    const view = this.view
    if (!view) {
      return
    }
    this.source ??= draggedImage(view)
    if (!this.source) {
      return
    }
    this.clientX = event.clientX
    this.clientY = event.clientY
    this.zone = this.zoneAt(view, event.clientX, event.clientY)
    this.renderOverlay(view)
    if (this.zone) {
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move"
      }
    }
  }

  private readonly onDrop = (event: DragEvent): void => {
    const view = this.view
    const source = this.source
    const zone = this.zone ?? (view ? this.zoneAt(view, event.clientX, event.clientY) : null)
    if (!view || !source || !zone) {
      this.endDrag()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const copy = event.altKey
    this.apply(view, source, zone, !copy)
    view.dragging = null
    this.endDrag()
  }

  private fading: HTMLElement | null = null

  private endDrag(): void {
    this.fading?.classList.remove("is-drag-source")
    this.fading = null
    document.removeEventListener("dragover", this.onDragOver, true)
    document.removeEventListener("drop", this.onDrop, true)
    document.removeEventListener("dragend", this.onDragEnd, true)
    this.source = null
    this.zone = null
    setGroupDrag(null)
    if (this.overlay) {
      this.overlay.hidden = true
    }
  }

  private railWidth(rect: DOMRect): number {
    const available = Math.min(rect.left, window.innerWidth - rect.right)
    return available < MIN_RAIL ? 0 : Math.min(available, MAX_RAIL)
  }

  private zoneAt(view: EditorView, x: number, y: number): Zone | null {
    const rect = view.dom.getBoundingClientRect()
    if (y < rect.top - MAGNET || y > rect.bottom + MAGNET) {
      return null
    }
    // Naver's "나란히 놓기": a picture's outer part, or just outside its edge, pulls this one beside it.
    const spot = pictureSpotAt(view, x, y, true) ?? this.magnetSpot(view, x, y)
    if (spot && this.canJoin(view, spot)) return { kind: "pair", spot }
    const rail = this.railWidth(rect)
    let element: ZoneName
    if (x < rect.left) {
      if (x < rect.left - rail) return null
      element = "wide-left"
    } else if (x > rect.right) {
      if (x > rect.right + rail) return null
      element = "wide-right"
    } else {
      const fraction = (x - rect.left) / rect.width
      element =
        fraction < SIDE_FRACTION
          ? "side-left"
          : fraction > 1 - SIDE_FRACTION
            ? "side-right"
            : "body"
    }
    const gap = this.nearestGap(view, y)
    if (!gap) return null
    const preset: ImagePreset =
      element === "wide-left" || element === "wide-right" ? "wide" : element
    return { kind: "preset", preset, element, pos: gap.pos, y: gap.y }
  }

  /** Just outside a picture's left or right edge (within MAGNET), level with it. */
  private magnetSpot(view: EditorView, x: number, y: number): PictureSpot | null {
    let found: PictureSpot | null = null
    view.state.doc.forEach((node, offset) => {
      if (found || (node.type.name !== IMAGE_NODE && node.type.name !== PAIR_NODE)) return
      const dom = view.nodeDOM(offset)
      if (!(dom instanceof HTMLElement)) return
      const items =
        node.type.name === PAIR_NODE
          ? [...dom.querySelectorAll<HTMLElement>("[data-group-index] > img")]
          : [dom.querySelector<HTMLElement>("img") ?? dom]
      items.forEach((item, index) => {
        if (found) return
        const box = item.getBoundingClientRect()
        if (y < box.top || y > box.bottom) return
        if (x < box.left && box.left - x <= MAGNET) found = { pos: offset, index, before: true }
        else if (x > box.right && x - box.right <= MAGNET)
          found = { pos: offset, index, before: false }
      })
    })
    return found
  }

  /** The gap between top-level blocks nearest to y: where a dropped picture goes (never after the notes). */
  private nearestGap(view: EditorView, y: number): { pos: number; y: number } | null {
    const blocks: { offset: number; top: number; bottom: number }[] = []
    let end = view.state.doc.content.size
    view.state.doc.forEach((node, offset) => {
      if (node.type.name === "footnoteSection") {
        end = Math.min(end, offset)
        return
      }
      const dom = view.nodeDOM(offset)
      if (!(dom instanceof HTMLElement)) return
      const box = dom.getBoundingClientRect()
      if (box.height === 0) return
      blocks.push({ offset, top: box.top, bottom: box.bottom })
    })
    const first = blocks[0]
    const last = blocks.at(-1)
    if (!first || !last) return null
    const gaps = blocks.map((block, index) => ({
      pos: block.offset,
      y: index === 0 ? block.top : ((blocks[index - 1]?.bottom ?? block.top) + block.top) / 2,
    }))
    gaps.push({ pos: Math.min(end, view.state.doc.content.size), y: last.bottom })
    let best = gaps[0] ?? null
    for (const gap of gaps) if (best && Math.abs(gap.y - y) < Math.abs(best.y - y)) best = gap
    return best
  }

  /** A row takes three pictures at most; a picture is never joined to itself. */
  private canJoin(view: EditorView, spot: PictureSpot): boolean {
    if (spot.pos === this.source?.pos) return false
    const target = view.state.doc.nodeAt(spot.pos)
    if (!target) return false
    if (currentGroupDrag()?.pos === spot.pos) return true
    return target.type.name === IMAGE_NODE || pictureList(target).length < PAIR_MAX
  }

  /** The picture a join would sit beside (the picture itself, or one picture in a row). */
  private spotRect(view: EditorView, spot: PictureSpot): DOMRect | null {
    const dom = view.nodeDOM(spot.pos)
    if (!(dom instanceof HTMLElement)) return null
    const item =
      dom.querySelector<HTMLElement>(`[data-group-index="${spot.index}"] img`) ??
      dom.querySelector("img") ??
      dom
    return item.getBoundingClientRect()
  }

  private ensureOverlay(): HTMLElement {
    if (this.overlay) {
      return this.overlay
    }
    this.label = el("span", { className: "onsite-dropzone__label" })
    this.indicator = el("div", { className: "onsite-dropzone", "data-active": true }, [this.label])
    const overlay = el(
      "div",
      { className: "onsite-dropzones", "aria-hidden": "true", hidden: true },
      [this.indicator],
    )
    document.body.append(overlay)
    this.overlay = overlay
    return overlay
  }

  /** One mark where the picture will land: a line in the gap (or at a picture's edge) and its name. */
  private renderOverlay(view: EditorView): void {
    const overlay = this.ensureOverlay()
    const line = this.indicator
    const label = this.label
    if (!line || !label) return
    const zone = this.zone
    if (!zone) {
      overlay.hidden = true
      return
    }
    let box: { left: number; top: number; width: number; height: number } | null = null
    let name: ZoneName
    if (zone.kind === "pair") {
      const rect = this.spotRect(view, zone.spot)
      if (!rect) {
        overlay.hidden = true
        return
      }
      name = "pair"
      box = {
        left: zone.spot.before ? rect.left - 7 : rect.right + 3,
        top: rect.top,
        width: 4,
        height: rect.height,
      }
    } else {
      const rect = view.dom.getBoundingClientRect()
      const rail = this.railWidth(rect)
      const side = rect.width * SIDE_WIDTH
      name = zone.element
      const [left, right] =
        name === "wide-left" || name === "wide-right"
          ? [rect.left - rail, rect.right + rail]
          : name === "side-left"
            ? [rect.left, rect.left + side]
            : name === "side-right"
              ? [rect.right - side, rect.right]
              : [rect.left, rect.right]
      box = { left, top: zone.y - 2, width: right - left, height: 4 }
    }
    line.dataset["zone"] = name
    label.textContent = ZONE_LABELS[name]
    line.style.left = `${box.left}px`
    line.style.top = `${box.top}px`
    line.style.width = `${box.width}px`
    line.style.height = `${box.height}px`
    overlay.hidden = false
  }

  private apply(view: EditorView, source: DragSource, zone: Zone, move: boolean): void {
    const { state } = view
    const tr = state.tr
    const drag = currentGroupDrag()
    const dragged = { ...imageModelFromAttrs(source.node.attrs), preset: "body" as const }
    if (zone.kind === "pair" && drag && move && drag.pos === zone.spot.pos) {
      // Within the same row: only the order changes.
      const row = state.doc.nodeAt(drag.pos)
      if (!row) return
      const images = pictureList(row)
      const [moved] = images.splice(drag.index, 1)
      if (!moved) return
      let to = zone.spot.index + (zone.spot.before ? 0 : 1)
      if (drag.index < to) to -= 1
      images.splice(to, 0, moved)
      tr.setNodeMarkup(drag.pos, undefined, { ...row.attrs, images, raw: null })
      tr.setSelection(NodeSelection.create(tr.doc, drag.pos))
      setPendingActive(to)
    } else if (zone.kind === "pair") {
      if (!joinBeside(tr, zone.spot, [dragged])) return
      if (move && drag) takeFromGroup(tr, tr.mapping.map(drag.pos, -1), drag.index)
      else if (move && source.pos !== null) {
        const from = tr.mapping.map(source.pos, -1)
        const removed = tr.doc.nodeAt(from)
        if (removed && removed.type.name === IMAGE_NODE) {
          tr.delete(from, from + removed.nodeSize)
        }
      }
    } else {
      const insertAt = zone.pos
      if (move && source.pos !== null && !drag) {
        tr.delete(source.pos, source.pos + source.node.nodeSize)
      }
      const pos = tr.mapping.map(insertAt)
      const node =
        source.node.attrs["preset"] === zone.preset
          ? source.node
          : source.node.type.create(
              { ...source.node.attrs, preset: zone.preset },
              null,
              source.node.marks,
            )
      tr.insert(pos, node)
      // A picture dragged out of a row leaves it (a row left with one picture becomes that picture).
      const steps = tr.steps.length
      if (move && drag) takeFromGroup(tr, tr.mapping.map(drag.pos), drag.index)
      const placed = tr.mapping.slice(steps).map(pos)
      tr.setSelection(NodeSelection.create(tr.doc, placed))
    }
    tr.setMeta("uiEvent", "drop")
    view.dispatch(tr.scrollIntoView())
    view.focus()
  }
}

export const dropZonesKey = new PluginKey<null>("onsiteDropZones")

export const DropZones = Extension.create({
  name: "onsiteDropZones",

  addProseMirrorPlugins() {
    const controller = new DropZoneController()
    return [
      new Plugin({
        key: dropZonesKey,
        view(view) {
          controller.attach(view)
          return { destroy: () => controller.detach() }
        },
      }),
    ]
  },
})
