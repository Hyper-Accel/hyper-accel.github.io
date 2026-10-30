import katex from "katex"
import type { MathfieldElement } from "mathlive"
import { el, UI_ATTRIBUTE } from "./dom"

let loading: Promise<typeof MathfieldElement> | null = null

/**
 * MathLive is large, so it is a separate chunk; the editor preloads it once it is idle so that a
 * new formula takes typing at once (a key pressed before it loads would replace the formula).
 */
export function loadMathfield(): Promise<typeof MathfieldElement> {
  loading ??= import("mathlive").then(({ MathfieldElement }) => {
    // The KaTeX stylesheet, already loaded for the rendered formulas, provides the same fonts.
    MathfieldElement.fontsDirectory = null
    MathfieldElement.soundsDirectory = null
    return MathfieldElement
  })
  return loading
}

/** The LaTeX error KaTeX reports for the source, or null when it renders. */
export function mathError(source: string, displayMode: boolean): string | null {
  if (source.trim() === "") return null
  try {
    katex.renderToString(source, { displayMode, throwOnError: true })
    return null
  } catch (error: unknown) {
    if (!(error instanceof katex.ParseError)) throw error
    return error.message.replace(/^KaTeX parse error: /, "")
  }
}

/**
 * MathLive completes focus a task later and gives up if the page's focus moved meanwhile; a menu
 * button that is closing would do exactly that, so release the current focus first.
 */
function focusField(field: MathfieldElement): void {
  const active = document.activeElement
  if (active instanceof HTMLElement && active !== document.body && !field.contains(active))
    active.blur()
  field.focus()
}

