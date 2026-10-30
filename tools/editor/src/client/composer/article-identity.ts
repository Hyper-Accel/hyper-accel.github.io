import { Extension } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { newBlockId } from "../../document/codec"
import { rawTrackingKey } from "../blocks/raw-tracking"

export const ARTICLE_ID = "articleId"

export function articleId(node: PMNode): string | null {
  const value: unknown = node.attrs[ARTICLE_ID]
  return typeof value === "string" && value.length > 0 ? value : null
}

function descendantId(node: PMNode): string | null {
  let found: string | null = null
  node.descendants((child) => {
    found ??= articleId(child)
    return found === null
  })
  return found
}

/**
 * IDs are ordinary node attributes, so native split/join/delete history restores them.
 * No wrapper nodes, isolating boundaries, or custom Enter/Backspace commands are involved.
 * A source block may own several adjacent paragraphs; the codec already supports that.
 */
export function articleIdentity(firstId: () => string): Extension {
  return Extension.create({
    name: "articleIdentity",
    addGlobalAttributes() {
      return [
        {
          types: this.extensions
            .filter((extension) => extension.type === "node" && extension.name !== "text")
            .map((extension) => extension.name),
          attributes: {
            [ARTICLE_ID]: { default: null, rendered: false, keepOnSplit: true },
          },
        },
      ]
    },
    addProseMirrorPlugins() {
      return [createArticleIdentityPlugin(firstId)]
    },
  })
}

export function createArticleIdentityPlugin(firstId: () => string): Plugin {
  return new Plugin({
    key: new PluginKey("articleIdentity"),
    appendTransaction(transactions, _oldState, state) {
      if (!transactions.some((tr) => tr.docChanged)) return null
      const tr = state.tr
      const seen = new Set<string>()
      let previous: string | null = null
      state.doc.forEach((node, position) => {
        if (node.type.name === "footnoteSection") {
          node.forEach((definition, offset) => {
            if (!articleId(definition))
              tr.setNodeMarkup(position + 1 + offset, undefined, {
                ...definition.attrs,
                [ARTICLE_ID]: previous ?? firstId(),
              })
          })
          return
        }
        let id = articleId(node) ?? descendantId(node) ?? previous ?? firstId()
        // Pasting a copy into a different position must not regroup unrelated prose
        // under an earlier ID when the document is serialized.
        if (seen.has(id) && id !== previous) id = newBlockId()
        if (articleId(node) !== id) {
          tr.setNodeMarkup(position, undefined, { ...node.attrs, [ARTICLE_ID]: id })
        }
        seen.add(id)
        previous = id
      })
      return tr.docChanged ? tr.setMeta(rawTrackingKey, "skip") : null
    },
  })
}

export interface ArticleRange {
  readonly id: string
  readonly from: number
  readonly to: number
  readonly nodes: readonly PMNode[]
}

export function articleRanges(doc: PMNode): ArticleRange[] {
  const ranges: ArticleRange[] = []
  const append = (node: PMNode, position: number): void => {
    const id = articleId(node)
    if (!id) return
    const last = ranges.at(-1)
    if (last?.id === id) {
      ranges[ranges.length - 1] = {
        ...last,
        to: position + node.nodeSize,
        nodes: [...last.nodes, node],
      }
    } else {
      ranges.push({ id, from: position, to: position + node.nodeSize, nodes: [node] })
    }
  }
  doc.forEach((node, position) => {
    if (node.type.name === "footnoteSection")
      node.forEach((definition, offset) => {
        append(definition, position + 1 + offset)
      })
    else append(node, position)
  })
  return ranges
}

/** Retain empty/deleted identities in their original neighborhood, not as visible nodes. */
export function articleOrder(current: readonly string[], visible: readonly string[]): string[] {
  const result = [...new Set(visible)]
  let previous: string | null = null
  for (const id of current) {
    if (!result.includes(id)) {
      const index = previous === null ? 0 : result.indexOf(previous) + 1
      result.splice(index, 0, id)
    }
    previous = id
  }
  return result
}
