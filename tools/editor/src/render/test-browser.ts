import renderMathInElement from "katex/contrib/auto-render"
import { fixtureBundles } from "../shared/onsite/fixtures"
import * as renderer from "./index"

declare global {
  interface Window {
    onsiteRenderer: typeof renderer
    fixtureBundles: typeof fixtureBundles
    renderFixtureMath: typeof renderMathInElement
    nextRendererSelection?: Promise<unknown>
  }
}

window.onsiteRenderer = renderer
window.fixtureBundles = fixtureBundles
window.renderFixtureMath = renderMathInElement