/** Text arrives as if typed on the field, so "^" opens a superscript the way a key press does. */
function typeInto(field: MathfieldElement, text: string): void {
  field.executeCommand(["typedText", text])
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

export type MathLeave = "before" | "after" | null

export interface MathInputOptions {
  readonly display: boolean
  readonly onInput: (source: string) => void
  readonly onLeave: (where: MathLeave) => void
}

/**
 * In-place formula editing: the formula stays rendered while it is edited (MathLive), and a small
 * bar under it switches to the LaTeX source and shows LaTeX errors. The bar floats, so opening the
 * editor never moves the text around it.
 */
export class MathInput {
  readonly element: HTMLElement
  private field: MathfieldElement | null = null
  private readonly fieldSlot: HTMLElement
  private readonly source: HTMLTextAreaElement | HTMLInputElement
  private readonly toggle: HTMLButtonElement
  private readonly error: HTMLElement
  private mode: "visual" | "latex" = "visual"
  private value = ""
  private pending = ""
  private opened = false

  constructor(private readonly options: MathInputOptions) {
    const tag = options.display ? "div" : "span"
    this.fieldSlot = el(tag, { className: "onsite-math__field" })
    this.source = options.display
      ? el("textarea", {
          className: "onsite-math__source",
          rows: "1",
          spellcheck: "false",
          "aria-label": "수식 (LaTeX)",
          placeholder: "\\sum_{i=1}^{n} i",
          hidden: true,
        })
      : el("input", {
          type: "text",
          className: "onsite-math__source onsite-math__source--inline",
          spellcheck: "false",
          "aria-label": "인라인 수식 (LaTeX)",
          hidden: true,
        })
    this.source.addEventListener("input", () => this.input(this.source.value))
    this.source.addEventListener("keydown", (event) => {
      if (!(event instanceof KeyboardEvent)) return
      if (event.key === "Escape" || (event.key === "Enter" && !options.display)) {
        event.preventDefault()
        options.onLeave(null)
      }
    })
    this.toggle = el("button", {
      type: "button",
      className: "onsite-math__toggle",
      textContent: "LaTeX",
      title: "LaTeX 원문으로 고치기",
    })
    this.toggle.addEventListener("mousedown", (event) => event.preventDefault())
    this.toggle.addEventListener("click", () => {
      void this.setMode(this.mode === "visual" ? "latex" : "visual", true)
    })
    this.error = el(tag, { className: "onsite-math__error", role: "alert" })
    const bar = el(tag, { className: "onsite-math__bar", contenteditable: "false" }, [
      this.toggle,
      this.error,
    ])
    this.element = el(
      tag,
      {
        className: "onsite-math__input",
        [UI_ATTRIBUTE]: true,
        contenteditable: "false",
        hidden: true,
      },
      [this.fieldSlot, this.source, bar],
    )
  }

  get isOpen(): boolean {
    return this.opened
  }

  /** Shows the editor in place of the rendered formula; `focus` puts the caret in it. */
  async open(value: string, focus: boolean): Promise<void> {
    if (!this.opened) document.addEventListener("keydown", this.catchKeys, true)
    this.opened = true
    this.element.hidden = false
    this.sync(value)
    await this.setMode(this.mode, focus)
  }

  /** Text typed while the formula was selected but before its field took focus. */
  typeAhead(text: string): void {
    if (this.mode === "latex") {
      this.source.focus()
      this.source.setRangeText(
        text,
        this.source.selectionStart ?? 0,
        this.source.selectionEnd ?? 0,
        "end",
      )
      this.input(this.source.value)
      return
    }
    if (this.field) {
      if (!this.field.hasFocus()) focusField(this.field)
      typeInto(this.field, text)
      return
    }
    this.pending += text
  }

  close(): void {
    document.removeEventListener("keydown", this.catchKeys, true)
    this.pending = ""
    this.opened = false
    this.element.hidden = true
    if (this.field?.hasFocus()) this.field.blur()
  }

  /** The node changed (undo, another view): show its source unless the user is typing in it. */
  sync(value: string): void {
    this.value = value
    this.showError()
    if (this.field && !this.field.hasFocus() && this.field.value !== value) this.field.value = value
    if (document.activeElement !== this.source && this.source.value !== value)
      this.source.value = value
    this.sizeSource()
  }

  destroy(): void {
    document.removeEventListener("keydown", this.catchKeys, true)
    this.field?.remove()
  }

  /**
   * While the formula is open but focus has not reached its field yet (focus moves a moment
   * later), characters typed anywhere on the page still go into the formula instead of being lost.
   */
  private readonly catchKeys = (event: KeyboardEvent): void => {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
    const active = document.activeElement
    if (active && (active === this.field || this.element.contains(active))) return
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
    if (
      active instanceof HTMLElement &&
      active.isContentEditable &&
      !active.matches(".ProseMirror")
    )
      return
    event.preventDefault()
    event.stopPropagation()
    this.typeAhead(event.key)
  }

  private async setMode(mode: "visual" | "latex", focus: boolean): Promise<void> {
    this.mode = mode
    this.toggle.textContent = mode === "visual" ? "LaTeX" : "수식"
    this.toggle.title = mode === "visual" ? "LaTeX 원문으로 고치기" : "수식 입력기로 고치기"
    this.toggle.setAttribute("aria-pressed", String(mode === "latex"))
    this.source.hidden = mode !== "latex"
    this.fieldSlot.hidden = mode !== "visual"
    if (mode === "latex") {
      this.source.value = this.value
      this.sizeSource()
      if (focus) this.source.focus()
      return
    }
    const field = await this.mathfield()
    if (!this.opened || this.mode !== "visual") return
    if (field.value !== this.value) field.value = this.value
    if (!focus) return
    focusField(field)
    // The editor may pull focus back once more (its own deferred focus, a closing menu); a couple
    // of frames later, take it again if so.
    await nextFrame()
    await nextFrame()
    if (!this.opened || this.mode !== "visual") return
    if (document.activeElement !== field) focusField(field)
    if (this.pending) {
      typeInto(field, this.pending)
      this.pending = ""
    }
  }

  private async mathfield(): Promise<MathfieldElement> {
    if (this.field) return this.field
    const Mathfield = await loadMathfield()
    if (this.field) return this.field
    const field = new Mathfield()
    field.defaultMode = this.options.display ? "math" : "inline-math"
    field.smartFence = true
    field.setAttribute("aria-label", this.options.display ? "수식" : "인라인 수식")
    field.addEventListener("input", () => this.input(field.value))
    field.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault()
        this.options.onLeave(null)
      } else if (event.key === "Backspace" && field.value === "" && this.value === "") {
        event.preventDefault()
        this.options.onLeave(null)
      }
    })
    field.addEventListener("move-out", (event) => {
      event.preventDefault()
      const direction = event.detail.direction
      this.options.onLeave(direction === "backward" || direction === "upward" ? "before" : "after")
    })
    this.field = field
    this.fieldSlot.append(field)
    return field
  }

  private input(value: string): void {
    this.value = value
    this.showError()
    this.sizeSource()
    this.options.onInput(value)
  }

  private showError(): void {
    const message = mathError(this.value, this.options.display)
    this.error.textContent = message ? `LaTeX 오류: ${message}` : ""
    this.element.classList.toggle("has-error", message !== null)
  }

  private sizeSource(): void {
    if (this.source instanceof HTMLInputElement)
      this.source.style.width = `${Math.max(8, this.source.value.length + 2)}ch`
  }
}
