import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { stream } from "hono/streaming"
import { z } from "zod"
import {
  type AgentContext,
  type AgentEvent,
  type AgentInfo,
  type AgentProvider,
  type AgentSessionHistory,
  type AgentSessionSummary,
  agentEventSchema,
  agentMessageRequestSchema,
  createAgentSessionRequestSchema,
} from "../../shared/agent-contracts"
import { postPathSchema } from "../../shared/contracts"

const sessionIdSchema = z.object({ id: z.string().uuid() })
const sessionListQuerySchema = z.object({ path: postPathSchema })

export interface AgentSessionService {
  listProviders(): Promise<readonly AgentInfo[]>
  create(
    provider: AgentProvider,
    postPath: string,
  ): Promise<{ readonly id: string; readonly provider: AgentProvider }>
  list(postPath: string): Promise<readonly AgentSessionSummary[]>
  history(id: string): Promise<AgentSessionHistory>
  resume(id: string): Promise<{ readonly id: string; readonly provider: AgentProvider }>
  run(
    id: string,
    prompt: string,
    context: AgentContext | undefined,
    emit: (event: AgentEvent) => void | Promise<void>,
  ): Promise<void>
  interrupt(id: string): Promise<void>
  dispose(id: string): Promise<void>
}

export function createAgentRoutes(manager: AgentSessionService): Hono {
  const routes = new Hono()

  routes.get("/providers", async (context) => {
    return context.json({ agents: await manager.listProviders() })
  })

  routes.get("/sessions", zValidator("query", sessionListQuerySchema), async (context) => {
    const sessions = await manager.list(context.req.valid("query").path)
    return context.json({ sessions })
  })

  routes.post("/sessions", zValidator("json", createAgentSessionRequestSchema), async (context) => {
    const request = context.req.valid("json")
    const session = await manager.create(request.provider, request.path)
    return context.json({ sessionId: session.id, provider: session.provider }, 201)
  })

  routes.get("/sessions/:id", zValidator("param", sessionIdSchema), async (context) => {
    return context.json(await manager.history(context.req.valid("param").id))
  })

  routes.post("/sessions/:id/resume", zValidator("param", sessionIdSchema), async (context) => {
    const session = await manager.resume(context.req.valid("param").id)
    return context.json({ sessionId: session.id, provider: session.provider })
  })

  routes.post(
    "/sessions/:id/messages",
    zValidator("param", sessionIdSchema),
    zValidator("json", agentMessageRequestSchema),
    async (context) => {
      const { id } = context.req.valid("param")
      const { prompt, context: selection } = context.req.valid("json")
      context.header("Content-Type", "application/x-ndjson; charset=utf-8")
      context.header("Cache-Control", "no-store")
      return stream(context, async (body) => {
        body.onAbort(() => {
          void manager.interrupt(id)
        })
        await manager.run(id, prompt, selection, async (event) => {
          const validated = agentEventSchema.parse(event)
          await body.write(`${JSON.stringify(validated)}\n`)
        })
      })
    },
  )

  routes.post("/sessions/:id/cancel", zValidator("param", sessionIdSchema), async (context) => {
    await manager.interrupt(context.req.valid("param").id)
    return context.body(null, 204)
  })

  routes.delete("/sessions/:id", zValidator("param", sessionIdSchema), async (context) => {
    await manager.dispose(context.req.valid("param").id)
    return context.body(null, 204)
  })

  return routes
}
