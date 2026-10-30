import { describe, expect, test } from "bun:test"
import { relativeUpdatedTime } from "../client/site/drafts"
import { draftAddress, editAddress, parseSiteRoute } from "../client/site/routes"
import { startSiteHarness } from "./site-harness"

describe("hosted shell route boundary", () => {
  test.each([
    ["/editor-login/", "", { kind: "login" }],
    ["/editor-login/", "?code=one-use&state=s", { kind: "callback" }],
    ["/editor-new/", "", { kind: "compose", slug: null, language: "ko" }],
    [
      "/editor-new/",
      "?draft=example-post",
      { kind: "compose", slug: "example-post", language: "ko" },
    ],
    ["/posts/example-post/", "?edit", { kind: "compose", slug: "example-post", language: "ko" }],
    ["/en/posts/example-post/", "?edit", { kind: "compose", slug: "example-post", language: "en" }],
    [
      "/posts/example-post/",
      "?review=12",
      // Review happens in the editor: an older review address opens the same editor.
      { kind: "compose", slug: "example-post", language: "ko" },
    ],
    [
      "/editor-new/",
      "?draft=example-post&review=12",
      { kind: "compose", slug: "example-post", language: "ko" },
    ],
    ["/posts/example-post/", "", { kind: "notFound" }],
    ["/editor-new/", "?draft=../secret", { kind: "notFound" }],
    ["/editor/", "", { kind: "notFound" }],
  ] as const)("parses %s%s", (pathname, search, route) => {
    expect(parseSiteRoute({ pathname, search })).toEqual(route)
  })
  test("builds the editing addresses", () => {
    expect(editAddress("example-post", true)).toBe("/posts/example-post/?edit")
    expect(editAddress("example-post", true, "en")).toBe("/en/posts/example-post/?edit")
    expect(editAddress("example-post", false)).toBe("/editor-new/?draft=example-post")
    expect(draftAddress("example-post", { pathname: "/editor-new/" })).toBe(
      "/editor-new/?draft=example-post",
    )
  })
  test("formats update times with an explicit clock", () => {
    expect(relativeUpdatedTime("2026-10-27T00:00:00Z", Date.parse("2026-10-27T01:00:00Z"))).toBe(
      new Intl.RelativeTimeFormat("ko", { numeric: "auto" }).format(-1, "hour"),
    )
    expect(relativeUpdatedTime(undefined, 0)).toBe(relativeUpdatedTime("invalid", 0))
  })
})

test("harness enforces one-use PKCE and proxies authenticated GitHub", async () => {
  const harness = await startSiteHarness()
  try {
    const codeVerifier = "a".repeat(64)
    const redirectUri = `${harness.url}/editor-login/`
    const grant = await fetch(`${harness.url}/__dev/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ codeVerifier, redirectUri }),
    })
    const { code } = await grant.json()
    const exchange = (): Promise<Response> =>
      fetch(`${harness.url}/__github/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, codeVerifier, redirectUri }),
      })
    const result = await exchange()
    expect(result.status).toBe(200)
    const { accessToken } = await result.json()
    const pulls = await fetch(
      `${harness.url}/__github/repos/Hyper-Accel/hyper-accel.github.io/pulls`,
      {
        headers: { authorization: `Bearer ${accessToken}` },
      },
    )
    expect(pulls.status).toBe(200)
    expect((await pulls.json()).length).toBe(1)
    expect((await exchange()).status).toBe(401)
  } finally {
    harness.stop()
  }
})
