export type PreparedMarkdown = {
  readonly markdown: string
  readonly shortcodes: ReadonlyMap<string, string>
}

export interface MarkdownTransport {
  prepare(body: string): PreparedMarkdown
  restore(editorMarkdown: string, shortcodes: ReadonlyMap<string, string>): string
}

const markdownImagePattern = /(!\[[^\]]*]\()([^\s)]+)([^)]*\))/g
const refShortcodePattern = /\{\{[<%]\s*ref\s+[\s\S]*?[>%]\}\}/g
const refTokenPrefix = "https://hugo.local/__ref/"

export function splitFragment(source: string): {
  readonly path: string
  readonly fragment: string
} {
  const index = source.indexOf("#")
  return index < 0
    ? { path: source, fragment: "" }
    : { path: source.slice(0, index), fragment: source.slice(index) }
}

export function isRelativeMedia(source: string): boolean {
  return !(
    source.startsWith("/") ||
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    source.startsWith("data:") ||
    source.startsWith("blob:")
  )
}

export function mediaPreviewUrl(postPath: string | undefined, source: string): string {
  if (!postPath || !isRelativeMedia(source)) {
    return source
  }
  const { path, fragment } = splitFragment(source)
  const query = new URLSearchParams({ path: postPath, src: path })
  return `/api/media?${query.toString()}${fragment}`
}

export function originalMediaSource(source: string): string {
  if (!source.startsWith("/api/media?")) {
    return source
  }
  const url = new URL(source, "http://editor.local")
  const original = url.searchParams.get("src")
  return original ? `${original}${url.hash}` : source
}

export function createMarkdownTransport(
  toPreview: (source: string) => string,
  toOriginal: (preview: string) => string,
): MarkdownTransport {
  return {
    prepare(body) {
      const shortcodes = new Map<string, string>()
      const protectedRefs = body.replace(refShortcodePattern, (shortcode) => {
        const token = `${refTokenPrefix}${shortcodes.size}`
        shortcodes.set(token, shortcode)
        return token
      })
      const markdown = protectedRefs.replace(
        markdownImagePattern,
        (_match, opening: string, source: string, closing: string) =>
          `${opening}${toPreview(source)}${closing}`,
      )
      return { markdown, shortcodes }
    },
    restore(editorMarkdown, shortcodes) {
      const withImages = editorMarkdown.replace(
        markdownImagePattern,
        (_match, opening: string, source: string, closing: string) =>
          `${opening}${toOriginal(source)}${closing}`,
      )
      let restored = withImages
      for (const [token, shortcode] of shortcodes) {
        restored = restored.replaceAll(token, shortcode)
      }
      return restored
    },
  }
}

export function prepareMarkdown(body: string, postPath: string): PreparedMarkdown {
  return createMarkdownTransport(
    (source) => mediaPreviewUrl(postPath, source),
    originalMediaSource,
  ).prepare(body)
}

export function restoreMarkdown(
  editorMarkdown: string,
  shortcodes: ReadonlyMap<string, string>,
): string {
  return createMarkdownTransport((source) => source, originalMediaSource).restore(
    editorMarkdown,
    shortcodes,
  )
}
