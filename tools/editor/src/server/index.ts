import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  createPostRequestSchema,
  postPathSchema,
  registerAuthorRequestSchema,
  savePostRequestSchema,
} from "../shared/contracts"
import { createAgentRoutes } from "./agent/routes"
import { AgentSessionManager } from "./agent/session"
import { listPosts, readPost, resolveMediaPath, saveImage, savePost } from "./content"
import { resolveCoverMediaPath, saveCoverImage } from "./cover"
import { createPost, listAuthors, registerAuthor } from "./create-post"
import { ContentError } from "./errors"

const app = new Hono()
const agentSessions = new AgentSessionManager()

const postQuerySchema = z.object({ path: postPathSchema })
const mediaQuerySchema = z.object({
  path: postPathSchema,
  src: z.string().min(1).max(512),
})

app.get("/api/posts", async (context) => {
  return context.json({ posts: await listPosts() })
})

app.get("/api/authors", async (context) => {
  return context.json({ authors: await listAuthors() })
})

app.post(
  "/api/authors",
  zValidator("json", registerAuthorRequestSchema, (result, context) => {
    if (!result.success) {
      return context.json({ error: "작성자 이름 및 프로필 입력을 확인해 주세요." }, 400)
    }
  }),
  async (context) => {
    return context.json(await registerAuthor(context.req.valid("json")), 201)
  },
)

app.post(
  "/api/posts",
  zValidator("json", createPostRequestSchema, (result, context) => {
    if (!result.success) {
      return context.json({ error: "디렉터리, 제목, 작성자 및 프로필 입력을 확인해 주세요." }, 400)
    }
  }),
  async (context) => {
    return context.json(await createPost(context.req.valid("json")), 201)
  },
)

app.route("/api/agent", createAgentRoutes(agentSessions))

app.get("/api/post", zValidator("query", postQuerySchema), async (context) => {
  const { path } = context.req.valid("query")
  return context.json(await readPost(path))
})

app.put("/api/post", zValidator("json", savePostRequestSchema), async (context) => {
  const request = context.req.valid("json")
  const revision = await savePost(
    request.path,
    request.title,
    request.body,
    request.revision,
    request.cover,
  )
  return context.json({
    revision,
    renderedUrl: `http://127.0.0.1:1413/posts/${request.path.split("/")[2] ?? ""}/`,
  })
})

app.post("/api/cover-image", async (context) => {
  const form = await context.req.formData()
  const path = postPathSchema.parse(form.get("path"))
  const image = form.get("image")
  if (!(image instanceof File)) throw new ContentError("업로드할 이미지가 없습니다.")
  return context.json(await saveCoverImage(path, image))
})

app.get(
  "/api/cover-media",
  zValidator("query", mediaQuerySchema.extend({ src: z.string().min(1).max(2048) })),
  async (context) => {
    const query = context.req.valid("query")
    const absolute = resolveCoverMediaPath(query.path, query.src)
    return new Response(Bun.file(absolute), { headers: { "X-Content-Type-Options": "nosniff" } })
  },
)

app.post("/api/image", async (context) => {
  const form = await context.req.formData()
  const path = postPathSchema.parse(form.get("path"))
  const image = form.get("image")
  if (!(image instanceof File)) {
    throw new ContentError("업로드할 이미지가 없습니다.")
  }
  const saved = await saveImage(path, image)
  const previewUrl = `/api/media?path=${encodeURIComponent(path)}&src=${encodeURIComponent(saved.markdownPath)}`
  return context.json({ markdownPath: saved.markdownPath, previewUrl })
})

app.get("/api/media", zValidator("query", mediaQuerySchema), async (context) => {
  const query = context.req.valid("query")
  const absolute = resolveMediaPath(query.path, query.src)
  const file = Bun.file(absolute)
  if (!(await file.exists())) {
    return context.json({ error: "이미지를 찾을 수 없습니다." }, 404)
  }
  return new Response(file)
})

app.onError((error, context) => {
  if (error instanceof ContentError) {
    return context.json({ error: error.message }, error.status as 400)
  }
  if (error instanceof z.ZodError || (error instanceof HTTPException && error.status === 400)) {
    return context.json({ error: "요청 형식이 올바르지 않습니다." }, 400)
  }
  console.error(error)
  return context.json({ error: "로컬 편집 서버에서 오류가 발생했습니다." }, 500)
})

app.use("*", serveStatic({ root: "./dist" }))
app.get("*", serveStatic({ path: "./dist/index.html" }))

export default {
  port: Number(Bun.env["TECHBLOG_EDITOR_API_PORT"] ?? "4174"),
  hostname: "127.0.0.1",
  idleTimeout: 255,
  fetch: app.fetch,
}

let shuttingDown = false
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    void agentSessions.disposeAll().finally(() => process.exit(0))
  })
}
