import type { Editor } from "@tiptap/core"
import { TextSelection, type Transaction } from "@tiptap/pm/state"
import { chooseInsertKind } from "../blocks/group-chooser"
import {
  type InsertKind,
  joinBeside,
  PAIR_MAX,
  PAIR_NODE,
  pictureList,
  pictureNodes,
} from "../blocks/image-groups"
import type { ImageBeside } from "../editor"
import type { ImageModel } from "../shortcode"
import { articlePoint, articlePosition } from "./article-document"
import { articleRanges } from "./article-identity"

/**
 * Puts dropped, pasted or picked pictures in, tracking the insertion point through edits made while
 * they upload. Beside a picture they join its row (three at most, as in Naver); several at once ask
 * how they go in (개별 사진 · 나란히 · 슬라이드).
 */
export async function insertArticleImages(
  editor: Editor,
  request: {
    readonly files: readonly File[]
    readonly position: number
    readonly beside?: ImageBeside
    readonly point?: { readonly x: number; readonly y: number }
  },
  upload: (file: File) => Promise<{ src: string; alt: string } | null>,
): Promise<void> {
  let position = request.position
  let spot = request.beside ?? null
  const track = ({ transaction }: { transaction: Transaction }): void => {
    position = transaction.mapping.map(position)
    if (spot) spot = { ...spot, pos: transaction.mapping.map(spot.pos) }
  }
  editor.on("transaction", track)
  try {
    const target = spot ? editor.state.doc.nodeAt(spot.pos) : null
    const joins =
      spot !== null &&
      target !== null &&
      (target.type.name === "image" || target.type.name === PAIR_NODE) &&
      pictureList(target).length + request.files.length <= PAIR_MAX
    const kind: InsertKind =
      joins || request.files.length < 2 || !request.point
        ? "single"
        : await chooseInsertKind(request.point, request.files.length)
    const images: ImageModel[] = []
    for (const file of request.files) {
      const image = await upload(file)
      if (image) images.push({ src: image.src, alt: image.alt, title: null, preset: "body" })
    }
    if (images.length === 0 || editor.isDestroyed) return
    if (joins && spot) {
      const tr = editor.state.tr
      if (joinBeside(tr, spot, images)) {
        editor.view.dispatch(tr.scrollIntoView())
        return
      }
    }
    const nodes = pictureNodes(editor.state.schema, kind, images)
    editor.commands.insertContentAt(
      position,
      nodes.map((node) => node.toJSON()),
      { updateSelection: false },
    )
  } finally {
    editor.off("transaction", track)
  }
}

/** One picture: see insertArticleImages. */
export function insertArticleImage(
  editor: Editor,
  request: { readonly file: File; readonly position: number; readonly beside?: ImageBeside },
  upload: (file: File) => Promise<{ src: string; alt: string } | null>,
): Promise<void> {
  return insertArticleImages(
    editor,
    {
      files: [request.file],
      position: request.position,
      ...(request.beside ? { beside: request.beside } : {}),
    },
    upload,
  )
}

/** Move native nodes without remounting the other language or clearing its history. */
export function reorderArticle(editor: Editor, order: readonly string[]): void {
  const { doc, selection } = editor.state
  const anchor = articlePoint(doc, selection.anchor)
  const focus = articlePoint(doc, selection.head)
  const tr = editor.state.tr
  let position = 0
  for (const id of order) {
    const range = articleRanges(tr.doc).find((entry) => entry.id === id)
    if (!range) continue
    if (range.from !== position) {
      tr.delete(range.from, range.to)
      tr.insert(position, [...range.nodes])
    }
    position += range.to - range.from
  }
  if (!tr.docChanged) return
  if (anchor && focus) {
    tr.setSelection(
      TextSelection.between(
        tr.doc.resolve(articlePosition(tr.doc, anchor, order)),
        tr.doc.resolve(articlePosition(tr.doc, focus, order)),
      ),
    )
  }
  editor.view.dispatch(tr.setMeta("addToHistory", false))
}
