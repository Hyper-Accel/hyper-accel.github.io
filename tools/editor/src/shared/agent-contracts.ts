import { z } from "zod"
import { postPathSchema } from "./contracts"

export const agentProviderSchema = z.enum(["codex", "claude", "omo"])

export const agentInfoSchema = z.object({
  id: agentProviderSchema,
  label: z.string().min(1),
  available: z.boolean(),
  version: z.string().nullable(),
})

export const agentListResponseSchema = z.object({
  agents: z.array(agentInfoSchema),
})

export const createAgentSessionRequestSchema = z.object({
  provider: agentProviderSchema,
  path: postPathSchema,
})

export const createAgentSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  provider: agentProviderSchema,
})

export const agentMessageRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
})

export const agentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), text: z.string() }),
  z.object({ type: z.literal("session"), sessionId: z.string() }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("message"), text: z.string() }),
  z.object({
    type: z.literal("tool"),
    label: z.string(),
    status: z.enum(["running", "completed", "failed"]),
  }),
  z.object({
    type: z.literal("proposal"),
    title: z.string(),
    body: z.string(),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("done") }),
])

export type AgentProvider = z.infer<typeof agentProviderSchema>
export type AgentInfo = z.infer<typeof agentInfoSchema>
export type AgentEvent = z.infer<typeof agentEventSchema>
