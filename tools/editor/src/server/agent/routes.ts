import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { stream } from "hono/streaming"
import { z } from "zod"
import {
  type AgentEvent,
  type AgentInfo,
  type AgentProvider,
  agentEventSchema,
  agentMessageRequestSchema,
  createAgentSessionRequestSchema,
} from "../../shared/agent-contracts"

const sessionIdSchema = z.object({ id: z.string().uuid() })

export interface AgentSessionService {
  listProviders(): Promise<readonly AgentInfo[]>
  create(
    provider: AgentProvider,
    postPath: string,
  ): Promise<{ readonly id: string; readonly provider: AgentProvider }>
  run(id: string, prompt: string, emit: (event: AgentEvent) => void | Promise<void>): Promise<void>
  interrupt(id: string): Promise<void>
  dispose(id: string): Promise<void>
}

export function createAgentRoutes(manager: AgentSessionService): Hono {
  const routes = new Hono()

  routes.get("/providers", async (context) => {
    return context.json({ agents: await manager.listProviders() })
  })

  routes.post("/sessions", zValidator("json", createAgentSessionRequestSchema), async (context) => {
    const request = context.req.valid("json")
    const session = await manager.create(request.provider, request.path)
    return context.json({ sessionId: session.id, provider: session.provider }, 201)
  })

  routes.post(
    "/sessions/:id/messages",
    zValidator("param", sessionIdSchema),
    zValidator("json", agentMessageRequestSchema),
    async (context) => {
      const { id } = context.req.valid("param")
      const { prompt } = context.req.valid("json")
      context.header("Content-Type", "application/x-ndjson; charset=utf-8")
      context.header("Cache-Control", "no-store")
      return stream(context, async (body) => {
        body.onAbort(() => {
          void manager.interrupt(id)
        })
        await manager.run(id, prompt, async (event) => {
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
