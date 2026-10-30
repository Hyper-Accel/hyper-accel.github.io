import type { Node as PMNode, Schema } from "@tiptap/pm/model"
import { NodeSelection, type Transaction } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { SHORTCODES } from "../../shared/onsite/blocks"
import type { ImageModel } from "../shortcode"
import { attrJson, toImageList } from "./attrs"
import { IMAGE_NODE, imageModelFromAttrs } from "./image"

/** Naver's "나란히 놓기": two or three pictures in one row. */
export const PAIR_NODE = "pair"
/** Naver's "슬라이드": pictures shown one at a time. */
export const SLIDES_NODE = "slides"
export const PAIR_MAX = SHORTCODES.pair.maxImages
export const SLIDES_MAX = SHORTCODES.slides.maxImages

export type GroupKind = typeof PAIR_NODE | typeof SLIDES_NODE

export function isGroupNode(node: PMNode | null | undefined): boolean {
  return node?.type.name === PAIR_NODE || node?.type.name === SLIDES_NODE
}

/** The pictures of a single picture or of a group, each at body width. */
export function pictureList(node: PMNode): ImageModel[] {
  if (node.type.name === IMAGE_NODE) return [{ ...imageModelFromAttrs(node.attrs), preset: "body" }]
  return toImageList(attrJson(node.attrs, "images"))
}

/**
 * The node for a set of pictures: one picture stands alone (a group of one is never kept), more
 * become a row or slides.
 */
export function pictureNode(
  schema: Schema,
  kind: GroupKind,
  images: readonly ImageModel[],
): PMNode | null {
  if (images.length === 0) return null
  if (images.length === 1)
    return schema.nodes[IMAGE_NODE]?.create({ ...images[0], raw: null }) ?? null
  return schema.nodes[kind]?.create({ images: [...images] }) ?? null
}

/**
 * The picture a group view should show as active once it is (re)selected, e.g. the one just joined.
 * Read once by the next group view selected.
 */
let pendingActive: number | null = null
export function setPendingActive(index: number | null): void {
  pendingActive = index
}
export function takePendingActive(): number | null {
  const index = pendingActive
  pendingActive = null
  return index
}

/** Where a dropped or pasted picture would go: beside picture `index` of the node at `pos`. */
export interface PictureSpot {
  readonly pos: number
  readonly index: number
  readonly before: boolean
}

/**
 * Adds pictures beside a picture: a lone picture becomes a row, a row grows (Naver keeps at most
 * three). Returns false when they do not fit, so the caller inserts them on their own instead.
 */
export function joinBeside(
  tr: Transaction,
  spot: PictureSpot,
  added: readonly ImageModel[],
): boolean {
  const target = tr.doc.nodeAt(spot.pos)
  if (!target || (target.type.name !== IMAGE_NODE && target.type.name !== PAIR_NODE)) return false
  const images = pictureList(target)
  if (images.length + added.length > PAIR_MAX) return false
  const at = Math.min(images.length, spot.index + (spot.before ? 0 : 1))
  images.splice(at, 0, ...added.map((image) => ({ ...image, preset: "body" as const })))
  const row = pictureNode(tr.doc.type.schema, PAIR_NODE, images)
  if (!row) return false
  tr.replaceWith(spot.pos, spot.pos + target.nodeSize, row)
  tr.setSelection(NodeSelection.create(tr.doc, spot.pos))
  setPendingActive(at)
  return true
}

/** Takes picture `index` out of the group at `pos`; a group left with one picture becomes that picture. */
export function takeFromGroup(tr: Transaction, pos: number, index: number): ImageModel | null {
  const group = tr.doc.nodeAt(pos)
  if (!group || !isGroupNode(group)) return null
  const images = pictureList(group)
  const [taken] = images.splice(index, 1)
  if (!taken) return null
  const rest = pictureNode(tr.doc.type.schema, group.type.name as GroupKind, images)
  if (rest) tr.replaceWith(pos, pos + group.nodeSize, rest)
  else tr.delete(pos, pos + group.nodeSize)
  return taken
}

/** Splits pictures into rows of at most three, as evenly as possible (5 → 3 + 2, 4 → 2 + 2). */
export function rowsOf<T>(items: readonly T[]): T[][] {
  const count = Math.ceil(items.length / PAIR_MAX)
  const rows: T[][] = []
  let start = 0
  for (let row = 0; row < count; row++) {
    const size = Math.ceil((items.length - start) / (count - row))
    rows.push(items.slice(start, start + size))
    start += size
  }
  return rows
}

