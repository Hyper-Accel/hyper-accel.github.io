import "../../../.chroma/wasm_exec.js"
import wasmUrl from "../../../.chroma/chroma.wasm.gz?url"

interface GoRuntime {
  readonly importObject: WebAssembly.Imports
  run(instance: WebAssembly.Instance): Promise<void>
}

declare global {
  var Go: new () => GoRuntime
  var highlightChroma: (language: string, source: string) => string
}

export interface ChromaToken {
  readonly text: string
  readonly class: string
}

export interface ChromaResult {
  readonly tokens: readonly ChromaToken[]
  readonly highlighted: boolean
  readonly error?: string
}

const runtime = new Go()
const response = await fetch(wasmUrl)
if (!response.ok || !response.body) throw new Error(`Chroma load failed: ${response.status}`)
const bytes = await new Response(
  response.body.pipeThrough(new DecompressionStream("gzip")),
).arrayBuffer()
const { instance } = await WebAssembly.instantiate(bytes, runtime.importObject)
void runtime.run(instance)

export function chromaTokens(language: string, source: string): ChromaResult {
  const result: ChromaResult = JSON.parse(highlightChroma(language, source))
  if (result.error) throw new Error(result.error)
  return result
}
