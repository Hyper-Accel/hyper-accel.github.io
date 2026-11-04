/** Goldmark's explicit heading ID syntax; whitespace after # is ordinary text. */
export function headingAnchor(source: string): {
  readonly text: string
  readonly id: string | null
} {
  const match = /[ \t]+\{#([^\s{}]+)\}[ \t]*$/.exec(source)
  return match?.[1]
    ? { text: source.slice(0, match.index), id: match[1] }
    : { text: source, id: null }
}

/** Keep resolved references and extension tokens; only the final text suffix is metadata. */
export function headingTokens<
  T extends {
    readonly type?: string | undefined
    readonly text?: string | undefined
    readonly raw?: string | undefined
  },
>(tokens: readonly T[]): T[] {
  const last = tokens.at(-1)
  if (last?.type !== "text" || typeof last.text !== "string") return [...tokens]
  const heading = headingAnchor(last.text)
  if (!heading.id) return [...tokens]
  const content = tokens.slice(0, -1)
  if (heading.text) {
    content.push({ ...last, text: heading.text, raw: headingAnchor(last.raw ?? "").text })
  }
  return content
}
