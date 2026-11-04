import { resolveExtensions } from "@tiptap/core"
import { MarkdownManager } from "@tiptap/markdown"
import StarterKit from "@tiptap/starter-kit"
import renderMathInElement from "katex/contrib/auto-render"
import { createBlockExtensions } from "../client/blocks"
import { fixtureBundles } from "../shared/onsite/fixtures"
import * as renderer from "./index"

declare global {
  interface Window {
    onsiteRenderer: typeof renderer
    fixtureBundles: typeof fixtureBundles
    renderFixtureMath: typeof renderMathInElement
    nextRendererSelection?: Promise<unknown>
    initializeEditorMarkdown: () => void
  }
}

window.onsiteRenderer = renderer
window.fixtureBundles = fixtureBundles
window.renderFixtureMath = renderMathInElement
window.initializeEditorMarkdown = () => {
  new MarkdownManager({ extensions: resolveExtensions([StarterKit, ...createBlockExtensions()]) })
}
