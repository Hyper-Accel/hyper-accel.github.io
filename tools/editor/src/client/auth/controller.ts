import ky from "ky"
import { z } from "zod"
import {
  type AuthController,
  type AuthSession,
  authSessionSchema,
  type MemoryTokenProvider,
  RELOGIN_EVENT,
  type ReloginEvent,
  tokenExchangeResponseSchema,
} from "../../shared/onsite/auth"

/** GitHub returns here after login: the fixed OAuth callback (the editor's login page). */
export const CALLBACK_PATH = "/editor-login/"

const PKCE_KEY = "onsite:pkce"
// The login lasts for one tab: token and session sit in that tab's sessionStorage until they
// expire, the editor signs out, or the tab closes, so the blog and the editor share it.
const SESSION_KEY = "onsite:session"
const storedSessionSchema = z.object({ token: z.string().min(1), session: authSessionSchema })
const RETURNING_KEY = "onsite:returning-editor"
const pendingSchema = z.object({
  state: z.string().min(43),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  redirectUri: z.url(),
  createdAt: z.number(),
})
const userSchema = z.object({ login: z.string().min(1), id: z.number().int().positive() })
const repositorySchema = z.object({
  permissions: z.object({ push: z.boolean() }).optional(),
})
const permissionSchema = z.object({ permission: z.string() })

export class AuthError extends Error {
  constructor(readonly kind: "state" | "exchange" | "api" | "redirecting" | "unauthorized") {
    super(
      {
        state: "로그인 요청이 만료되었거나 일치하지 않습니다. 다시 로그인해 주세요.",
        exchange: "GitHub 로그인에 실패했습니다. 다시 로그인해 주세요.",
        api: "GitHub 계정과 저장소 권한을 확인하지 못했습니다.",
        redirecting: "GitHub 로그인으로 이동합니다.",
        unauthorized: "로그인이 만료되었습니다. 작성 내용은 보관됩니다.",
      }[kind],
    )
  }
}

export interface AuthOptions {
  readonly clientId: string
  readonly exchangeUrl: string
  readonly repository: { readonly owner: string; readonly name: string }
  readonly flushDrafts: () => Promise<void>
  readonly apiOrigin?: string
  readonly fetch?: HttpFetch
  readonly now?: () => number
  readonly browser?: {
    readonly href: () => string
    readonly navigate: (url: string) => void
    readonly replace: (url: string) => void
    readonly sessionStorage: Storage
    readonly localStorage: Storage
    readonly events: EventTarget
  }
}

export interface OnsiteAuth extends AuthController {
  readonly tokens: MemoryTokenProvider
  /** Give this fetch to the GitHub adapter so 401 responses invalidate the session. */
  readonly fetch: HttpFetch
  handleCallback(): Promise<AuthSession | null>
  beginLogin(): Promise<void>
  notifyUnauthorized(): void
  dispose(): void
}

export type HttpFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function isReturningEditor(storage?: Pick<Storage, "getItem">): boolean {
  try {
    return (storage ?? globalThis.localStorage)?.getItem(RETURNING_KEY) === "1"
  } catch (error) {
    if (error instanceof DOMException) return false
    throw error
  }
}

