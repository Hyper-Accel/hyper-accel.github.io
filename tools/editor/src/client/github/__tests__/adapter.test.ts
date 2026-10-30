import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { BundleFile, ParseBundleInput } from "../../../shared/onsite/document"
import { fixtureBundles } from "../../../shared/onsite/fixtures"
import type { DraftPullRequest, GitHubResult } from "../../../shared/onsite/github"
import type { RangeAnchor } from "../../../shared/onsite/review"
import { type FakeGitHub, startFakeGitHub } from "../../../testing/fake-github"
import { filesAt } from "../../../testing/fake-github/state"
import { createGitHubAdapter, type GitHubAdapterOptions } from "../index"
import {
  extendFetch,
  loseMergeResponses,
  type ObservedRequest,
  rendezvous,
  withEtags,
} from "./http-extension"

const prefix = "/repos/Hyper-Accel/hyper-accel.github.io"
const koPath = "content/posts/test/index.md"
const enPath = "content/posts/test/index.en.md"
const imagePath = "content/posts/test/images/a.png"
const now = 1_800_000_000_000
const originals = { [koPath]: "unchanged\nold\n", [enPath]: "unchanged\nold English\n" }
const initial: readonly BundleFile[] = [
  { path: koPath, encoding: "utf-8", content: "unchanged\n새 글\nsecond\n" },
  { path: enPath, encoding: "utf-8", content: "unchanged\nnew\nsecond\n" },
  { path: imagePath, encoding: "base64", content: "AP9k" },
]
let fake: FakeGitHub
let parsedInputs: ParseBundleInput[]

function value<T>(result: GitHubResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error))
  return result.value
}

function adapter(
  token?: string,
  extra: Partial<GitHubAdapterOptions> = {},
): ReturnType<typeof createGitHubAdapter> {
  return createGitHubAdapter({
    owner: "Hyper-Accel",
    repository: "hyper-accel.github.io",
    tokenProvider: { getAccessToken: () => token ?? fake.defaultToken },
    expiresAt: () => now + 28_800_000,
    baseUrl: fake.url,
    now: () => now,
    codec: {
      async parse(input) {
        parsedInputs.push(input)
        const fixture = fixtureBundles[0]
        if (!fixture) throw new Error("Missing contract fixture")
        return {
          ok: true,
          migratedLegacy: false,
          bundle: {
            ...fixture,
            slug: input.slug,
            ko: { ...fixture.ko, path: `content/posts/${input.slug}/index.md` },
            en: { ...fixture.en, path: `content/posts/${input.slug}/index.en.md` },
            images: [...input.images],
            headSha: input.headSha,
          },
        }
      },
    },
    ...extra,
  })
}

async function setup(): Promise<DraftPullRequest> {
  fake.seed("main", { ...originals, "unrelated.txt": "preserve me" })
  return value(await adapter().ensureDraftPR("test", "Test post", initial))
}

function anchor(start = 2, end = 3): RangeAnchor {
  return {
    version: 1,
    blockIds: ["first"],
    startOffset: 0,
    endOffset: 7,
    quotedText: "새 글\nsecond",
    markdown: { path: koPath, start_line: start, line: end, side: "RIGHT", start_side: "RIGHT" },
    snapshotHash: "a".repeat(64),
  }
}

beforeEach(() => {
  fake = startFakeGitHub({ now: () => now })
  parsedInputs = []
})
afterEach(() => fake.stop())

