import { escapeHtml } from "./index"

/** Chroma's class vocabulary and line wrappers, shared with the site's code CSS. */
export function highlightCode(source: string, info: string): string {
  const language = info.trim().split(/\s+/)[0] ?? ""
  const known = /^(?:py|python|ts|typescript|js|javascript|json|bash|sh|go|rust|c|cpp)$/.test(
    language,
  )
  if (!known) {
    return `<pre tabindex="0"><code${language ? ` class="language-${escapeHtml(language)}" data-lang="${escapeHtml(language)}"` : ""}>${escapeHtml(source)}\n</code></pre>\n`
  }
  let expectFunction = false
  const lines = `${source}\n`.match(/[^\n]*\n/g) ?? []
  const body = lines
    .map((line) => {
      const tokens =
        line.match(
          /(?:#[^\n]*|\/\/[^\n]*|\/\*.*?\*\/)|(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|\b\d+(?:\.\d+)?\b|[\p{L}_$][\p{L}\p{N}_$]*|[^\S\n]+|[()[\]{},.:;]+|\n|./gu,
        ) ?? []
      const content = tokens
        .map((token) => {
          let cls = ""
          if (/^(?:#|\/\/|\/\*)/.test(token)) cls = "c1"
          else if (/^['"`]/.test(token)) cls = token[0] === "'" ? "s1" : "s2"
          else if (/^\d/.test(token)) cls = token.includes(".") ? "mf" : "mi"
          else if (expectFunction && /^\w/.test(token)) {
            cls = "nf"
            expectFunction = false
          } else if (/^(?:def|class|fn|func)$/.test(token)) {
            cls = "k"
            expectFunction = true
          } else if (/^(?:const|let|var)$/.test(token))
            cls = /^(?:ts|typescript)$/.test(language) && token === "const" ? "kr" : "kd"
          else if (
            /^(?:return|if|else|for|while|in|import|from|as|async|await|new|throw)$/.test(token)
          )
            cls = "k"
          else if (/^(?:true|false|null|None|True|False)$/.test(token)) cls = "kc"
          else if (/^[=+*/%<>!&|^-]+$/.test(token)) cls = "o"
          else if (/^[()[\]{},.:;]+$/.test(token)) cls = "p"
          else if (token === "\n") cls = ""
          else if (/^\s+$/.test(token)) cls = ""
          else cls = /^(?:py|python)$/.test(language) ? "n" : "nx"
          const escaped = escapeHtml(token)
          return cls ? `<span class="${cls}">${escaped}</span>` : escaped
        })
        .join("")
      return `<span class="line"><span class="cl">${content}</span></span>`
    })
    .join("")
  return `<div class="highlight"><pre tabindex="0" class="chroma"><code class="language-${escapeHtml(language)}" data-lang="${escapeHtml(language)}">${body}</code></pre></div>\n`
}
