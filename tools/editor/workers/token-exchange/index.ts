import ky from "ky"
import { z } from "zod"
import { tokenExchangeRequestSchema } from "../../src/shared/onsite/auth"

export interface Env {
  readonly GITHUB_CLIENT_ID: string
  readonly GITHUB_CLIENT_SECRET: string
}
type HttpFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
const wireSchema = z.object({
  code: z.string(),
  code_verifier: z.string(),
  redirect_uri: z.string(),
})
const githubTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.literal("bearer"),
})

function allowedOrigin(origin: string): boolean {
  if (origin === "https://hyper-accel.github.io") return true
  return /^http:\/\/(?:localhost|127\.0\.0\.1)(?::[1-9]\d{0,4})?$/.test(origin)
}

/** Fetch is injectable only by the host/tests, never by the request. */
export function createTokenExchange(fetcher: HttpFetch = globalThis.fetch.bind(globalThis)): {
  fetch(request: Request, env: Env): Promise<Response>
} {
  const http = ky.create({
    fetch: fetcher,
    timeout: 15_000,
    retry: 0,
    throwHttpErrors: false,
    redirect: "error",
  })
  return {
    async fetch(request, env) {
      const origin = request.headers.get("Origin") ?? ""
      const headers = new Headers({
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        Vary: "Origin",
        "X-Content-Type-Options": "nosniff",
      })
      const respond = (status: number, error: string): Response =>
        Response.json({ error }, { status, headers })
      if (!allowedOrigin(origin)) return respond(403, "origin_not_allowed")
      headers.set("Access-Control-Allow-Origin", origin)
      if (new URL(request.url).pathname !== "/exchange") return respond(404, "not_found")
      if (request.method === "OPTIONS") {
        const requestedHeaders = request.headers.get("Access-Control-Request-Headers")
        if (
          request.headers.get("Access-Control-Request-Method") !== "POST" ||
          requestedHeaders?.split(",").some((name) => name.trim().toLowerCase() !== "content-type")
        ) {
          return respond(403, "preflight_not_allowed")
        }
        headers.set("Access-Control-Allow-Methods", "POST")
        headers.set("Access-Control-Allow-Headers", "Content-Type")
        return new Response(null, { status: 204, headers })
      }
      if (request.method !== "POST") {
        headers.set("Allow", "POST, OPTIONS")
        return respond(405, "method_not_allowed")
      }
      if (request.headers.get("Content-Type")?.split(";")[0]?.trim() !== "application/json") {
        return respond(415, "json_required")
      }
      try {
        const body: unknown = await request.json()
        const wire = wireSchema.safeParse(body)
        const input = tokenExchangeRequestSchema.safeParse(
          wire.success
            ? {
                code: wire.data.code,
                codeVerifier: wire.data.code_verifier,
                redirectUri: wire.data.redirect_uri,
              }
            : body,
        )
        if (
          !input.success ||
          !/^[A-Za-z0-9._~-]{43,128}$/.test(input.data.codeVerifier) ||
          input.data.redirectUri !== `${origin}/editor-login/`
        ) {
          return respond(400, "invalid_exchange")
        }
        if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET)
          return respond(503, "not_configured")
        const response = await http.post("https://github.com/login/oauth/access_token", {
          headers: { Accept: "application/json" },
          body: new URLSearchParams({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code: input.data.code,
            code_verifier: input.data.codeVerifier,
            redirect_uri: input.data.redirectUri,
          }),
        })
        if (!response.ok) return respond(502, "exchange_failed")
        const token = githubTokenSchema.safeParse(await response.json())
        if (!token.success) return respond(502, "exchange_failed")
        return Response.json(
          {
            accessToken: token.data.access_token,
            expiresIn: token.data.expires_in,
            tokenType: token.data.token_type,
          },
          { headers },
        )
      } catch (error) {
        // Never return/log upstream bodies, exceptions, codes, tokens, or credentials.
        if (error instanceof SyntaxError) return respond(400, "invalid_json")
        return respond(502, "exchange_failed")
      }
    },
  }
}

// Cloudflare Workers module entry point.
export default createTokenExchange()