describe("access and immutable bundle reads", () => {
  test("reads persisted approval after a new adapter and invalidates it at a new head", async () => {
    const pr = await setup()
    value(await adapter().markReady(pr.number, pr.headSha))
    value(await adapter(fake.reviewerToken).approve(pr.number, pr.headSha))
    const restored = value(await adapter().getPullState(pr.number))
    expect(restored).toMatchObject({
      headSha: pr.headSha,
      draft: false,
      approvedHeadShas: [pr.headSha],
      mergeable: true,
      merged: false,
    })
    const committed = value(
      await adapter().commitBundle("test", pr.headSha, [
        { path: koPath, encoding: "utf-8", content: "new revision" },
      ]),
    )
    const changed = value(await adapter().getPullState(pr.number))
    expect(changed.headSha).toBe(committed.headSha)
    expect(changed.approvedHeadShas).not.toContain(committed.headSha)
  })

  test("reads changes-requested and mergeability without trusting prior approval", async () => {
    const pr = await setup()
    const client = adapter()
    value(await client.markReady(pr.number, pr.headSha))
    value(await adapter(fake.reviewerToken).approve(pr.number, pr.headSha))
    const request = await fetch(`${fake.url}${prefix}/pulls/${pr.number}/reviews`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fake.reviewerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ event: "REQUEST_CHANGES", commit_id: pr.headSha }),
    })
    expect(request.status).toBe(200)
    fake.seed("main", { ...originals, "unrelated.txt": "new base" })
    expect(value(await client.getPullState(pr.number))).toMatchObject({
      approvedHeadShas: [],
      mergeable: false,
      merged: false,
    })
  })

  test("reports merged pull state after a completed squash", async () => {
    const pr = await setup()
    const client = adapter()
    value(await client.markReady(pr.number, pr.headSha))
    value(await adapter(fake.reviewerToken).approve(pr.number, pr.headSha))
    value(await client.squashMerge(pr.number, pr.headSha))
    expect(value(await adapter().getPullState(pr.number))).toMatchObject({ merged: true })
  })

  test("returns repository write access and the supplied real token expiry", async () => {
    const access = value(await adapter().getAccess())
    expect(access).toEqual({
      login: "author",
      userId: 1,
      expiresAt: now + 28_800_000,
      canWrite: true,
      repository: { owner: "Hyper-Accel", name: "hyper-accel.github.io" },
    })
    expect(JSON.stringify(access)).not.toContain(fake.defaultToken)
  })

  test("loads both languages at one captured SHA when the branch changes during reading", async () => {
    const pr = await setup()
    let changed = false
    const client = adapter(undefined, {
      fetch: extendFetch(undefined, (request, response) => {
        if (request.path.endsWith(`/contents/${koPath}`) && !changed) {
          changed = true
          fake.seed("post/test", { [koPath]: "later ko", [enPath]: "later en" })
        }
        return response
      }),
    })
    const loaded = value(await client.loadBundle("test"))
    expect(loaded.headSha).toBe(pr.headSha)
    expect(parsedInputs[0]).toMatchObject({
      ko: "unchanged\n새 글\nsecond\n",
      en: "unchanged\nnew\nsecond\n",
      headSha: pr.headSha,
      images: [{ path: "images/a.png", status: "committed", mime: "image/png" }],
    })
    expect(value(await client.loadBundle("test", pr.headSha)).headSha).toBe(pr.headSha)
  })

  test("loads an existing post from main before its draft branch exists", async () => {
    const head = fake.seed("main", originals)
    expect(value(await adapter().loadBundle("test")).headSha).toBe(head)
    expect(parsedInputs[0]?.ko).toBe(originals[koPath])
  })

  test("uses conditional GET and clears cached identity when the token changes", async () => {
    let token = fake.defaultToken
    const observed: ObservedRequest[] = []
    const client = adapter(undefined, {
      tokenProvider: { getAccessToken: () => token },
      fetch: withEtags(observed),
    })
    value(await client.getAccess())
    expect(value(await client.getAccess()).login).toBe("author")
    expect(observed.filter((request) => request.headers.has("if-none-match"))).toHaveLength(2)
    token = fake.reviewerToken
    expect(value(await client.getAccess()).login).toBe("reviewer")
    expect(observed.slice(-2).every((request) => !request.headers.has("if-none-match"))).toBe(true)
  })

  test.each([401, 403, 429] as const)("maps HTTP %d into a typed error", async (status) => {
    fake.inject({ method: "GET", path: "/user", status })
    const result = await adapter().getAccess()
    expect(result).toMatchObject({
      ok: false,
      error: { kind: status === 401 ? "unauthorized" : "rateLimited" },
    })
    if (status !== 401) expect(result).toMatchObject({ error: { retryAt: now + 1000 } })
  })

  test("maps a read-only write failure to forbidden without changing the branch", async () => {
    const pr = await setup()
    fake.grantToken("reader", { id: 3, login: "reader", permission: "read", expiresAt: now + 1000 })
    expect(value(await adapter("reader").getAccess()).canWrite).toBe(false)
    expect(await adapter("reader").commitBundle("test", pr.headSha, initial)).toMatchObject({
      ok: false,
      error: { kind: "forbidden" },
    })
    expect(fake.state.refs.get("heads/post/test")).toBe(pr.headSha)
  })
})