function randomValue(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

export function createAuthController(options: AuthOptions): OnsiteAuth {
  const browser = options.browser ?? {
    href: () => window.location.href,
    navigate: (url: string) => window.location.assign(url),
    replace: (url: string) => window.history.replaceState(null, "", url),
    sessionStorage: window.sessionStorage,
    localStorage: window.localStorage,
    events: window,
  }
  const now = options.now ?? Date.now
  const apiOrigin = new URL(options.apiOrigin ?? "https://api.github.com").origin
  const http = ky.create({
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    retry: 0,
    timeout: 15_000,
    throwHttpErrors: false,
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
  })
  let session: AuthSession | null = null
  let token: string | null = null
  let expiresAt = 0
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let callback: Promise<AuthSession> | null = null
  const listeners = new Set<(event: ReloginEvent) => void>()

  function clear(): void {
    token = null
    expiresAt = 0
    clearTimeout(expiryTimer)
  }
  function remember(value: string, current: AuthSession): void {
    try {
      browser.sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ token: value, session: current }),
      )
    } catch (error) {
      if (!(error instanceof DOMException)) throw error
    }
  }
  function forget(): void {
    try {
      browser.sessionStorage.removeItem(SESSION_KEY)
    } catch (error) {
      if (!(error instanceof DOMException)) throw error
    }
  }
  function invalidate(reason: ReloginEvent["reason"]): void {
    if (!token) return
    const previous = session
    clear()
    forget()
    session = null
    generation += 1
    const event: ReloginEvent = { type: RELOGIN_EVENT, reason, session: previous }
    for (const listener of listeners) listener(event)
    browser.events.dispatchEvent(new CustomEvent(RELOGIN_EVENT, { detail: event }))
  }
  const tokens: MemoryTokenProvider = {
    getAccessToken() {
      if (token && expiresAt <= now()) invalidate("expired")
      return token
    },
    setAccessToken(value, expiry) {
      clear()
      token = value
      expiresAt = expiry
      expiryTimer = setTimeout(() => invalidate("expired"), Math.max(0, expiry - now()))
    },
    clearAccessToken: clear,
  }
  try {
    const raw = browser.sessionStorage.getItem(SESSION_KEY)
    const stored = raw ? storedSessionSchema.safeParse(JSON.parse(raw)) : null
    if (
      stored?.success &&
      stored.data.session.expiresAt > now() &&
      stored.data.session.repository.owner === options.repository.owner &&
      stored.data.session.repository.name === options.repository.name
    ) {
      tokens.setAccessToken(stored.data.token, stored.data.session.expiresAt)
      session = stored.data.session
    } else if (raw) forget()
  } catch (error) {
    if (!(error instanceof DOMException) && !(error instanceof SyntaxError)) throw error
    forget()
  }
  const authenticatedFetch: HttpFetch = async (input, init) => {
    const request = new Request(input, init)
    // A caller can never leak this token to a third-party endpoint.
    if (new URL(request.url).origin !== apiOrigin) throw new AuthError("api")
    const accessToken = tokens.getAccessToken()
    if (!accessToken) throw new AuthError("unauthorized")
    request.headers.set("Authorization", `Bearer ${accessToken}`)
    request.headers.set("Accept", "application/vnd.github+json")
    request.headers.set("X-GitHub-Api-Version", "2022-11-28")
    const response = await http(request)
    if (response.status === 401 && token === accessToken) invalidate("unauthorized")
    return response
  }
  async function api(path: string): Promise<Response> {
    const result = await authenticatedFetch(`${apiOrigin}${path}`)
    if (result.status === 401) throw new AuthError("unauthorized")
    return result
  }
  async function complete(
    code: string,
    verifier: string,
    redirectUri: string,
  ): Promise<AuthSession> {
    const attempt = ++generation
    const response = await http.post(options.exchangeUrl, {
      json: { code, code_verifier: verifier, redirect_uri: redirectUri },
    })
    if (!response.ok) throw new AuthError("exchange")
    const exchanged = tokenExchangeResponseSchema.safeParse(await response.json())
    if (!exchanged.success || generation !== attempt) throw new AuthError("exchange")
    const expiry = now() + exchanged.data.expiresIn * 1000
    tokens.setAccessToken(exchanged.data.accessToken, expiry)
    try {
      const userResponse = await api("/user")
      if (!userResponse.ok) throw new AuthError("api")
      const user = userSchema.parse(await userResponse.json())
      const prefix = `/repos/${encodeURIComponent(options.repository.owner)}/${encodeURIComponent(options.repository.name)}`
      const access = await api(prefix)
      let canWrite = false
      if (access.ok) {
        const repository = repositorySchema.parse(await access.json())
        if (repository.permissions) {
          canWrite = repository.permissions.push
        } else {
          const permission = await api(
            `${prefix}/collaborators/${encodeURIComponent(user.login)}/permission`,
          )
          if (permission.ok) {
            canWrite = ["write", "admin", "maintain"].includes(
              permissionSchema.parse(await permission.json()).permission,
            )
          } else if (permission.status !== 403 && permission.status !== 404) {
            throw new AuthError("api")
          }
        }
      } else if (access.status !== 403 && access.status !== 404) {
        throw new AuthError("api")
      }
      if (generation !== attempt || !tokens.getAccessToken()) throw new AuthError("unauthorized")
      session = {
        login: user.login,
        userId: user.id,
        expiresAt: expiry,
        repository: { ...options.repository },
        canWrite,
      }
      remember(exchanged.data.accessToken, session)
      try {
        browser.localStorage.setItem(RETURNING_KEY, "1")
      } catch (error) {
        if (!(error instanceof DOMException)) throw error
      }
      return { ...session, repository: { ...session.repository } }
    } catch (error) {
      if (generation === attempt) clear()
      throw error
    }
  }
  async function handleCallback(): Promise<AuthSession | null> {
    if (callback) return callback
    const url = new URL(browser.href())
    const hash = new URLSearchParams(url.hash.startsWith("#/callback?") ? url.hash.slice(11) : "")
    const params =
      url.searchParams.has("code") || url.searchParams.has("error") ? url.searchParams : hash
    if (!params.has("code") && !params.has("error")) return null
    const raw = browser.sessionStorage.getItem(PKCE_KEY)
    browser.sessionStorage.removeItem(PKCE_KEY)
    // Remove the one-use code before any network request or rendering.
    browser.replace(`${url.origin}${CALLBACK_PATH}`)
    let pending: z.infer<typeof pendingSchema> | null = null
    try {
      pending = pendingSchema.parse(raw ? JSON.parse(raw) : null)
    } catch (error) {
      if (!(error instanceof z.ZodError) && !(error instanceof SyntaxError)) throw error
    }
    if (
      !pending ||
      params.get("state") !== pending.state ||
      params.has("error") ||
      !params.get("code") ||
      pending.redirectUri !== `${url.origin}${CALLBACK_PATH}` ||
      now() - pending.createdAt > 10 * 60 * 1000 ||
      now() < pending.createdAt
    ) {
      throw new AuthError("state")
    }
    const code = params.get("code")
    if (!code) throw new AuthError("state")
    callback = complete(code, pending.verifier, pending.redirectUri)
    try {
      return await callback
    } finally {
      callback = null
    }
  }
  async function beginLogin(): Promise<void> {
    await options.flushDrafts()
    const redirectUri = `${new URL(browser.href()).origin}${CALLBACK_PATH}`
    const verifier = randomValue()
    const state = randomValue()
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
    browser.sessionStorage.setItem(
      PKCE_KEY,
      JSON.stringify({ state, verifier, redirectUri, createdAt: now() }),
    )
    const authorize = new URL("https://github.com/login/oauth/authorize")
    authorize.search = new URLSearchParams({
      client_id: options.clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: base64url(new Uint8Array(digest)),
      code_challenge_method: "S256",
      scope: "offline_access",
    }).toString()
    browser.navigate(authorize.href)
  }
  return {
    tokens,
    fetch: authenticatedFetch,
    getSession() {
      tokens.getAccessToken()
      return session ? { ...session, repository: { ...session.repository } } : null
    },
    async login() {
      const restored = await handleCallback()
      if (restored) return restored
      await beginLogin()
      // Full-page OAuth navigation cannot return a session in this document.
      throw new AuthError("redirecting")
    },
    beginLogin,
    handleCallback,
    logout() {
      generation += 1
      clear()
      forget()
      session = null
      browser.sessionStorage.removeItem(PKCE_KEY)
    },
    notifyUnauthorized: () => invalidate("unauthorized"),
    onReloginRequired(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      generation += 1
      clear()
      session = null
      listeners.clear()
    },
  }
}
