import { z } from "zod"
import { createTokenExchange } from "../../../workers/token-exchange"
import { tokenExchangeResponseSchema } from "../../shared/onsite/auth"
import type { FakeGitHub, FakeIdentity } from "../../testing/fake-github"
import { createAuthController, type OnsiteAuth } from "./controller"

export class TestStorage implements Storage {
  readonly values = new Map<string, string>()
  get length(): number {
    return this.values.size
  }
  clear(): void {
    this.values.clear()
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.values.delete(key)
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

export function createAuthHarness(
  fake: FakeGitHub,
  flushDrafts = async (): Promise<void> => {},
  now = Date.now,
  sessionStorage = new TestStorage(),
): {
  readonly auth: OnsiteAuth
  readonly sessionStorage: TestStorage
  readonly localStorage: TestStorage
  readonly navigations: string[]
  readonly events: EventTarget
  setUrl(url: string): void
  callback(identity?: FakeIdentity, hash?: boolean): Promise<void>
} {
  let href = "http://localhost:5173/editor-login/"
  const localStorage = new TestStorage()
  const navigations: string[] = []
  const events = new EventTarget()
  const worker = createTokenExchange(async (request, init) => {
    const form = new URLSearchParams(await new Request(request, init).text())
    const response = await fetch(fake.oauthUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.get("code"),
        codeVerifier: form.get("code_verifier"),
        redirectUri: form.get("redirect_uri"),
      }),
    })
    if (!response.ok) return response
    const token = tokenExchangeResponseSchema.parse(await response.json())
    return Response.json({
      access_token: token.accessToken,
      expires_in: token.expiresIn,
      token_type: token.tokenType,
    })
  })
  const auth = createAuthController({
    clientId: "test-client",
    exchangeUrl: "https://exchange.test/exchange",
    repository: { owner: "Hyper-Accel", name: "hyper-accel.github.io" },
    apiOrigin: fake.url,
    now,
    flushDrafts,
    async fetch(input, init) {
      const request = new Request(input, init)
      if (new URL(request.url).origin === "https://exchange.test") {
        request.headers.set("Origin", new URL(href).origin)
        return worker.fetch(request, {
          GITHUB_CLIENT_ID: "test-client",
          GITHUB_CLIENT_SECRET: "test-secret",
        })
      }
      return fetch(request)
    },
    browser: {
      href: () => href,
      navigate: (url) => {
        navigations.push(url)
      },
      replace: (url) => {
        href = url
      },
      sessionStorage,
      localStorage,
      events,
    },
  })
  return {
    auth,
    sessionStorage,
    localStorage,
    navigations,
    events,
    setUrl(url) {
      href = url
    },
    async callback(
      identity = { login: "author", id: 1, permission: "write", expiresAt: now() + 28_800_000 },
      hash = false,
    ) {
      const pending = z
        .object({ verifier: z.string(), state: z.string(), redirectUri: z.string() })
        .parse(JSON.parse(sessionStorage.getItem("onsite:pkce") ?? "null"))
      const code = crypto.randomUUID()
      fake.grantCode(code, pending.verifier, pending.redirectUri, identity)
      href = `${pending.redirectUri}${hash ? "#/callback" : ""}?${new URLSearchParams({ code, state: pending.state })}`
      await auth.handleCallback()
    },
  }
}
