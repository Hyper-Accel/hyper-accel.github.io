type PreparedMarkdown = {
  readonly markdown: string
  readonly shortcodes: ReadonlyMap<string, string>
}

const markdownImagePattern = /(!\[[^\]]*]\()([^\s)]+)([^)]*\))/g
const refShortcodePattern = /\{\{[<%]\s*ref\s+[\s\S]*?[>%]\}\}/g
const refTokenPrefix = "https://hugo.local/__ref/"

export function mediaPreviewUrl(postPath: string | undefined, source: string): string {
  if (!postPath || !isRelativeMedia(source)) {
    return source
  }
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
    (_match, opening: string, source: string, closing: string) => {
      return `${opening}${mediaPreviewUrl(postPath, source)}${closing}`
    },
  )
  return { markdown, shortcodes }
}

export function originalMediaSource(source: string): string {
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
      `${opening}${originalMediaSource(source)}${closing}`,
  )
  let restored = withImages
  for (const [token, shortcode] of shortcodes) {
    restored = restored.replaceAll(token, shortcode)
  }
  return restored
}
