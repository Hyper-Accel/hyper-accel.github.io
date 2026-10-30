import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { defineConfig } from "vite"
import { parse as parseYaml } from "yaml"

const apiPort = process.env["TECHBLOG_EDITOR_API_PORT"] ?? "4174"
const webPort = Number(process.env["TECHBLOG_EDITOR_WEB_PORT"] ?? "4173")

export default defineConfig(({ mode }) => ({
  plugins:
    mode === "site"
      ? [
          {
            name: "onsite-author-directory",
            async generateBundle() {
              const entries = await readdir(resolve(import.meta.dirname, "../../content/authors"), {
                withFileTypes: true,
              })
              const authors = entries
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name)
                .sort()
              this.emitFile({
                type: "asset",
                fileName: "authors.json",
                source: JSON.stringify(authors),
              })
              // GitHub handles for @mentions in review comments, from each author's profile.
              const people = []
              for (const name of authors) {
                const profile = await readFile(
                  resolve(import.meta.dirname, "../../content/authors", name, "_index.md"),
                  "utf8",
                ).catch(() => "")
                const handle = /^github:\s*["']?https:\/\/github\.com\/([A-Za-z0-9-]+)/m.exec(
                  profile,
                )?.[1]
                const avatar = /^image:\s*["']?(https:\/\/[^"'\s]+)/m.exec(profile)?.[1]
                if (handle) people.push({ name, handle, ...(avatar ? { avatar } : {}) })
              }
              this.emitFile({
                type: "asset",
                fileName: "people.json",
                source: JSON.stringify(people),
              })
              // Tags and series already used on the blog, offered by the metadata dropdowns.
              const postsRoot = resolve(import.meta.dirname, "../../content/posts")
              const tags = new Set<string>()
              const series = new Set<string>()
              const list = (value: unknown): string[] =>
                Array.isArray(value)
                  ? value.filter((item): item is string => typeof item === "string")
                  : typeof value === "string"
                    ? [value]
                    : []
              for (const post of await readdir(postsRoot, { withFileTypes: true })) {
                if (!post.isDirectory()) continue
                for (const file of ["index.md", "index.ko.md"]) {
                  const source = await readFile(resolve(postsRoot, post.name, file), "utf8").catch(
                    () => "",
                  )
                  const front = /^---\n([\s\S]*?)\n---/.exec(source)?.[1]
                  if (!front) continue
                  try {
                    const fields: unknown = parseYaml(front)
                    if (typeof fields !== "object" || fields === null) continue
                    const record = fields as Record<string, unknown>
                    for (const tag of list(record["tags"])) tags.add(tag.trim())
                    for (const name of list(record["series"])) series.add(name.trim())
                  } catch {
                    // A malformed post is reported by the post checks, not by the editor build.
                  }
                }
              }
              tags.delete("")
              series.delete("")
              this.emitFile({
                type: "asset",
                fileName: "taxonomies.json",
                source: JSON.stringify({
                  tags: [...tags].sort((a, b) => a.localeCompare(b)),
                  series: [...series].sort((a, b) => a.localeCompare(b)),
                }),
              })
            },
          },
        ]
      : [],
  root: mode === "site" ? "site" : ".",
  base: mode === "site" ? "/editor/" : "/",
  build: {
    outDir: mode === "site" ? "../dist-site/editor" : "dist",
    emptyOutDir: true,
    manifest: mode === "site" ? "manifest.json" : false,
    rollupOptions: {
      input:
        mode === "site"
          ? {
              app: resolve(import.meta.dirname, "src/client/site.ts"),
              home: resolve(import.meta.dirname, "src/client/home-drafts.ts"),
              preview: resolve(import.meta.dirname, "site/preview.css"),
            }
          : undefined,
      output: {
        manualChunks(moduleId) {
          if (
            moduleId.includes("/node_modules/@tiptap/") ||
            moduleId.includes("/node_modules/prosemirror-")
          ) {
            return "editor"
          }
          if (moduleId.includes("/node_modules/ky/") || moduleId.includes("/node_modules/zod/")) {
            return "transport"
          }
          return undefined
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
    },
  },
  preview: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
  },
}))
