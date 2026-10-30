import { z } from "zod"

export const authSessionSchema = z.object({
  login: z.string().min(1),
  userId: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  repository: z.object({ owner: z.string().min(1), name: z.string().min(1) }),
  canWrite: z.boolean(),
})
export type AuthSession = z.infer<typeof authSessionSchema>
export const tokenExchangeRequestSchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
  redirectUri: z.url(),
})
export const tokenExchangeResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  tokenType: z.literal("bearer"),
})
export const RELOGIN_EVENT = "onsite:relogin-required"
export interface ReloginEvent {
  readonly type: typeof RELOGIN_EVENT
  readonly reason: "expired" | "unauthorized"
  readonly session: AuthSession | null
}
// Tokens are deliberately absent from AuthSession, draft records and event payloads.
// Implementations must never write tokens to storage, URLs, analytics, or logs.
export interface MemoryTokenProvider {
  getAccessToken(): string | null
  setAccessToken(token: string, expiresAt: number): void
  clearAccessToken(): void
}
export interface AuthController {
  getSession(): AuthSession | null
  login(): Promise<AuthSession>
  logout(): void
  onReloginRequired(listener: (event: ReloginEvent) => void): () => void
}
