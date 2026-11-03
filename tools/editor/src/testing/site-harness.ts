import { resolve, sep } from "node:path"
import { z } from "zod"
import { createTokenExchange } from "../../workers/token-exchange"
import { tokenExchangeResponseSchema } from "../shared/onsite/auth"
import { type FakeGitHub, startFakeGitHub } from "./fake-github"

const grantSchema = z.object({
  codeVerifier: z.string().min(43).max(128),
  redirectUri: z.url(),
  user: z.enum(["author", "reviewer"]).default("author"),
})

export interface SiteHarness {
  readonly url: string
  readonly github: FakeGitHub
  stop(): void
}

export async function startSiteHarness(
  options: { readonly port?: number; readonly output?: string } = {},
): Promise<SiteHarness> {
  const github = startFakeGitHub()
  const worker = createTokenExchange(async (input, init) => {
    const form = new URLSearchParams(await new Request(input, init).text())
    const response = await fetch(github.oauthUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
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
  const output = options.output ?? resolve(import.meta.dir, "../../dist-site")
  const repairSource = resolve(import.meta.dir, "../../../../content/posts/crafting-compilers")
  const repairFiles: Record<string, Uint8Array> = {}
  for await (const path of new Bun.Glob("**/*").scan({ cwd: repairSource, onlyFiles: true })) {
    repairFiles[`content/posts/crafting-compilers/${path}`] = new Uint8Array(
      await Bun.file(resolve(repairSource, path)).arrayBuffer(),
    )
  }
  github.seed("main", repairFiles)
  const base = github.state.refs.get("heads/main")
  if (!base) throw new Error("Fake main branch is missing")
  const title = { ko: "가속기 아키텍처 살펴보기", en: "Inside accelerator architecture" }
  const files: Record<string, string | Uint8Array> = Object.fromEntries(
    (["ko", "en"] as const).map((lang) => [
      `content/posts/example-post/index${lang === "en" ? ".en" : ""}.md`,
      `---\ntitle: "${title[lang]}"\ndate: "2026-10-28"\nauthors: ["Donghyeon Choi"]\neditors: ["author"]\ncategories: ["AI Hardware"]\ndraft: false\n---\n<!-- b:intro -->\n${lang === "ko" ? "가속기의 메모리 구조를 소개합니다." : "An introduction to accelerator memory."}\n\n<!-- b:diagram -->\n![${lang === "ko" ? "두 메모리 블록의 연결" : "Connection between two memory blocks"}](images/diagram.png)\n`,
    ]),
  )
  files["content/posts/example-post/images/diagram.png"] = Buffer.from(
    [
      "iVBORw0KGgoAAAANSUhEUgAAAIAAAABICAYAAAA+hf0SAAAB+0lEQVR4AeyZy23DMBBECVeQBlJYmss1fSUNpAMbPvBCgLTItcTdnWdAEPShufPmwRffyvfvnUOXwa3wkSaAANL1l4IACCBOQDw+vwAIIE5APD6/",
      "AKIC1NgIUEmInhFAtPgaGwEqCdEzAogWX2MjQCUhekYA0eJrbASoJETPCCBWfBsXAVoiYtcIIFZ4GxcBWiJi1wggVngb1yzA/9dn2XG0QXZf72Dw3NOa2yyAdQDW7yWAAHv5b98dAbZXcM0AvV0QoEdG5D4CiBTd",
      "i4kAPTIi9xFApOheTATokRG5jwAiRfdiIkCPjMh9BEhe9Kt4CPCKUPLnYQV4/hHi6YjqSVgBogL3NjcCeGvk4nkQ4GLg3rZDAG+NXDwPAlwM3Nt2YQX4+Pkrng5vxR6dJ6wARwPy3pgAAoz5pH+KAOkrHgdEgDGf",
      "9E8RIH3F44AIMOaT/ikCpK94HBABxnzCPZ0dGAFmiSV7HwGSFTobBwFmiSV7HwGSFTobxyzArj9kZoOe/X5UDmYBzgbL959LAAHO5ev+2xHAfUXHBlx9CwFWySVZhwBJilyNgQCr5JKsQ4AkRa7GQIBVcknWIUCS",
      "IldjIMAquSTrECB4kdbxEcBKMPh6BAheoHV8BLASDL4eAYIXaB0fAawEg69HgOAFWsdHACvB4OsRIGiB7xr7AQAA///NLoQOAAAABklEQVQDAHxxYC8MlCDTAAAAAElFTkSuQmCC",
    ].join(""),
    "base64",
  )
  github.seed("post/example-post", files)
  const seeded = await fetch(`${github.url}/repos/Hyper-Accel/hyper-accel.github.io/pulls`, {
    method: "POST",
    headers: { authorization: `Bearer ${github.defaultToken}`, "content-type": "application/json" },
    body: JSON.stringify({ title: title.ko, head: "post/example-post", base: "main", draft: true }),
  })
  if (!seeded.ok) {
    github.stop()
    throw new Error("Failed to seed harness draft")
  }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/__site/config")
        return Response.json({
          development: true,
          clientId: "fake-client",
          apiBaseUrl: github.url,
          exchangeUrl: `${url.origin}/exchange`,
        })
      if (url.pathname === "/exchange") {
        return worker.fetch(request, {
          GITHUB_CLIENT_ID: "fake-client",
          GITHUB_CLIENT_SECRET: "fake-secret",
        })
      }
      if (url.pathname === "/__dev/authorize" && request.method === "GET") {
        const params = z
          .object({
            client_id: z.literal("fake-client"),
            redirect_uri: z.url(),
            state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
            code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
            code_challenge_method: z.literal("S256"),
          })
          .safeParse(Object.fromEntries(url.searchParams))
        if (!params.success || params.data.redirect_uri !== `${url.origin}/editor-login/`) {
          return new Response("Invalid authorization request", { status: 400 })
        }
        const reviewer =
          request.headers.get("cookie")?.includes("onsite-dev-user=reviewer") ?? false
        const code = crypto.randomUUID()
        github.grantChallenge(code, params.data.code_challenge, params.data.redirect_uri, {
          login: reviewer ? "reviewer" : "author",
          id: reviewer ? 2 : 1,
          permission: "write",
          expiresAt: Date.now() + 28_800_000,
        })
        return Response.redirect(
          `${params.data.redirect_uri}?${new URLSearchParams({ code, state: params.data.state })}`,
          302,
        )
      }
      if (url.pathname.startsWith("/__dev/published/")) {
        const slug = url.pathname.slice("/__dev/published/".length)
        return Response.json({
          published: [...github.state.pulls.values()].some(
            (pull) => pull.head === `post/${slug}` && pull.merged,
          ),
        })
      }
      if (url.pathname === "/__dev/login" && request.method === "POST") {
        const parsed = grantSchema.safeParse(await request.json())
        if (!parsed.success) return new Response("Invalid grant", { status: 400 })
        const grant = parsed.data
        if (new URL(grant.redirectUri).origin !== url.origin)
          return new Response(null, { status: 400 })
        const code = crypto.randomUUID()
        github.grantCode(code, grant.codeVerifier, grant.redirectUri, {
          login: grant.user,
          id: grant.user === "author" ? 1 : 2,
          permission: "write",
          expiresAt: Date.now() + 28800000,
        })
        return Response.json({ code })
      }
      if (url.pathname === "/__dev/expire" && request.method === "POST") {
        for (const [token, identity] of github.state.tokens) {
          github.grantToken(token, { ...identity, expiresAt: 0 })
        }
        return new Response(null, { status: 204 })
      }
      if (url.pathname === "/__dev/move-head" && request.method === "POST") {
        github.seed("post/example-post", {
          ...files,
          "content/posts/example-post/index.md": `${files["content/posts/example-post/index.md"]}\nRemote change.\n`,
        })
        return new Response(null, { status: 204 })
      }
      if (url.pathname.startsWith("/__github/")) {
        const target = `${github.url}${url.pathname.slice("/__github".length)}${url.search}`
        const response = await fetch(new Request(target, request))
        if (url.pathname.endsWith("/pulls") && request.method === "GET" && response.ok) {
          const pulls = z.array(z.record(z.string(), z.unknown())).parse(await response.json())
          return Response.json(
            pulls.map((pull) => {
              const head = z.object({ sha: z.string() }).parse(pull["head"])
              const approved = [...github.state.reviews.values()].some(
                (review) =>
                  review.pull === pull["number"] &&
                  review.commit_id === head.sha &&
                  review.state === "APPROVED",
              )
              return {
                ...pull,
                updated_at: new Date().toISOString(),
                onsite_status: pull["draft"] ? "draft" : approved ? "approved" : "review",
              }
            }),
          )
        }
        return response
      }
      let path: string
      try {
        path = decodeURIComponent(url.pathname)
      } catch {
        return new Response(null, { status: 400 })
      }
      const absolute = resolve(output, `.${path.endsWith("/") ? `${path}index.html` : path}`)
      if (!absolute.startsWith(`${output}${sep}`)) return new Response(null, { status: 403 })
      const file = Bun.file(absolute)
      if (!(await file.exists())) return new Response(null, { status: 404 })
      return new Response(file, {
        headers: { "X-Robots-Tag": "noindex, nofollow", "Access-Control-Allow-Origin": "*" },
      })
    },
  })
  return {
    url: server.url.origin,
    github,
    stop() {
      server.stop(true)
      github.stop()
    },
  }
}
