import { execFile } from "node:child_process"
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { promisify } from "node:util"
import { gzipSync } from "node:zlib"
import type { Plugin } from "vite"

const exec = promisify(execFile)

/** Build the same lexer version as Hugo 0.152.2; generated binaries never enter Git. */
export function chromaAssets(): Plugin {
  return {
    name: "chroma-assets",
    async buildStart() {
      const cwd = import.meta.dirname
      const output = resolve(cwd, "../.chroma")
      await mkdir(output, { recursive: true })
      await exec(
        "go",
        ["build", "-trimpath", "-ldflags=-s -w", "-o", resolve(output, "chroma.wasm"), "."],
        {
          cwd,
          env: { ...process.env, GOOS: "js", GOARCH: "wasm" },
        },
      )
      const { stdout } = await exec("go", ["env", "GOROOT"])
      await copyFile(
        resolve(stdout.trim(), "lib/wasm/wasm_exec.js"),
        resolve(output, "wasm_exec.js"),
      )
      await writeFile(
        resolve(output, "chroma.wasm.gz"),
        gzipSync(await readFile(resolve(output, "chroma.wasm"))),
      )
    },
    async generateBundle() {
      const { stdout: modules } = await exec(
        "go",
        [
          "list",
          "-m",
          "-f",
          "{{.Dir}}",
          "github.com/alecthomas/chroma/v2",
          "github.com/dlclark/regexp2",
        ],
        { cwd: import.meta.dirname },
      )
      const [chroma, regexp] = modules.trim().split("\n")
      if (!chroma || !regexp) throw new Error("Missing Chroma module licenses")
      const licenses = await Promise.all([
        readFile(resolve(chroma, "COPYING"), "utf8"),
        readFile(resolve(regexp, "LICENSE"), "utf8"),
        readFile(resolve(import.meta.dirname, "GO-LICENSE.txt"), "utf8"),
      ])
      this.emitFile({
        type: "asset",
        fileName: "chroma-licenses.txt",
        source: licenses.join("\n\n---\n\n"),
      })
    },
  }
}