describe("atomic saves and idempotent draft creation", () => {
  test("creates one Draft PR under concurrent initial saves and subsequent retries", async () => {
    fake.seed("main", originals)
    const clients = [adapter(), adapter()]
    const outcomes = await Promise.all(
      clients.map((client) => client.ensureDraftPR("test", "Test post", initial)),
    )
    const first = outcomes[0]
    const second = outcomes[1]
    if (!first || !second) throw new Error("Missing concurrent result")
    expect(value(first).number).toBe(value(second).number)
    expect(value(await adapter().ensureDraftPR("test", "Retry", initial)).number).toBe(
      value(first).number,
    )
    expect(fake.state.pulls.size).toBe(1)
    expect([...fake.state.pulls.values()][0]?.draft).toBe(true)
  })

  test("recovers a lost PR creation response by finding its existing head", async () => {
    fake.seed("main", originals)
    let lost = false
    const client = adapter(undefined, {
      fetch: extendFetch(undefined, (request, response) => {
        if (request.method === "POST" && request.path === `${prefix}/pulls` && !lost) {
          lost = true
          throw new TypeError("Connection reset after server mutation")
        }
        return response
      }),
    })
    const pr = value(await client.ensureDraftPR("test", "Test", initial))
    expect(value(await client.ensureDraftPR("test", "Test", initial)).number).toBe(pr.number)
    expect(fake.state.pulls.size).toBe(1)
  })

  test("keeps exactly one sibling save when two clients update the same parent", async () => {
    const pr = await setup()
    const gate = rendezvous(2)
    const requests: ObservedRequest[] = []
    const fetcher = extendFetch(async (request) => {
      requests.push(request)
      if (request.method === "PATCH" && request.path.includes("/git/refs/")) await gate()
    })
    const outcomes = await Promise.all(
      ["left", "right"].map((content) =>
        adapter(undefined, { fetch: fetcher }).commitBundle("test", pr.headSha, [
          { path: koPath, encoding: "utf-8", content },
        ]),
      ),
    )
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1)
    expect(outcomes.find((outcome) => !outcome.ok)).toMatchObject({
      ok: false,
      error: {
        kind: "conflict",
        expectedHeadSha: pr.headSha,
        actualHeadSha: fake.state.refs.get("heads/post/test"),
      },
    })
    expect(
      requests.filter((request) => request.method === "PATCH").map((request) => request.body),
    ).toEqual([
      expect.objectContaining({ force: false }),
      expect.objectContaining({ force: false }),
    ])
  })

  test("leaves the branch unchanged when tree creation fails after blob uploads", async () => {
    const pr = await setup()
    fake.inject({ method: "POST", path: `${prefix}/git/trees`, status: 422 })
    expect(
      await adapter().commitBundle("test", pr.headSha, [
        { path: koPath, encoding: "utf-8", content: "unsaved" },
      ]),
    ).toMatchObject({ ok: false, error: { kind: "validation" } })
    expect(fake.state.refs.get("heads/post/test")).toBe(pr.headSha)
  })

  test("recovers the exact committed SHA when the ref update response is lost", async () => {
    const pr = await setup()
    const before = fake.state.commits.size
    let patches = 0
    const client = adapter(undefined, {
      fetch: extendFetch(undefined, (request, response) => {
        if (request.method === "PATCH" && request.path.includes("/git/refs/")) {
          patches += 1
          throw new TypeError("Response lost")
        }
        return response
      }),
    })
    const receipt = value(
      await client.commitBundle("test", pr.headSha, [
        { path: koPath, encoding: "utf-8", content: "saved" },
      ]),
    )
    expect(fake.state.refs.get("heads/post/test")).toBe(receipt.headSha)
    expect(fake.state.commits.size).toBe(before + 1)
    expect(patches).toBe(1)
  })

  test("reconciles an after-mutation HTTP error instead of writing twice", async () => {
    const pr = await setup()
    fake.inject({
      method: "PATCH",
      path: `${prefix}/git/refs/heads/post/test`,
      status: 429,
      afterMutation: true,
    })
    const receipt = value(
      await adapter().commitBundle("test", pr.headSha, [
        { path: enPath, encoding: "utf-8", content: "saved" },
      ]),
    )
    expect(fake.state.refs.get("heads/post/test")).toBe(receipt.headSha)
  })

  test("keeps an ambiguous save read-only until its ref can be reconciled", async () => {
    const pr = await setup()
    let sent = false
    let unreadable = true
    let patches = 0
    const client = adapter(undefined, {
      fetch: extendFetch(
        (request) => {
          if (
            sent &&
            unreadable &&
            request.method === "GET" &&
            request.path.includes("/git/ref/")
          ) {
            throw new TypeError("Read-back unavailable")
          }
        },
        (request, response) => {
          if (request.method === "PATCH" && request.path.includes("/git/refs/")) {
            sent = true
            patches += 1
            throw new TypeError("Response lost after update")
          }
          return response
        },
      ),
    })
    const files: BundleFile[] = [{ path: koPath, encoding: "utf-8", content: "saved once" }]
    expect(await client.commitBundle("test", pr.headSha, files)).toMatchObject({
      ok: false,
      error: { kind: "network", outcomeUnknown: true },
    })
    expect(await client.commitBundle("test", pr.headSha, files)).toMatchObject({
      ok: false,
      error: { kind: "network", outcomeUnknown: true },
    })
    unreadable = false
    const receipt = value(await client.commitBundle("test", pr.headSha, files))
    expect(fake.state.refs.get("heads/post/test")).toBe(receipt.headSha)
    expect(patches).toBe(1)
  })

  test("deletes a file while preserving base-tree files and binary image bytes", async () => {
    const pr = await setup()
    const image = filesAt(fake.state, pr.headSha).find((file) => file.path === imagePath)
    expect(image && fake.state.blobs.get(image.sha)?.content).toBe("AP9k")
    const receipt = value(
      await adapter().commitBundle("test", pr.headSha, [
        { path: imagePath, encoding: "delete" },
        { path: koPath, encoding: "utf-8", content: "revised" },
      ]),
    )
    const paths = filesAt(fake.state, receipt.headSha).map((file) => file.path)
    expect(paths).toContain("unrelated.txt")
    expect(paths).toContain(enPath)
    expect(paths).not.toContain(imagePath)
    expect(fake.state.commits.get(receipt.headSha)?.parents).toEqual([{ sha: pr.headSha }])
  })

  test("rejects escaping and duplicate bundle paths before creating Git objects", async () => {
    const pr = await setup()
    const before = fake.state.blobs.size
    for (const path of [
      "README.md",
      "content/posts/other/index.md",
      "content/posts/test/images/../x.png",
    ]) {
      expect(
        await adapter().commitBundle("test", pr.headSha, [
          { path, encoding: "utf-8", content: "bad" },
        ]),
      ).toMatchObject({ ok: false, error: { kind: "validation" } })
    }
    expect(
      await adapter().commitBundle(
        "test",
        pr.headSha,
        [initial[0], initial[0]].filter((entry): entry is BundleFile => entry !== undefined),
      ),
    ).toMatchObject({ ok: false, error: { kind: "validation" } })
    expect(fake.state.blobs.size).toBe(before)
  })

  test("paginates open post branches and excludes unrelated branches", async () => {
    const pr = await setup()
    const base = fake.state.pulls.get(pr.number)
    if (!base) throw new Error("Missing pull")
    for (let n = 0; n < 101; n += 1) {
      const head = n === 100 ? "feature/unrelated" : `post/post-${n}`
      fake.state.refs.set(`heads/${head}`, pr.headSha)
      fake.state.pulls.set(1000 + n, { ...base, number: 1000 + n, node_id: `PR_${1000 + n}`, head })
    }
    const listed = value(await adapter().listDrafts())
    expect(listed).toHaveLength(101)
    expect(listed.every((entry) => entry.branch.startsWith("post/"))).toBe(true)
    expect(listed[0]).toMatchObject({ slug: "test", headSha: pr.headSha, draft: true })
  })
})

