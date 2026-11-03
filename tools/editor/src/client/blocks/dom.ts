import type { Editor } from "@tiptap/core"
import type { Attrs, Node as PMNode } from "@tiptap/pm/model"
import { NodeSelection, Selection } from "@tiptap/pm/state"

type ElementAttributes = Readonly<Record<string, string | number | boolean | null | undefined>>
type ElementChild = Node | string | null | undefined | false

export const UI_ATTRIBUTE = "data-onsite-ui"

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: ElementAttributes = {},
  children: readonly ElementChild[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) {
      continue
    }
    if (key === "className") {
      element.className = String(value)
    } else if (key === "textContent") {
      element.textContent = String(value)
    } else {
      element.setAttribute(key, value === true ? "" : String(value))
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue
    }
    element.append(child)
  }
  return element
}

export function uiButton(
  label: string,
  attributes: ElementAttributes,
  onClick: (event: MouseEvent) => void,
): HTMLButtonElement {
  const button = el("button", { type: "button", [UI_ATTRIBUTE]: true, ...attributes }, [label])
  button.addEventListener("click", (event) => {
    event.preventDefault()
    onClick(event)
  })
  return button
}

export function uiInput(
  attributes: ElementAttributes,
  onCommit: (value: string) => void,
  commitOn: "input" | "change" = "input",
): HTMLInputElement {
  const input = el("input", { type: "text", [UI_ATTRIBUTE]: true, ...attributes })
  input.addEventListener(commitOn, () => onCommit(input.value))
  return input
}

export function uiField(label: string, control: HTMLElement): HTMLLabelElement {
  return el("label", { className: "onsite-field", [UI_ATTRIBUTE]: true }, [
    el("span", { className: "onsite-field__label" }, [label]),
    control,
  ])
}

/**
 * Opens below the block, or above it when below would run under the bottom save bar and the
 * article has room above (it never covers the chrome before the article, e.g. language tabs).
 */
export function placePopover(tools: HTMLElement): void {
  const anchor = tools.parentElement?.getBoundingClientRect()
  if (!anchor) return
  tools.dataset["place"] = "below"
  const height = tools.getBoundingClientRect().height + 12
  const top = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--composer-sticky-top"),
  )
  const article = tools.closest(".ProseMirror")?.getBoundingClientRect().top ?? 0
  const ceiling = Math.max((Number.isFinite(top) ? top : 0) + 56, article)
  const floor = window.innerHeight - 96
  // Always next to its block (never a dialog over the text): above when there is room there.
  if (anchor.bottom + height > floor && anchor.top - height >= ceiling)
    tools.dataset["place"] = "above"
  // On a short screen it may still run past the edge: bring it into view, the block beside it.
  // Only for a block the writer is looking at; a block selected off screen (e.g. by a reset that
  // leaves the selection on the last block) must not make the page jump.
  if (anchor.bottom > 0 && anchor.top < window.innerHeight)
    requestAnimationFrame(() => tools.scrollIntoView({ block: "nearest" }))
}

/** Closes a block popover by moving the caret just after the block. */
export function leaveNode(editor: Editor, pos: number | undefined, node: PMNode): void {
  if (pos === undefined) return
  const { state } = editor
  const after = Math.min(pos + node.nodeSize, state.doc.content.size)
  editor.view.dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(after))))
  editor.view.focus()
}

/** Escape on a selected picture block closes its popover. */
export function leaveSelectedNode(editor: Editor, name: string): boolean {
  const { selection } = editor.state
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== name) return false
  leaveNode(editor, selection.from, selection.node)
  return true
}

export function isUiTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${UI_ATTRIBUTE}]`) !== null
}

/**
 * A draggable block (picture, row, slides, compare, video) still lets its controls work: pressing a
 * slider, a caption or label field, a button or a resize grip switches the block's drag off until
 * the press ends, so the browser does not pick the whole block up instead.
 */
export function keepControlsUndraggable(dom: HTMLElement): void {
  dom.addEventListener(
    "pointerdown",
    (event) => {
      if (!isUiTarget(event.target) || !(event.target instanceof Element)) return
      const lifted: HTMLElement[] = []
      for (let node: Element | null = event.target; node; node = node.parentElement) {
        if (node instanceof HTMLElement && node.draggable) {
          node.draggable = false
          lifted.push(node)
        }
        if (node === dom) break
      }
      if (lifted.length === 0) return
      const restore = (): void => {
        for (const node of lifted) node.draggable = true
        document.removeEventListener("pointerup", restore, true)
        document.removeEventListener("pointercancel", restore, true)
      }
      document.addEventListener("pointerup", restore, true)
      document.addEventListener("pointercancel", restore, true)
    },
    true,
  )
}

export function syncValue(control: HTMLInputElement | HTMLSelectElement, value: string): void {
  if (document.activeElement !== control && control.value !== value) {
    control.value = value
  }
}

export function attrString(attrs: Attrs, key: string, fallback = ""): string {
  const value: unknown = attrs[key]
  return typeof value === "string" ? value : fallback
}

export function attrNullableString(attrs: Attrs, key: string): string | null {
  const value: unknown = attrs[key]
  return typeof value === "string" && value !== "" ? value : null
}

export function toggleHidden(element: HTMLElement, hidden: boolean): void {
  if (element.hidden !== hidden) {
    element.hidden = hidden
  }
}
