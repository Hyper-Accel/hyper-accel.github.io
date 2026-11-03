import { Extension } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import { ReplaceStep } from "@tiptap/pm/transform"

export const RAW_TRACKED_NODES: readonly string[] = [
  "image",
  "pair",
  "slides",
  "compare",
  "steps",
  "tabs",
  "alert",
  "mathBlock",
  "mathInline",
  "youtube",
]

export const rawTrackingKey = new PluginKey<null>("onsiteRawTracking")

const HISTORY_META_KEYS = ["history$", "history$1", "history$2"] as const

function isHistoryTransaction(tr: Transaction): boolean {
  return HISTORY_META_KEYS.some((key) => tr.getMeta(key) !== undefined)
}

function replacesWholeDocument(tr: Transaction, documentSize: number): boolean {
  return tr.steps.some(
    (step) => step instanceof ReplaceStep && step.from === 0 && step.to === documentSize,
  )
}

function collectRawNodes(doc: PMNode, tracked: ReadonlySet<string>): Set<PMNode> {
  const nodes = new Set<PMNode>()
  doc.descendants((node) => {
    if (tracked.has(node.type.name) && node.attrs["raw"] != null) {
      nodes.add(node)
    }
  })
  return nodes
}

export function createRawTrackingPlugin(): Plugin {
  const tracked = new Set(RAW_TRACKED_NODES)
  return new Plugin({
    key: rawTrackingKey,
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) {
        return null
      }
      const documentSize = oldState.doc.content.size
      if (
        transactions.some(
          (tr) =>
            isHistoryTransaction(tr) ||
            replacesWholeDocument(tr, documentSize) ||
            tr.getMeta(rawTrackingKey) === "skip",
        )
      ) {
        return null
      }
      const untouched = collectRawNodes(oldState.doc, tracked)
      let tr: Transaction | null = null
      newState.doc.descendants((node, pos) => {
        if (!tracked.has(node.type.name) || node.attrs["raw"] == null || untouched.has(node)) {
          return
        }
        tr ??= newState.tr
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, raw: null })
      })
      return tr
    },
  })
}

export const RawTracking = Extension.create({
  name: "onsiteRawTracking",

  addProseMirrorPlugins() {
    return [createRawTrackingPlugin()]
  },
})
