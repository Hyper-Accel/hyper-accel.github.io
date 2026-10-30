import type { Node as PMNode } from "@tiptap/pm/model"
import { type AlertType, isAlertType } from "../shortcode"

const ALERT_ICONS: Readonly<Record<AlertType, string>> = {
  NOTE: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  TIP: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.6 10.8c-.6.5-.6 1.2-.6 2.2h-6c0-1 0-1.7-.6-2.2A6 6 0 0 1 12 3z"/>',
  IMPORTANT: '<path d="M4 5h16v11H9l-5 4z"/><path d="M12 8v4M12 14h.01"/>',
  WARNING: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h.01"/>',
  CAUTION: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M12 8v4M12 15h.01"/>',
}

export function alertType(attrs: PMNode["attrs"]): AlertType {
  const value: unknown = attrs["type"]
  return isAlertType(value) ? value : "NOTE"
}

export function alertIcon(type: AlertType): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "2")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("focusable", "false")
  svg.innerHTML = ALERT_ICONS[type]
  svg.dataset["type"] = type
  return svg
}
