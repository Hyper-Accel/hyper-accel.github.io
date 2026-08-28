type RailController = {
  readonly close: (restoreFocus?: boolean) => void
}

export function setupRail(
  rail: HTMLElement,
  search: HTMLInputElement,
  openButton: HTMLButtonElement,
  closeButton: HTMLButtonElement,
): RailController {
  const narrow = window.matchMedia("(max-width: 980px)")

  const apply = (open: boolean, focusTarget: "search" | "open" | "none"): void => {
    const hidden = narrow.matches && !open
    rail.dataset["open"] = String(open)
    rail.inert = hidden
    openButton.setAttribute("aria-expanded", String(open))
    if (narrow.matches) {
      rail.setAttribute("aria-hidden", String(hidden))
    } else {
      rail.removeAttribute("aria-hidden")
    }
    if (focusTarget === "search") {
      requestAnimationFrame(() => search.focus())
    } else if (focusTarget === "open") {
      openButton.focus()
    }
  }

  const close = (restoreFocus = true): void => {
    apply(false, restoreFocus && narrow.matches ? "open" : "none")
  }

  openButton.addEventListener("click", () => apply(true, "search"))
  closeButton.addEventListener("click", () => close())
  narrow.addEventListener("change", () => apply(false, "none"))
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && narrow.matches && rail.dataset["open"] === "true") {
      event.preventDefault()
      close()
    }
  })
  apply(false, "none")

  return { close }
}
