import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight"
import c from "highlight.js/lib/languages/c"
import python from "highlight.js/lib/languages/python"
import { createLowlight } from "lowlight"
import "./code-highlight.css"

/** Languages with syntax colours in the editor (the published post colours them with Chroma). */
export const CODE_LANGUAGES: readonly { readonly id: string; readonly label: string }[] = [
  { id: "", label: "일반 텍스트" },
  { id: "c", label: "C" },
  { id: "python", label: "Python" },
]

const lowlight = createLowlight()
lowlight.register({ c, python })
// The names writers also put after the fence.
lowlight.registerAlias({ c: ["h"], python: ["py"] })

/** Code blocks coloured as on the published post; the language is the fence's (```c, ```python). */
export const HighlightedCodeBlock = CodeBlockLowlight.configure({
  lowlight,
  defaultLanguage: null,
})