describe("anchored discussions", () => {
  test("roundtrips multiline anchors, native replies and resolution", async () => {
    const pr = await setup()
    const author = adapter()
    const reviewer = adapter(fake.reviewerToken)
    const thread = value(
      await author.addRangeComment(pr.number, pr.headSha, anchor(), "Review this"),
    )
    expect(thread.storage).toBe("review")
    expect(thread.anchor).toEqual(anchor())
    expect(fake.state.comments.get(thread.rootCommentId)).toMatchObject({
      commit_id: pr.headSha,
      path: koPath,
      start_line: 2,
      line: 3,
      side: "RIGHT",
      start_side: "RIGHT",
    })
    const reply = value(await reviewer.replyComment(thread, "Agreed"))
    value(await reviewer.resolveThread(thread, true))
    const loaded = value(await author.getReviewThreads(pr.number))[0]
    expect(loaded).toMatchObject({
      resolved: true,
      comments: [{ body: "Review this" }, { id: reply.id, body: "Agreed" }],
    })
    if (!loaded) throw new Error("Missing thread")
    expect(value(await reviewer.resolveThread(loaded, false)).resolved).toBe(false)
  })

  test("omits start fields for a single-line review comment", async () => {
    const pr = await setup()
    const thread = value(
      await adapter().addRangeComment(pr.number, pr.headSha, anchor(2, 2), "One line"),
    )
    const saved = fake.state.comments.get(thread.rootCommentId)
    expect(saved?.line).toBe(2)
    expect(saved).not.toHaveProperty("start_line")
    expect(saved).not.toHaveProperty("start_side")
  })

  test("persists out-of-diff anchors and lets another writer reply and resolve", async () => {
    const pr = await setup()
    const selection = { ...anchor(1, 1), quotedText: "unchanged <!-- -->" }
    const thread = value(
      await adapter().addRangeComment(pr.number, pr.headSha, selection, "Unchanged text"),
    )
    expect(thread.storage).toBe("issue")
    expect(fake.state.comments.get(thread.rootCommentId)?.body).not.toContain("unchanged <!-- -->")
    expect(fake.state.comments.get(thread.rootCommentId)?.body.match(/ -->/g)).toHaveLength(1)
    const reviewer = adapter(fake.reviewerToken)
    value(await reviewer.replyComment(thread, "Reply"))
    value(await reviewer.resolveThread(thread, true))
    const reloaded = value(await adapter().getReviewThreads(pr.number))[0]
    expect(reloaded).toMatchObject({
      storage: "issue",
      anchor: selection,
      resolved: true,
      comments: [{ body: "Unchanged text" }, { body: "Reply" }],
    })
    expect(fake.state.comments.get(thread.rootCommentId)?.user.login).toBe("author")
  })

  test("does not silently fall back when a review comment fails for another reason", async () => {
    const pr = await setup()
    fake.inject({ method: "POST", path: `${prefix}/pulls/${pr.number}/comments`, status: 422 })
    expect(
      await adapter().addRangeComment(pr.number, pr.headSha, anchor(), "Invalid"),
    ).toMatchObject({
      ok: false,
      error: { kind: "validation" },
    })
    expect(fake.state.comments.size).toBe(0)
  })

  test.each(["review", "issue"] as const)(
    "recovers lost %s comment responses without duplicating",
    async (storage) => {
      const pr = await setup()
      let lost = false
      const path = `${prefix}/${storage === "review" ? "pulls" : "issues"}/${pr.number}/comments`
      const client = adapter(undefined, {
        fetch: extendFetch(undefined, (request, response) => {
          if (request.method === "POST" && request.path === path && response.ok && !lost) {
            lost = true
            throw new TypeError("Comment response lost")
          }
          return response
        }),
      })
      const thread = value(
        await client.addRangeComment(
          pr.number,
          pr.headSha,
          storage === "review" ? anchor() : anchor(1, 1),
          "Once",
        ),
      )
      expect(thread.storage).toBe(storage)
      expect(thread.comments).toHaveLength(1)
      expect(fake.state.comments.size).toBe(1)
    },
  )

  test("marks issue-backed comments outdated after another head is saved", async () => {
    const pr = await setup()
    value(await adapter().addRangeComment(pr.number, pr.headSha, anchor(1, 1), "Original"))
    value(
      await adapter().commitBundle("test", pr.headSha, [
        { path: koPath, encoding: "utf-8", content: "replaced" },
      ]),
    )
    expect(value(await adapter().getReviewThreads(pr.number))[0]?.outdated).toBe(true)
  })
})

