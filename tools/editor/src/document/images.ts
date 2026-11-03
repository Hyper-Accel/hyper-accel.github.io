import { imagePathSchema } from "../shared/onsite/document"

const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g
const HTML_IMAGE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi
const FIGURE_SHORTCODE = /\{\{[<%]\s*figure\b[^}]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi

export function collectImageReferences(markdown: string): string[] {
  const references: string[] = []
  for (const pattern of [MARKDOWN_IMAGE, HTML_IMAGE, FIGURE_SHORTCODE]) {
    for (const match of markdown.matchAll(pattern)) {
      const target = match[1] ?? match[2] ?? match[3]
      if (target) references.push(target)
    }
  }
  return references
}

export function isExternalReference(reference: string): boolean {
  return reference.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(reference)
}

export function bundleImagePath(reference: string): string | null {
  if (isExternalReference(reference)) return null
  const target = reference.split(/[?#]/, 1)[0] ?? ""
  const path = target.startsWith("./") ? target.slice(2) : target
  return imagePathSchema.safeParse(path).success ? path : null
}
