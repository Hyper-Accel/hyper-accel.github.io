import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { z } from "zod"
import { type FakeGitHub, startFakeGitHub } from "./index"

const prefix = "/repos/Hyper-Accel/hyper-accel.github.io"
const shaResponse = z.object({ sha: z.string() })
const pullResponse = z.object({ number: z.number(), node_id: z.string(), draft: z.boolean() })
let fake: FakeGitHub

beforeEach(() => {
  fake = startFakeGitHub({ now: () => 1_800_000_000_000 })
})
afterEach(() => fake.stop())

async function request(
  method: string,
  path: string,
  body?: unknown,
  token = fake.defaultToken,
): Promise<Response> {
  return fetch(
    `${fake.url}${path.startsWith("/graphql") || path === "/user" ? "" : prefix}${path}`,
    {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  )
}

async function commit(parent: string, text: string): Promise<string> {
  const previous = fake.state.commits.get(parent)
  if (!previous) throw new Error("Missing parent")
  const treeResponse = await request("POST", "/git/trees", {
    base_tree: previous.tree.sha,
    tree: [{ path: "content/posts/test/index.md", mode: "100644", type: "blob", content: text }],
  })
  expect(treeResponse.status).toBe(201)
  const tree = shaResponse.parse(await treeResponse.json())
  const response = await request("POST", "/git/commits", {
    message: text,
    tree: tree.sha,
    parents: [parent],
  })
  expect(response.status).toBe(201)
  return shaResponse.parse(await response.json()).sha
}

async function setupPull(): Promise<{
  number: number
  nodeId: string
  head: string
  base: string
}> {
  const base = fake.seed("main", { "content/posts/test/index.md": "unchanged\nold\n" })
  const head = await commit(base, "unchanged\nnew\nsecond\n")
  expect(
    (await request("POST", "/git/refs", { ref: "refs/heads/post/test", sha: head })).status,
  ).toBe(201)
  const response = await request("POST", "/pulls", {
    title: "Test",
    head: "post/test",
    base: "main",
    draft: true,
  })
  expect(response.status).toBe(201)
  const pr = pullResponse.parse(await response.json())
  return { number: pr.number, nodeId: pr.node_id, head, base }
}

async function ready(nodeId: string): Promise<void> {
  const response = await request("POST", "/graphql", {
    query:
      "mutation($input: MarkPullRequestReadyForReviewInput!) { markPullRequestReadyForReview(input: $input) { pullRequest { id isDraft } } }",
    variables: { input: { pullRequestId: nodeId } },
  })
  expect(response.status).toBe(200)
}

describe("stateful fake GitHub", () => {
  test("rejects missing credentials and denies writes for a read-only user", async () => {
    fake.grantToken("reader", {
      login: "reader",
      id: 3,
      permission: "read",
      expiresAt: 1_900_000_000_000,
    })
    expect((await request("GET", "/user", undefined, "invalid")).status).toBe(401)
    const access = await request("GET", "", undefined, "reader")
    expect(await access.json()).toMatchObject({ private: false, permissions: { push: false } })
    expect(
      (await request("POST", "/git/blobs", { content: "x", encoding: "utf-8" }, "reader")).status,
    ).toBe(403)
    expect(fake.state.blobs.size).toBe(0)
  })

  test("keeps ref unchanged until all blobs and tree are committed", async () => {
    const base = fake.state.refs.get("heads/main")
    if (!base) throw new Error("Missing main")
    const blob = shaResponse.parse(
      await (
        await request("POST", "/git/blobs", {
          content: Buffer.from([0, 255, 100]).toString("base64"),
          encoding: "base64",
        })
      ).json(),
    )
    const tree = shaResponse.parse(
      await (
        await request("POST", "/git/trees", {
          tree: [
            { path: "content/posts/test/index.md", mode: "100644", type: "blob", content: "ko" },
            { path: "content/posts/test/index.en.md", mode: "100644", type: "blob", content: "en" },
            {
              path: "content/posts/test/images/a.png",
              mode: "100644",
              type: "blob",
              sha: blob.sha,
            },
          ],
        })
      ).json(),
    )
    const next = shaResponse.parse(
      await (
        await request("POST", "/git/commits", {
          tree: tree.sha,
          parents: [base],
          message: "Atomic bundle",
        })
      ).json(),
    )
    expect(fake.state.refs.get("heads/main")).toBe(base)
    expect(
      (await request("PATCH", "/git/refs/heads/main", { sha: next.sha, force: false })).status,
    ).toBe(200)
    expect(fake.state.refs.get("heads/main")).toBe(next.sha)
    const image = await request("GET", "/contents/content/posts/test/images/a.png")
    expect(await image.json()).toMatchObject({ content: "AP9k", encoding: "base64", size: 3 })
  })

  test("allows only one concurrent sibling commit to advance a branch", async () => {
    const pr = await setupPull()
    const left = await commit(pr.head, "left")
    const right = await commit(pr.head, "right")
    const results = await Promise.all([
      request("PATCH", "/git/refs/heads/post/test", { sha: left, force: false }),
      request("PATCH", "/git/refs/heads/post/test", { sha: right, force: false }),
    ])
    expect(results.map((result) => result.status).sort()).toEqual([200, 422])
    const winner = results[0]?.ok ? left : right
    expect(fake.state.refs.get("heads/post/test")).toBe(winner)
  })

  test("rejects a duplicate open PR and lists the existing draft", async () => {
    const pr = await setupPull()
    const duplicate = await request("POST", "/pulls", {
      title: "Duplicate",
      head: "post/test",
      base: "main",
      draft: true,
    })
    expect(duplicate.status).toBe(422)
    const listed = await request("GET", "/pulls?head=Hyper-Accel:post/test&state=open")
    expect(await listed.json()).toMatchObject([{ number: pr.number, draft: true }])
    expect(fake.state.pulls.size).toBe(1)
  })

  test("rejects an empty PR before an initial content commit", async () => {
    const base = fake.state.refs.get("heads/main")
    expect(
      (await request("POST", "/git/refs", { ref: "refs/heads/post/empty", sha: base })).status,
    ).toBe(201)
    expect(
      (await request("POST", "/pulls", { title: "Empty", head: "post/empty", base: "main" }))
        .status,
    ).toBe(422)
  })

  test("persists multiline comments, replies and resolved GraphQL threads", async () => {
    const pr = await setupPull()
    const commentResponse = await request("POST", `/pulls/${pr.number}/comments`, {
      body: "Review selection",
      commit_id: pr.head,
      path: "content/posts/test/index.md",
      start_line: 2,
      line: 3,
      start_side: "RIGHT",
      side: "RIGHT",
    })
    expect(commentResponse.status).toBe(201)
    const comment = z
      .object({ id: z.number(), start_line: z.number(), line: z.number() })
      .parse(await commentResponse.json())
    expect([comment.start_line, comment.line]).toEqual([2, 3])
    expect(
      (
        await request(
          "POST",
          `/pulls/${pr.number}/comments/${comment.id}/replies`,
          { body: "Reply" },
          fake.reviewerToken,
        )
      ).status,
    ).toBe(201)
    expect(
      (
        await request("POST", "/graphql", {
          query:
            "mutation($input: ResolveReviewThreadInput!) { resolveReviewThread(input: $input) { thread { id isResolved } } }",
          variables: { input: { threadId: `THREAD_${comment.id}` } },
        })
      ).status,
    ).toBe(200)
    const threads = await request("POST", "/graphql", {
      query:
        "query($number: Int!) { repository { pullRequest(number: $number) { reviewThreads { nodes { id } } } }",
      variables: { number: pr.number },
    })
    const payload = z
      .object({
        data: z.object({
          repository: z.object({
            pullRequest: z.object({
              reviewThreads: z.object({
                nodes: z.array(
                  z.object({
                    isResolved: z.boolean(),
                    comments: z.object({ nodes: z.array(z.object({ body: z.string() })) }),
                  }),
                ),
              }),
            }),
          }),
        }),
      })
      .parse(await threads.json())
    const thread = payload.data.repository.pullRequest.reviewThreads.nodes[0]
    expect(thread?.isResolved).toBe(true)
    expect(thread?.comments.nodes.map((value) => value.body)).toEqual(["Review selection", "Reply"])
  })

  test("rejects unchanged lines and permits issue-comment anchor fallback", async () => {
    const pr = await setupPull()
    const rejected = await request("POST", `/pulls/${pr.number}/comments`, {
      body: "unchanged",
      commit_id: pr.head,
      path: "content/posts/test/index.md",
      line: 1,
      side: "RIGHT",
    })
    expect(rejected.status).toBe(422)
    const fallback = await request("POST", `/issues/${pr.number}/comments`, {
      body: "Selection <!-- onsite-range:v1 {} -->",
    })
    expect(fallback.status).toBe(201)
    const comments = await request("GET", `/issues/${pr.number}/comments`)
    expect(await comments.json()).toMatchObject([
      { kind: "issue", body: "Selection <!-- onsite-range:v1 {} -->" },
    ])
  })

  test("requires readiness, current-head approval, and expected SHA before merge", async () => {
    const pr = await setupPull()
    const merge = (): Promise<Response> =>
      request("PUT", `/pulls/${pr.number}/merge`, { sha: pr.head, merge_method: "squash" })
    expect((await merge()).status).toBe(405)
    await ready(pr.nodeId)
    expect((await merge()).status).toBe(405)
    expect(
      (
        await request("POST", `/pulls/${pr.number}/reviews`, {
          event: "APPROVE",
          commit_id: pr.head,
        })
      ).status,
    ).toBe(422)
    expect(
      (
        await request(
          "POST",
          `/pulls/${pr.number}/reviews`,
          { event: "APPROVE", commit_id: pr.head },
          fake.reviewerToken,
        )
      ).status,
    ).toBe(200)
    expect(
      (await request("PUT", `/pulls/${pr.number}/merge`, { sha: pr.base, merge_method: "squash" }))
        .status,
    ).toBe(409)
    const merged = await merge()
    expect(merged.status).toBe(200)
    const result = shaResponse.parse(await merged.json())
    expect(fake.state.refs.get("heads/main")).toBe(result.sha)
    expect(fake.state.commits.get(result.sha)?.parents).toEqual([{ sha: pr.base }])
    expect(fake.state.pulls.get(pr.number)).toMatchObject({ merged: true, state: "closed" })
  })

  test("invalidates approval after a new head commit", async () => {
    const pr = await setupPull()
    await ready(pr.nodeId)
    await request(
      "POST",
      `/pulls/${pr.number}/reviews`,
      { event: "APPROVE", commit_id: pr.head },
      fake.reviewerToken,
    )
    const next = await commit(pr.head, "changed after review")
    await request("PATCH", "/git/refs/heads/post/test", { sha: next })
    expect(
      (await request("PUT", `/pulls/${pr.number}/merge`, { sha: next, merge_method: "squash" }))
        .status,
    ).toBe(405)
    expect(fake.state.refs.get("heads/main")).toBe(pr.base)
  })

  test.each([401, 403, 409, 422, 429] as const)(
    "injects %d once without mutation",
    async (status) => {
      fake.inject({ method: "POST", path: `${prefix}/git/blobs`, status })
      const response = await request("POST", "/git/blobs", { content: "hello", encoding: "utf-8" })
      expect(response.status).toBe(status)
      expect(fake.state.blobs.size).toBe(0)
      expect(
        (await request("POST", "/git/blobs", { content: "hello", encoding: "utf-8" })).status,
      ).toBe(201)
    },
  )

  test("permits read-back reconciliation after an acknowledged failure following mutation", async () => {
    const pr = await setupPull()
    const next = await commit(pr.head, "applied but response failed")
    fake.inject({
      method: "PATCH",
      path: `${prefix}/git/refs/heads/post/test`,
      status: 429,
      afterMutation: true,
    })
    expect((await request("PATCH", "/git/refs/heads/post/test", { sha: next })).status).toBe(429)
    const result = await request("GET", "/git/ref/heads/post/test")
    expect(await result.json()).toMatchObject({ object: { sha: next } })
  })

  test("exchanges a one-use PKCE code and rejects wrong verifiers and expired tokens", async () => {
    const verifier = "a".repeat(43)
    const redirectUri = "http://127.0.0.1/editor/"
    fake.grantCode("test-code", verifier, redirectUri, {
      login: "author",
      id: 1,
      permission: "write",
      expiresAt: 1_900_000_000_000,
    })
    const exchange = (codeVerifier: string): Promise<Response> =>
      fetch(fake.oauthUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "test-code", codeVerifier, redirectUri }),
      })
    expect((await exchange("b".repeat(43))).status).toBe(401)
    const response = await exchange(verifier)
    expect(response.status).toBe(200)
    const token = z
      .object({ accessToken: z.string(), expiresIn: z.number() })
      .parse(await response.json())
    expect(token.expiresIn).toBe(28800)
    expect((await request("GET", "/user", undefined, token.accessToken)).status).toBe(200)
    expect((await exchange(verifier)).status).toBe(401)
    fake.grantToken("expired", { login: "author", id: 1, permission: "write", expiresAt: 1 })
    expect((await request("GET", "/user", undefined, "expired")).status).toBe(401)
  })
})
