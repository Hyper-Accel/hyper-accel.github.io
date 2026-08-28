import { defineConfig } from "vite"

const apiPort = process.env["TECHBLOG_EDITOR_API_PORT"] ?? "4174"
const webPort = Number(process.env["TECHBLOG_EDITOR_WEB_PORT"] ?? "4173")

export default defineConfig({
  build: {
    rollupOptions: {
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
})
