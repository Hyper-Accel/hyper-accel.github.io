import type { Editor } from "@tiptap/core"
import { h } from "./dom"

export function createLinkControls(
  current: () => Editor | undefined,
  close: () => void,
  editing: () => void,
) {
  const input = h("input", {
    type: "url",
    "aria-label": "링크 주소",
    placeholder: "https://",
    required: true,
  })
  const open = h("a", { target: "_blank", rel: "noopener noreferrer" }, "열기")
  const remove = h("button", { type: "button" }, "제거")
  const edit = h("button", { type: "button" }, "수정")
  const address = h("span", { class: "composer-link-address" })
  const summary = h(
    "div",
    { class: "composer-bubble__link", hidden: true },
    address,
    open,
    edit,
    remove,
  )
  const form = h(
    "form",
    { class: "composer-bubble__link", hidden: true },
    input,
    h("button", { type: "submit" }, "적용"),
    h("button", { type: "button", onclick: close }, "취소"),
  )
  const showForm = (): void => {
    editing()
    const href: unknown = current()?.getAttributes("link")["href"]
    input.value = typeof href === "string" ? href : ""
    summary.hidden = true
    form.hidden = false
    input.focus()
  }
  edit.addEventListener("click", showForm)
  remove.addEventListener("click", () => {
    current()?.chain().focus().extendMarkRange("link").unsetLink().run()
    close()
  })
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const editor = current()
    if (!editor) return
    if (!editor.commands.setLink) return
    editor.chain().focus().extendMarkRange("link").setLink({ href: input.value }).run()
    close()
  })
  return {
    form,
    summary,
    showForm,
    hide() {
      form.hidden = true
      summary.hidden = true
    },
    showSummary() {
      const href: unknown = current()?.getAttributes("link")["href"]
      const safe = typeof href === "string" && /^(https?:|mailto:|\/|#)/i.test(href) ? href : ""
      address.textContent = typeof href === "string" ? href : ""
      open.setAttribute("href", safe || "#")
      summary.hidden = false
    },
  }
}
