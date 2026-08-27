import type { Editor } from "@tiptap/core"
import type { AgentContext } from "../shared/agent-contracts"
import { imageAgentContext } from "./agent-context"

type SelectionAttachmentOptions = {
  readonly capture: () => AgentContext | undefined
  readonly onAttach: (context: AgentContext) => void
}

export function setupSelectionAttachment(
  editor: Editor,
  options: SelectionAttachmentOptions,
): void {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "selection-attach"
  button.innerHTML =
    '<i class="ph ph-chat-circle-dots" aria-hidden="true"></i><span>채팅에 첨부</span>'
  button.hidden = true
  document.body.append(button)

  let context: AgentContext | undefined
  const show = (next: AgentContext, right: number, bottom: number): void => {
    context = next
    button.hidden = false
    const left = Math.min(right + 8, window.innerWidth - button.offsetWidth - 12)
    const top = Math.min(bottom + 8, window.innerHeight - button.offsetHeight - 12)
    button.style.left = `${Math.max(12, left)}px`
    button.style.top = `${Math.max(12, top)}px`
  }

  const update = (): void => {
    if (!editor.isFocused) {
      if (context?.kind !== "image") {
        context = undefined
        button.hidden = true
      }
      return
    }
    const next = options.capture()
    if (!next) {
      if (context?.kind !== "image") {
        context = undefined
        button.hidden = true
      }
      return
    }
    const coordinates = editor.view.coordsAtPos(editor.state.selection.to)
    show(next, coordinates.right, coordinates.bottom)
  }

  editor.view.dom.addEventListener("pointerover", (event) => {
    const image = (event.target as Element).closest<HTMLImageElement>("img")
    const imageContext = image ? imageAgentContext(image.getAttribute("src") ?? "") : undefined
    if (image && imageContext) {
      const bounds = image.getBoundingClientRect()
      context = imageContext
      button.hidden = false
      button.style.left = `${Math.max(12, bounds.right - button.offsetWidth - 8)}px`
      button.style.top = `${Math.max(12, bounds.top + 8)}px`
    }
  })
  editor.view.dom.addEventListener("pointerout", (event) => {
    const related = event.relatedTarget
    if (context?.kind === "image" && !(related instanceof Node && button.contains(related))) {
      context = undefined
      button.hidden = true
    }
  })
  editor.view.dom.addEventListener("pointerdown", (event) => {
    if (context?.kind === "image" && !(event.target as Element).closest<HTMLImageElement>("img")) {
      context = undefined
      button.hidden = true
    }
  })
  button.addEventListener("pointerdown", (event) => event.preventDefault())
  button.addEventListener("pointerleave", () => {
    if (context?.kind === "image") {
      context = undefined
      button.hidden = true
    }
  })
  button.addEventListener("click", () => {
    if (context) {
      options.onAttach(context)
      context = undefined
      button.hidden = true
    }
  })
  editor.on("selectionUpdate", update)
  window.addEventListener("resize", () => {
    context = undefined
    button.hidden = true
  })
}
