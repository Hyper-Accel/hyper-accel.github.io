import type { Attrs } from "@tiptap/pm/model"
import {
  type ImageModel,
  isImagePreset,
  type ShortcodeDelimiter,
  type ShortcodeParam,
} from "../shortcode"

export const EMPTY_IMAGE: ImageModel = { src: "", alt: "", title: null, preset: "body" }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function toImageModel(value: unknown): ImageModel {
  if (!isRecord(value)) {
    return EMPTY_IMAGE
  }
  return {
    src: typeof value["src"] === "string" ? value["src"] : "",
    alt: typeof value["alt"] === "string" ? value["alt"] : "",
    title: typeof value["title"] === "string" && value["title"] !== "" ? value["title"] : null,
    preset: isImagePreset(value["preset"]) ? value["preset"] : "body",
  }
}

/** A picture group's images (row or slides), each shown at body width inside the group. */
export function toImageList(value: unknown): ImageModel[] {
  const list = Array.isArray(value) ? value : []
  return list.map((entry) => ({ ...toImageModel(entry), preset: "body" as const }))
}

export function toParams(value: unknown): ShortcodeParam[] {
  if (!Array.isArray(value)) {
    return []
  }
  const params: ShortcodeParam[] = []
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry["value"] !== "string") {
      continue
    }
    const name = entry["name"]
    const quote = entry["quote"]
    params.push({
      name: typeof name === "string" ? name : null,
      value: entry["value"],
      quote: quote === '"' || quote === "'" || quote === "`" ? quote : null,
    })
  }
  return params
}

export function toDelimiter(value: unknown): ShortcodeDelimiter {
  return value === "%" ? "%" : "<"
}

export function attrJson(attrs: Attrs, key: string): unknown {
  return attrs[key]
}

export function parseJsonAttribute(element: Element, name: string): unknown {
  const value = element.getAttribute(name)
  if (value === null) {
    return undefined
  }
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}
