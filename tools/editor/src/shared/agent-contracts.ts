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

export const agentContextSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    text: z.string().trim().min(1).max(12_000),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("image"),
    path: z
      .string()
      .trim()
      .min(1)
      .max(1_000)
      .refine(
        (path) =>
          !path.startsWith("/") &&
          !/^[a-z][a-z\d+.-]*:/i.test(path) &&
          !path.split(/[\\/]/).includes(".."),
        "이미지는 글 번들 안의 상대 경로여야 합니다.",
      ),
  }),
])

export const agentMessageRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  context: agentContextSchema.optional(),
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

export const agentHistoryEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("user"),
    text: z.string().min(1),
    context: agentContextSchema.optional(),
    at: z.iso.datetime(),
  }),
  z.object({
    type: z.literal("event"),
    event: agentEventSchema,
    at: z.iso.datetime(),
  }),
])

export const agentSessionSummarySchema = z.object({
  id: z.string().uuid(),
  provider: agentProviderSchema,
  path: postPathSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  preview: z.string(),
  entryCount: z.number().int().nonnegative(),
})

export const agentSessionHistorySchema = z.object({
  id: z.string().uuid(),
  provider: agentProviderSchema,
  path: postPathSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  entries: z.array(agentHistoryEntrySchema),
})

export const agentSessionListResponseSchema = z.object({
  sessions: z.array(agentSessionSummarySchema),
})

export type AgentProvider = z.infer<typeof agentProviderSchema>
export type AgentInfo = z.infer<typeof agentInfoSchema>
export type AgentContext = z.infer<typeof agentContextSchema>
export type AgentEvent = z.infer<typeof agentEventSchema>
export type AgentHistoryEntry = z.infer<typeof agentHistoryEntrySchema>
export type AgentSessionSummary = z.infer<typeof agentSessionSummarySchema>
export type AgentSessionHistory = z.infer<typeof agentSessionHistorySchema>
