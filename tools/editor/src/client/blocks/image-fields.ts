import type { ImagePreset } from "../../shared/onsite/blocks"
import { IMAGE_PRESET_ORDER, type ImageModel, PRESET_LABELS } from "../shortcode"
import { el, UI_ATTRIBUTE, uiButton } from "./dom"
import type { ResolvedBlockOptions } from "./options"

export interface PresetControlHandle {
  readonly root: HTMLElement
  sync(preset: ImagePreset): void
}

const PRESET_SHORTCUTS: Readonly<Record<ImagePreset, string>> = {
  body: "Alt+ArrowDown",
  wide: "Alt+ArrowUp",
  "side-left": "Alt+ArrowLeft",
  "side-right": "Alt+ArrowRight",
}

export function presetControl(onSelect: (preset: ImagePreset) => void): PresetControlHandle {
  const buttons = new Map<ImagePreset, HTMLButtonElement>()
  const root = el("div", {
    className: "onsite-segmented",
    role: "radiogroup",
    "aria-label": "이미지 배치",
    [UI_ATTRIBUTE]: true,
  })
  for (const preset of IMAGE_PRESET_ORDER) {
    const button = uiButton(
      PRESET_LABELS[preset],
      {
        role: "radio",
        "aria-checked": "false",
        "data-preset": preset,
        "aria-keyshortcuts": PRESET_SHORTCUTS[preset],
        title: `${PRESET_LABELS[preset]} (${PRESET_SHORTCUTS[preset]})`,
      },
      () => onSelect(preset),
    )
    buttons.set(preset, button)
    root.append(button)
  }
  return {
    root,
    sync(preset) {
      for (const [value, button] of buttons) {
        button.setAttribute("aria-checked", String(value === preset))
      }
    },
  }
}

export function imageElement(options: ResolvedBlockOptions, image: ImageModel): HTMLImageElement {
  return el("img", {
    src: image.src ? options.mediaUrl(image.src) : null,
    alt: image.alt,
    loading: "lazy",
    draggable: "false",
  })
}

export function syncImageElement(
  element: HTMLImageElement,
  options: ResolvedBlockOptions,
  image: ImageModel,
): void {
  const url = image.src ? options.mediaUrl(image.src) : ""
  if (url === "") {
    if (element.hasAttribute("src")) {
      element.removeAttribute("src")
    }
  } else if (element.getAttribute("src") !== url) {
    element.src = url
  }
  if (element.alt !== image.alt) {
    element.alt = image.alt
  }
}

export function figureElement(options: ResolvedBlockOptions, image: ImageModel): HTMLElement {
  return el("figure", { className: `figure figure-${image.preset}` }, [
    imageElement(options, image),
    image.title ? el("figcaption", { textContent: image.title }) : null,
  ])
}
