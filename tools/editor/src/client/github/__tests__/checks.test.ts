import { afterEach, beforeEach, expect, test } from "bun:test"
import { documentCodec } from "../../../document"
import type { CommitCheck } from "../../../shared/onsite/github"
import { type FakeGitHub, startFakeGitHub } from "../../../testing/fake-github"
import type { FakeCheckRun } from "../../../testing/fake-github/state"
import { createGitHubAdapter, type GitHubAdapterOptions } from "../index"
import { extendFetch } from "./http-extension"

let fake: FakeGitHub
let sha: string
const prefix = "/repos/Hyper-Accel/hyper-accel.github.io"
beforeEach(() => {
  fake = startFakeGitHub()
  sha = fake.seed("main", { "test.txt": "CI version" })
})
afterEach(() => fake.stop())

function adapter(extra: Partial<GitHubAdapterOptions> = {}) {
  return createGitHubAdapter({
    owner: "Hyper-Accel",
    repository: "hyper-accel.github.io",
    baseUrl: fake.url,
    tokenProvider: { getAccessToken: () => fake.defaultToken },
    expiresAt: () => Date.now() + 100_000,
    codec: documentCodec,
    ...extra,
  })
}

function run(id: number, status: string, conclusion: string | null): FakeCheckRun {
  return {
    id,
    name: `job-${id}`,
    status,
    conclusion,
    html_url: `https://github.com/Hyper-Accel/hyper-accel.github.io/actions/runs/${id}`,
    details_url: null,
    output: { title: null, summary: null, text: null, annotations_count: 0 },
  }
}

const states: readonly (readonly [string, string | null, CommitCheck["state"]])[] = [
  ["queued", null, "queued"],
  ["in_progress", null, "running"],
  ["waiting", null, "queued"],
  ["completed", "success", "success"],
  ["completed", "failure", "failure"],
  ["completed", "timed_out", "failure"],
  ["completed", "action_required", "failure"],
  ["completed", "cancelled", "cancelled"],
  ["completed", "skipped", "skipped"],
  ["completed", "neutral", "neutral"],
  ["completed", null, "unknown"],
]
test.each(states)("maps check-run %s/%s to %s", async (status, conclusion, expected) => {
  fake.state.checkRuns.set(sha, [run(1, status, conclusion)])
  const result = await adapter().getCommitChecks(sha)
  expect(result).toMatchObject({ ok: true, value: [{ state: expected }] })
})

test("loads all failed-run annotations and every page without reporting old commit statuses", async () => {
  fake.state.checkRuns.set(sha, [
    ...Array.from({ length: 100 }, (_, index) => run(index + 1, "completed", "success")),
    {
      ...run(101, "completed", "failure"),
      output: { title: "Invalid post", summary: "Fix draft", text: null, annotations_count: 101 },
    },
  ])
  fake.state.checkAnnotations.set(
    101,
    Array.from({ length: 101 }, (_, index) => ({
      path: "content/posts/example/index.md",
      start_line: index + 1,
      annotation_level: "failure",
      message: `Problem ${index + 1}`,
    })),
  )
  fake.state.commitStatuses.set(sha, [
    { id: 1, context: "lint", state: "failure", description: "Old failure", target_url: null },
    { id: 2, context: "lint", state: "success", description: "Fixed", target_url: null },
  ])
  const result = await adapter().getCommitChecks(sha)
  if (!result.ok) throw new Error(result.error.message)
  expect(result.value).toHaveLength(102)
  expect(result.value.find((check) => check.id === "check:101")?.annotations).toHaveLength(101)
  expect(result.value.find((check) => check.id === "check:101")?.annotations.at(-1)).toEqual({
    path: "content/posts/example/index.md",
    line: 101,
    level: "failure",
    message: "Problem 101",
  })
  expect(result.value.filter((check) => check.name === "lint")).toMatchObject([
    {
      id: "status:2",
      state: "success",
      summary: "Fixed",
    },
  ])
})

test("keeps only the latest commit status when its context changes case", async () => {
  fake.state.commitStatuses.set(sha, [
    { id: 2, context: "CI", state: "success", description: "Fixed", target_url: null },
    { id: 1, context: "ci", state: "failure", description: "Old failure", target_url: null },
  ])
  expect(await adapter().getCommitChecks(sha)).toEqual({
    ok: true,
    value: [
      {
        id: "status:2",
        name: "CI",
        state: "success",
        title: "",
        summary: "Fixed",
        text: "",
        durationMs: null,
        detailsUrl: null,
        annotations: [],
      },
    ],
  })
})

test("does not reuse a previous result when checks change at the same head", async () => {
  const client = adapter()
  fake.state.checkRuns.set(sha, [run(1, "in_progress", null)])
  expect(await client.getCommitChecks(sha)).toMatchObject({
    ok: true,
    value: [{ state: "running" }],
  })
  fake.state.checkRuns.set(sha, [run(1, "completed", "failure")])
  expect(await client.getCommitChecks(sha)).toMatchObject({
    ok: true,
    value: [{ state: "failure" }],
  })
})

test("reports access denial instead of an empty successful CI list", async () => {
  fake.inject({ method: "GET", path: `${prefix}/commits/${sha}/check-runs`, status: 403 })
  const client = adapter({
    fetch: extendFetch(undefined, (_request, response) => {
      const headers = new Headers(response.headers)
      headers.delete("Retry-After")
      headers.delete("X-RateLimit-Reset")
      return new Response(response.body, { status: response.status, headers })
    }),
  })
  expect(await client.getCommitChecks(sha)).toMatchObject({
    ok: false,
    error: { kind: "forbidden" },
  })
})

test("never exposes executable check detail URLs", async () => {
  fake.state.checkRuns.set(sha, [
    { ...run(1, "completed", "failure"), details_url: "javascript:alert(1)" },
  ])
  expect(await adapter().getCommitChecks(sha)).toMatchObject({
    ok: true,
    value: [{ detailsUrl: null }],
  })
})
