import type { NodeViewRenderer } from "@tiptap/core"
import {
  YOUTUBE_ALLOW,
  YOUTUBE_CONTAINER_STYLE,
  YOUTUBE_FRAME_STYLE,
  youtubeId,
  youtubeSource,
} from "../../document/youtube"
import { el, isUiTarget, keepControlsUndraggable, UI_ATTRIBUTE } from "./dom"
import "./youtube.css"

export const youtubeNodeView: NodeViewRenderer = ({ node: initial, editor, getPos }) => {
  let node = initial
  const iframe = el("iframe", {
    title: "YouTube video",
    style: YOUTUBE_FRAME_STYLE,
    allow: YOUTUBE_ALLOW,
    loading: "eager",
    referrerpolicy: "strict-origin-when-cross-origin",
  })
  iframe.style.pointerEvents = "none"
  const dom = el(
    "div",
    { style: YOUTUBE_CONTAINER_STYLE, "data-youtube": true, contenteditable: "false" },
    [iframe],
  )
  const input = el("input", {
    type: "url",
    "aria-label": "YouTube 주소",
    placeholder: "https://youtu.be/…",
    [UI_ATTRIBUTE]: true,
  })
  const apply = el("button", { type: "button", textContent: "적용", [UI_ATTRIBUTE]: true })
  const error = el("span", { role: "alert" })
  const tools = el("div", { className: "onsite-video-tools", hidden: true, [UI_ATTRIBUTE]: true }, [
    input,
    apply,
    error,
  ])
  dom.append(tools)
  keepControlsUndraggable(dom)
  const render = (): void => {
    const value: unknown = node.attrs["videoId"]
    const id = typeof value === "string" ? youtubeId(value) : null
    if (id && iframe.getAttribute("src") !== youtubeSource(id)) iframe.src = youtubeSource(id)
    if (!id) iframe.removeAttribute("src")
  }
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      apply.click()
    } else if (event.key === "Escape") {
      event.preventDefault()
      editor.commands.focus()
    }
  })
  const hasVideo = (): boolean => {
    const value: unknown = node.attrs["videoId"]
    return typeof value === "string" && youtubeId(value) !== null
  }
  apply.addEventListener("click", () => {
    const id = youtubeId(input.value)
    if (!id) {
      error.textContent = "올바른 YouTube 주소를 입력하세요."
      return
    }
    const pos = getPos()
    if (pos === undefined) return
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, videoId: id, raw: null }),
    )
    editor.commands.focus()
  })
  dom.addEventListener("mousedown", (event) => {
    if (isUiTarget(event.target)) return
    const pos = getPos()
    if (pos !== undefined) {
      event.preventDefault()
      editor.chain().focus().setNodeSelection(pos).run()
    }
  })
  render()
  return {
    dom,
    update(next) {
      if (next.type !== node.type) return false
      node = next
      render()
      return true
    },
    selectNode() {
      dom.classList.add("ProseMirror-selectednode")
      tools.hidden = false
      input.value =
        typeof node.attrs["videoId"] === "string" && node.attrs["videoId"]
          ? `https://youtu.be/${node.attrs["videoId"]}`
          : ""
      // A fresh, empty video box: put the caret straight into its address field.
      if (!hasVideo()) queueMicrotask(() => input.focus())
    },
    deselectNode() {
      dom.classList.remove("ProseMirror-selectednode")
      tools.hidden = true
      // Left without an address: drop the empty box so no empty shortcode is ever saved.
      if (!hasVideo())
        setTimeout(() => {
          const pos = getPos()
          const current = pos === undefined ? null : editor.state.doc.nodeAt(pos)
          if (pos === undefined || current?.type !== node.type || hasVideo()) return
          if (
            editor.state.selection.from === pos &&
            editor.state.selection.to === pos + current.nodeSize
          )
            return
          editor.view.dispatch(editor.state.tr.delete(pos, pos + current.nodeSize))
        }, 0)
    },
    stopEvent: (event) => isUiTarget(event.target),
    ignoreMutation: () => true,
  }
}
