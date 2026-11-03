import { afterEach, expect, test } from "bun:test"
import { z } from "zod"
import { RELOGIN_EVENT } from "../../shared/onsite/auth"
import { type FakeGitHub, startFakeGitHub } from "../../testing/fake-github"
import { AuthError, isReturningEditor, type OnsiteAuth } from "./controller"
import { createAuthHarness } from "./testing"

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose()
})
function setup(now = Date.now): {
  fake: FakeGitHub
  harness: ReturnType<typeof createAuthHarness>
} {
  const fake = startFakeGitHub({ now })
  const harness = createAuthHarness(fake, undefined, now)
  cleanup.push(
    () => harness.auth.dispose(),
    () => fake.stop(),
  )
  return { fake, harness }
}

test("uses one-use S256 state and keeps only PKCE temporary data across redirect", async () => {
  const { harness } = setup()
  await harness.auth.beginLogin()
  const redirect = new URL(harness.navigations[0] ?? "")
  const pkce = z
    .object({ state: z.string(), verifier: z.string() })
    .parse(JSON.parse(harness.sessionStorage.getItem("onsite:pkce") ?? "null"))
  expect(redirect.origin).toBe("https://github.com")
  expect(redirect.pathname).toBe("/login/oauth/authorize")
  expect(redirect.searchParams.get("state")).toBe(pkce.state)
  expect(redirect.searchParams.get("code_challenge_method")).toBe("S256")
  expect(redirect.searchParams.get("scope")).toBe("offline_access")
  expect(redirect.searchParams.get("code_challenge")).toBe(
    new Bun.CryptoHasher("sha256").update(pkce.verifier).digest("base64url"),
  )
  await harness.callback()
  expect(harness.auth.getSession()).toMatchObject({ userId: 1, canWrite: true })
  expect(harness.auth.tokens.getAccessToken()).toStartWith("fake-oauth-")
  // The tab keeps the login (token included) in sessionStorage only; localStorage never sees it.
  expect([...harness.sessionStorage.values].map(([key]) => key)).toEqual(["onsite:session"])
  expect([...harness.localStorage.values]).toEqual([["onsite:returning-editor", "1"]])
  expect(isReturningEditor(harness.localStorage)).toBe(true)
})

test("another page in the same tab picks the login up, and logout forgets it", async () => {
  const { fake, harness } = setup()
  await harness.auth.beginLogin()
  await harness.callback()
  const token = harness.auth.tokens.getAccessToken()
  const next = createAuthHarness(fake, undefined, Date.now, harness.sessionStorage)
  cleanup.push(() => next.auth.dispose())
  expect(next.auth.getSession()).toMatchObject({ userId: 1, canWrite: true })
  expect(next.auth.tokens.getAccessToken()).toBe(token)
  next.auth.logout()
  expect(harness.sessionStorage.getItem("onsite:session")).toBeNull()
  const after = createAuthHarness(fake, undefined, Date.now, harness.sessionStorage)
  cleanup.push(() => after.auth.dispose())
  expect(after.auth.getSession()).toBeNull()
})

test("rejects mismatched state before token exchange and consumes the attempt", async () => {
  const { fake, harness } = setup()
  await harness.auth.beginLogin()
  harness.setUrl("http://localhost:5173/editor-login/?code=bad&state=wrong")
  await expect(harness.auth.handleCallback()).rejects.toMatchObject({ kind: "state" })
  expect(fake.state.tokens.size).toBe(2)
  expect(harness.sessionStorage.length).toBe(0)
  expect(harness.auth.tokens.getAccessToken()).toBeNull()
})

test("accepts a hash callback and returns a clear non-writer session", async () => {
  const { harness } = setup()
  await harness.auth.beginLogin()
  await harness.callback(
    { login: "reader", id: 5, permission: "read", expiresAt: Date.now() + 100_000 },
    true,
  )
  expect(harness.auth.getSession()).toMatchObject({ login: "reader", canWrite: false })
})

test("clears token and emits secret-free re-login once on 401", async () => {
  const { fake, harness } = setup()
  await harness.auth.beginLogin()
  await harness.callback()
  const token = harness.auth.tokens.getAccessToken()
  const received: unknown[] = []
  const unsubscribe = harness.auth.onReloginRequired((event) => received.push(event))
  fake.inject({ method: "GET", path: "/user", status: 401 })
  expect((await harness.auth.fetch(`${fake.url}/user`)).status).toBe(401)
  expect(harness.auth.getSession()).toBeNull()
  expect(harness.auth.tokens.getAccessToken()).toBeNull()
  expect(received).toHaveLength(1)
  expect(received[0]).toMatchObject({ type: RELOGIN_EVENT, reason: "unauthorized" })
  expect(JSON.stringify(received)).not.toContain(token ?? "missing")
  unsubscribe()
})

test("expires tokens using epoch milliseconds without waiting in tests", async () => {
  let now = 1_800_000_000_000
  const { harness } = setup(() => now)
  await harness.auth.beginLogin()
  await harness.callback()
  const received: unknown[] = []
  harness.auth.onReloginRequired((event) => received.push(event))
  now += 28_800_001
  expect(harness.auth.getSession()).toBeNull()
  expect(received).toMatchObject([{ reason: "expired" }])
})

test("logout removes credentials and rejects third-party token forwarding", async () => {
  const { harness } = setup()
  await harness.auth.beginLogin()
  await harness.callback()
  await expect(harness.auth.fetch("https://untrusted.test/user")).rejects.toBeInstanceOf(AuthError)
  harness.auth.logout()
  expect(harness.auth.tokens.getAccessToken()).toBeNull()
  expect(harness.auth.getSession()).toBeNull()
})

test("flushes drafts before navigating and aborts login when storage fails", async () => {
  const fake = startFakeGitHub()
  cleanup.push(() => fake.stop())
  let auth: OnsiteAuth | null = null
  let flushed = false
  const harness = createAuthHarness(fake, async () => {
    expect(harness.navigations).toHaveLength(0)
    flushed = true
  })
  auth = harness.auth
  cleanup.push(() => auth?.dispose())
  await auth.beginLogin()
  expect(flushed).toBe(true)
  expect(harness.navigations).toHaveLength(1)
  const failure = createAuthHarness(fake, async () => {
    throw new DOMException("Quota", "QuotaExceededError")
  })
  cleanup.push(() => failure.auth.dispose())
  await expect(failure.auth.beginLogin()).rejects.toBeInstanceOf(DOMException)
  expect(failure.navigations).toHaveLength(0)
})
