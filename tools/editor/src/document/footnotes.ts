export interface FootnoteSource {
  readonly raw: string
  readonly label: string
  readonly body: string
}

/** Goldmark definitions continue through indented lines and indented paragraphs. */
export function scanFootnote(source: string): FootnoteSource | null {
  const head = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*([^\n]*)(?:\n|$)/.exec(source)
  if (!head) return null
  let consumed = head[0].length
  let body = head[2] ?? ""
  for (;;) {
    const rest = source.slice(consumed)
    const line = /^(?: {4}|\t)([^\n]*)(?:\n|$)/.exec(rest)
    if (line) {
      body += `\n${line[1] ?? ""}`
      consumed += line[0].length
      continue
    }
    const blank = /^(?:[ \t]*\n)+(?= {4}|\t)/.exec(rest)
    if (!blank) break
    body += "\n".repeat(blank[0].split("\n").length - 1)
    consumed += blank[0].length
  }
  return { raw: source.slice(0, consumed), label: head[1] ?? "", body }
}