describe("approval and publication", () => {
  test("recovers a lost squash response using GitHub's merged pull receipt", async () => {
    const pr = await setup()
    value(await adapter().markReady(pr.number, pr.headSha))
    value(await adapter(fake.reviewerToken).approve(pr.number, pr.headSha))
    const client = adapter(undefined, { fetch: loseMergeResponses() })
    const before = fake.state.commits.size
    const merged = value(await client.squashMerge(pr.number, pr.headSha))
    expect(fake.state.refs.get("heads/main")).toBe(merged.headSha)
    expect(value(await client.squashMerge(pr.number, pr.headSha))).toEqual(merged)
    expect(fake.state.commits.size).toBe(before + 1)
  })

  test("recovers a lost approval response without submitting a second review", async () => {
    const pr = await setup()
    const client = adapter(fake.reviewerToken, {
      fetch: extendFetch(undefined, (request, response) => {
        if (request.method === "POST" && request.path.endsWith("/reviews") && response.ok) {
          throw new TypeError("Approval response lost")
        }
        return response
      }),
    })
    expect(await client.approve(pr.number, pr.headSha)).toEqual({ ok: true, value: undefined })
    expect(fake.state.reviews.size).toBe(1)
  })

  test("requires approval even when the repository has no server-side approval rule", async () => {
    fake.stop()
    fake = startFakeGitHub({ now: () => now, requireApproval: false })
    const pr = await setup()
    value(await adapter().markReady(pr.number, pr.headSha))
    expect(await adapter().squashMerge(pr.number, pr.headSha)).toMatchObject({
      ok: false,
      error: { kind: "validation" },
    })
    expect(fake.state.pulls.get(pr.number)?.merged).toBe(false)
  })

  test("rejects self-approval and requires a current-head review before squash merge", async () => {
    const pr = await setup()
    const author = adapter()
    expect(await author.approve(pr.number, pr.headSha)).toMatchObject({
      ok: false,
      error: { kind: "validation" },
    })
    expect(value(await author.markReady(pr.number, pr.headSha)).draft).toBe(false)
    expect(await author.squashMerge(pr.number, pr.headSha)).toMatchObject({
      ok: false,
      error: { kind: "validation" },
    })
    expect(await adapter(fake.reviewerToken).approve(pr.number, pr.headSha)).toEqual({
      ok: true,
      value: undefined,
    })
    const merged = value(await author.squashMerge(pr.number, pr.headSha))
    expect(fake.state.refs.get("heads/main")).toBe(merged.headSha)
    expect(fake.state.pulls.get(pr.number)?.merged).toBe(true)
    expect(fake.state.commits.get(merged.headSha)?.parents).toHaveLength(1)
  })

  test("rejects a stale merge SHA and invalidates approval after an edit", async () => {
    const pr = await setup()
    const author = adapter()
    value(await author.markReady(pr.number, pr.headSha))
    value(await adapter(fake.reviewerToken).approve(pr.number, pr.headSha))
    const next = value(
      await author.commitBundle("test", pr.headSha, [
        { path: koPath, encoding: "utf-8", content: "after approval" },
      ]),
    )
    expect(await author.squashMerge(pr.number, pr.headSha)).toMatchObject({
      ok: false,
      error: { kind: "conflict", actualHeadSha: next.headSha },
    })
    expect(await author.squashMerge(pr.number, next.headSha)).toMatchObject({
      ok: false,
      error: { kind: "validation" },
    })
    expect(fake.state.pulls.get(pr.number)?.merged).toBe(false)
  })
})