/** Splits pictures into slide groups of at most ten. */
export function slidesOf<T>(items: readonly T[]): T[][] {
  const groups: T[][] = []
  for (let start = 0; start < items.length; start += SLIDES_MAX)
    groups.push(items.slice(start, start + SLIDES_MAX))
  return groups
}

/** The share of a picture's width, at each side, where a drop joins it (Naver's green edge line). */
const EDGE = 0.3

/**
 * The picture (or picture in a row) under the pointer and the side it is on. With `edgesOnly`, only
 * the outer parts of a picture count; its middle is an ordinary drop.
 */
export function pictureSpotAt(
  view: EditorView,
  x: number,
  y: number,
  edgesOnly: boolean,
): PictureSpot | null {
  const found = view.posAtCoords({ left: x, top: y })
  if (!found || found.inside < 0) return null
  const node = view.state.doc.nodeAt(found.inside)
  if (!node || (node.type.name !== IMAGE_NODE && node.type.name !== PAIR_NODE)) return null
  const dom = view.nodeDOM(found.inside)
  if (!(dom instanceof HTMLElement)) return null
  const items =
    node.type.name === PAIR_NODE
      ? [...dom.querySelectorAll<HTMLElement>("[data-group-index]")]
      : [dom.querySelector<HTMLElement>("img") ?? dom]
  for (const [index, item] of items.entries()) {
    const rect = item.getBoundingClientRect()
    if (x < rect.left || x > rect.right) continue
    const share = (x - rect.left) / Math.max(1, rect.width)
    if (edgesOnly && share > EDGE && share < 1 - EDGE) return null
    return { pos: found.inside, index, before: share < 0.5 }
  }
  return null
}

/** Draws Naver's edge line where a dragged picture would join, or clears it. */
export function markPictureSpot(view: EditorView, spot: PictureSpot | null): void {
  for (const marked of view.dom.querySelectorAll("[data-drop-beside]"))
    marked.removeAttribute("data-drop-beside")
  const dom = spot ? view.nodeDOM(spot.pos) : null
  if (!spot || !(dom instanceof HTMLElement)) return
  const item = dom.querySelector<HTMLElement>(`[data-group-index="${spot.index}"]`) ?? dom
  item.setAttribute("data-drop-beside", spot.before ? "left" : "right")
}

/** A picture dragged out of a group: where it came from, so the drop can take it out. */
let groupDrag: { readonly pos: number; readonly index: number } | null = null
export function setGroupDrag(drag: { readonly pos: number; readonly index: number } | null): void {
  groupDrag = drag
}
export function currentGroupDrag(): { readonly pos: number; readonly index: number } | null {
  return groupDrag
}

/** How several pictures go in at once (Naver's 사진 첨부 방식). */
export type InsertKind = "single" | typeof PAIR_NODE | typeof SLIDES_NODE

/** The nodes for pictures inserted together: one each, rows of up to three, or slides. */
export function pictureNodes(
  schema: Schema,
  kind: InsertKind,
  images: readonly ImageModel[],
): PMNode[] {
  const groups =
    kind === "single"
      ? images.map((image) => [image])
      : kind === PAIR_NODE
        ? rowsOf(images)
        : slidesOf(images)
  return groups.flatMap((group) => {
    const node = pictureNode(schema, kind === "single" ? PAIR_NODE : kind, group)
    return node ? [node] : []
  })
}

/**
 * The browser drags a see-through copy of the whole picture, which covers the post. Like Naver, a
 * small thumbnail follows the pointer instead (the drop mark shows where it lands).
 */
export function setPictureDragImage(event: DragEvent, image: HTMLImageElement | null): void {
  if (!event.dataTransfer || !image?.complete || !image.naturalWidth) return
  const width = 96
  const height = Math.max(24, Math.round((width * image.naturalHeight) / image.naturalWidth))
  const thumb = document.createElement("canvas")
  thumb.width = width
  thumb.height = Math.min(height, 96)
  const context = thumb.getContext("2d")
  if (!context) return
  context.drawImage(image, 0, 0, thumb.width, thumb.height)
  thumb.className = "onsite-drag-thumb"
  document.body.append(thumb)
  event.dataTransfer.setDragImage(thumb, thumb.width / 2, thumb.height / 2)
  requestAnimationFrame(() => thumb.remove())
}
