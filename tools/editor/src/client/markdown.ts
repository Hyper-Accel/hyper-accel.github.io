type PreparedMarkdown = {
  readonly markdown: string
  readonly shortcodes: ReadonlyMap<string, string>
}

const markdownImagePattern = /(!\[[^\]]*]\()([^\s)]+)([^)]*\))/g
const refShortcodePattern = /\{\{[<%]\s*ref\s+[\s\S]*?[>%]\}\}/g
const refTokenPrefix = "https://hugo.local/__ref/"

function mediaPreviewUrl(postPath: string, source: string): string {
  const query = new URLSearchParams({ path: postPath, src: source })
  return `/api/media?${query.toString()}`
}

function isRelativeMedia(source: string): boolean {
  return !(
    source.startsWith("/") ||
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    source.startsWith("data:")
  )
}

export function prepareMarkdown(body: string, postPath: string): PreparedMarkdown {
  const shortcodes = new Map<string, string>()
  const protectedRefs = body.replace(refShortcodePattern, (shortcode) => {
    const token = `${refTokenPrefix}${shortcodes.size}`
    shortcodes.set(token, shortcode)
    return token
  })
  const markdown = protectedRefs.replace(
    markdownImagePattern,
    (match, opening: string, source: string, closing: string) => {
      if (!isRelativeMedia(source)) {
        return match
      }
      return `${opening}${mediaPreviewUrl(postPath, source)}${closing}`
    },
  )
  return { markdown, shortcodes }
}

function restoreMediaUrl(source: string): string {
  if (!source.startsWith("/api/media?")) {
    return source
  }
  const url = new URL(source, "http://editor.local")
  return url.searchParams.get("src") ?? source
}

export function restoreMarkdown(
  editorMarkdown: string,
  shortcodes: ReadonlyMap<string, string>,
): string {
  const withImages = editorMarkdown.replace(
    markdownImagePattern,
    (_match, opening: string, source: string, closing: string) =>
      `${opening}${restoreMediaUrl(source)}${closing}`,
  )
  let restored = withImages
  for (const [token, shortcode] of shortcodes) {
    restored = restored.replaceAll(token, shortcode)
  }
  return restored
}
