/**
 * Toolbar glyphs that show what a tool does rather than naming it: a paperclip for 링크, a speech
 * bubble for 댓글, a highlighted H for 형광펜 and an underlined U for 밑줄. The buttons keep their
 * names (aria-label, tooltip) for screen readers and hover.
 */
const SVG = "http://www.w3.org/2000/svg"

function strokeIcon(...paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("width", "16")
  svg.setAttribute("height", "16")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "2")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  svg.setAttribute("aria-hidden", "true")
  svg.classList.add("composer-icon")
  for (const d of paths) {
    const path = document.createElementNS(SVG, "path")
    path.setAttribute("d", d)
    svg.append(path)
  }
  return svg
}

export function linkIcon(): SVGSVGElement {
  return strokeIcon(
    "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48",
  )
}

export function commentIcon(): SVGSVGElement {
  return strokeIcon("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z")
}

function letter(text: string, className: string): HTMLSpanElement {
  const span = document.createElement("span")
  span.className = className
  span.textContent = text
  span.setAttribute("aria-hidden", "true")
  return span
}

export function highlightGlyph(): HTMLSpanElement {
  return letter("H", "composer-glyph-highlight")
}

export function underlineGlyph(): HTMLSpanElement {
  return letter("U", "composer-glyph-underline")
}

/** 서식 지우기: a T (the formatting) with an eraser over its corner. */
export function clearFormatIcon(): SVGSVGElement {
  const svg = strokeIcon("M3 4h11", "M8.5 4v10")
  const eraser = document.createElementNS(SVG, "g")
  eraser.setAttribute("transform", "translate(9 9) scale(0.62)")
  for (const d of [
    "m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21",
    "M22 21H7",
    "m5 11 9 9",
  ]) {
    const path = document.createElementNS(SVG, "path")
    path.setAttribute("d", d)
    path.setAttribute("vector-effect", "non-scaling-stroke")
    eraser.append(path)
  }
  svg.append(eraser)
  return svg
}
