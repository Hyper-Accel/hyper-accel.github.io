import { expect, test } from "bun:test"
import { createTokenExchange } from "./index"

const env = { GITHUB_CLIENT_ID: "client", GITHUB_CLIENT_SECRET: "server-secret" } as const
const origin = "https://hyper-accel.github.io"
const body = {
  code: "one-use-code",
  code_verifier: "v".repeat(43),
  redirect_uri: `${origin}/editor-login/`,
}
function request(input: unknown = body, headers: Record<string, string> = {}): Request {
  return new Request("https://exchange.test/exchange", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(input),
  })
}

test("exchanges PKCE with server credentials and returns only the memory-token contract", async () => {
  const requests: Request[] = []
  const worker = createTokenExchange(async (input, init) => {
    const outgoing = new Request(input, init)
    requests.push(outgoing)
    expect(outgoing.url).toBe("https://github.com/login/oauth/access_token")
    expect(outgoing.headers.get("Accept")).toBe("application/json")
    const form = new URLSearchParams(await outgoing.text())
    expect(Object.fromEntries(form)).toEqual({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      ...body,
    })
    return Response.json({
      access_token: "only-in-memory",
      token_type: "bearer",
      expires_in: 28800,
      refresh_token: "never-return",
    })
  })
  const response = await worker.fetch(request(), env)
  expect(response.status).toBe(200)
  expect(response.headers.get("Cache-Control")).toBe("no-store")
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin)
  expect(await response.json()).toEqual({
    accessToken: "only-in-memory",
    expiresIn: 28800,
    tokenType: "bearer",
  })
  expect(requests).toHaveLength(1)
})

test("rejects untrusted origins redirect substitution invalid verifier and methods before fetch", async () => {
  let calls = 0
  const worker = createTokenExchange(async () => {
    calls += 1
    return new Response(null)
  })
  for (const bad of [
    "null",
    "https://evil.test",
    "https://hyper-accel.github.io.evil.test",
    "http://localhost.evil.test:5173",
    "https://localhost:5173",
    "",
  ]) {
    const response = await worker.fetch(request(body, { Origin: bad }), env)
    expect(response.status).toBe(403)
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  }
  for (const redirect_uri of [
    `${origin}/other`,
    `${origin}/editor-login/?next=evil`,
    `${origin}/editor/`,
    "https://evil.test/editor-login/",
    `${origin}/editor-login/#/callback`,
  ]) {
    expect((await worker.fetch(request({ ...body, redirect_uri }), env)).status).toBe(400)
  }
  for (const code_verifier of ["short", "a".repeat(129), "!".repeat(43)]) {
    expect((await worker.fetch(request({ ...body, code_verifier }), env)).status).toBe(400)
  }
  expect(
    (
      await worker.fetch(
        new Request("https://exchange.test/exchange", { headers: { Origin: origin } }),
        env,
      )
    ).status,
  ).toBe(405)
  expect((await worker.fetch(request(body, { "Content-Type": "text/plain" }), env)).status).toBe(
    415,
  )
  expect(calls).toBe(0)
})

test("accepts exact localhost callback and camelCase contract with restricted preflight", async () => {
  const worker = createTokenExchange(async () =>
    Response.json({ access_token: "dev", token_type: "bearer", expires_in: 28800 }),
  )
  const local = "http://localhost:5173"
  expect(
    (
      await worker.fetch(
        request(
          {
            code: body.code,
            codeVerifier: body.code_verifier,
            redirectUri: `${local}/editor-login/`,
          },
          { Origin: local },
        ),
        env,
      )
    ).status,
  ).toBe(200)
  const response = await worker.fetch(
    new Request("https://exchange.test/exchange", {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    }),
    env,
  )
  expect(response.status).toBe(204)
  expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST")
  expect(response.headers.has("Access-Control-Allow-Credentials")).toBe(false)
})

test("does not echo secrets upstream failures or refresh credentials", async () => {
  for (const upstream of [
    Response.json({ error: env.GITHUB_CLIENT_SECRET }, { status: 401 }),
    Response.json({ error: "bad_verification_code", refresh_token: "refresh-secret" }),
    new Response("not-json"),
  ]) {
    const worker = createTokenExchange(async () => upstream)
    const response = await worker.fetch(request(), env)
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await response.text()).not.toMatch(/server-secret|refresh-secret|one-use-code/)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  }
})
