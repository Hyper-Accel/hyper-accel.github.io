import { defineConfig } from "vite"

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
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:4174",
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
})
