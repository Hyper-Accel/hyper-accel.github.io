import "../../../../../../assets/css/core/theme-vars.css"
import { parseForEditing, type UnpairedBundle } from "../../../document/repair"
import type { PostBundle } from "../../../shared/onsite/document"
import { fixtureBundles } from "../../../shared/onsite/fixtures"
import { createBlockExtensions } from "../../blocks"
import { EditorRegistry, SiteToolbox } from "../../site/toolbox"
import { type ComposerChange, type ComposerHandle, mountComposer } from "../index"
import type { BlockExtensionContext } from "../types"

declare global {
  interface Window {
    __composer: ComposerHandle
    __changes: ComposerChange[]
    __review: PostBundle | null
    __comment: string | null
  }
}

const params = new URLSearchParams(window.location.search)
const slug = params.get("bundle")
const bundle = slug ? (fixtureBundles.find((candidate) => candidate.slug === slug) ?? null) : null
document.documentElement.dataset["theme"] = params.get("theme") ?? "dark"
const title = document.querySelector("#harness-title")
if (title) title.textContent = bundle ? `글 편집: ${bundle.slug}` : "새 글"
const root = document.querySelector<HTMLElement>("#app")
if (!root) throw new Error("Harness requires #app")

async function loadUnpaired(repairSlug: string): Promise<UnpairedBundle> {
  const fetchText = async (name: string): Promise<string | null> => {
    const response = await fetch(`/repair/${repairSlug}/${name}`)
    return response.ok ? response.text() : null
  }
  const ko = (await fetchText("index.md")) ?? (await fetchText("index.ko.md")) ?? ""
  const en = (await fetchText("index.en.md")) ?? ""
  const parsed = await parseForEditing({ slug: repairSlug, ko, en, images: [], headSha: null })
  if (parsed.kind !== "repair") throw new Error(`Expected a repairable post, got ${parsed.kind}`)
  return parsed.unpaired
}

const repairSlug = params.get("repair")
const unpaired = repairSlug ? await loadUnpaired(repairSlug) : null
if (title && repairSlug) title.textContent = `짝 맞춤: ${repairSlug}`

window.__changes = []
window.__review = null
window.__comment = null
const registry = new EditorRegistry()
let blockContext: BlockExtensionContext | null = null
root.classList.add("site-editor")
const toolbox = new SiteToolbox({ registry, context: () => blockContext, panels: [] })
root.append(toolbox.element)
window.__composer = mountComposer(root, {
  bundle,
  unpaired,
  authors: ["Donghyeon Choi", "Jaewon Lim", "Fixture Author"],
  blockExtensions: (context) => {
    blockContext = context
    return [
      registry.extension,
      ...createBlockExtensions({ ...context, slashMenu: false, dropZones: false }),
    ]
  },
  onChange: (change) => {
    window.__changes.push(change)
  },
  onRequestReview: (reviewed) => {
    window.__review = reviewed
  },
  onComment: (editor) => {
    window.__comment = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
    )
  },
  resolveImage: (path) => (bundle ? `/fixtures/${bundle.slug}/${path}` : undefined),
})
