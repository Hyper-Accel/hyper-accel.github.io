import { expect, test } from "bun:test"
import { createPublicationServices } from "./publication"

const MERGE = "a".repeat(40)
const OLD = "b".repeat(40)
const LATER = "c".repeat(40)
const HEAD = "d".repeat(40)

interface Scenario {
  readonly marker?: string
  readonly markerStatus?: number
  readonly pageStatus?: number
  readonly merged?: boolean
  readonly mergeSha?: string | null
  readonly branch?: string
  readonly base?: string
  readonly comparison?: {
    readonly status: string
    readonly merge_base_commit: { readonly sha: string }
  }
}

function fixture(scenario: Scenario = {}) {
  const requests: string[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname
      requests.push(`${request.method} ${path}`)
      if (path === "/repos/Hyper-Accel/hyper-accel.github.io/pulls/7")
        return Response.json({
          number: 7,
          node_id: "PR_7",
          head: { ref: scenario.branch ?? "post/existing-post", sha: HEAD },
          base: { ref: scenario.base ?? "main" },
          draft: false,
          state: "closed",
          merged: scenario.merged ?? true,
          merge_commit_sha: scenario.mergeSha === undefined ? MERGE : scenario.mergeSha,
        })
      if (path === "/editor/build-commit.txt")
        return new Response(scenario.marker ?? `${MERGE}\n`, {
          status: scenario.markerStatus ?? 200,
        })
      if (path === "/posts/existing-post/")
        return new Response(null, { status: scenario.pageStatus ?? 200 })
      if (path.startsWith("/repos/Hyper-Accel/hyper-accel.github.io/compare/"))
        return Response.json(
          scenario.comparison ?? { status: "behind", merge_base_commit: { sha: OLD } },
        )
      return new Response(null, { status: 404 })
    },
  })
  return {
    server,
    requests,
    services: createPublicationServices({
      apiBaseUrl: server.url.origin,
      siteBaseUrl: server.url.origin,
      apiFetch: (input, init) => fetch(input, init),
    }),
  }
}

test("rejects a stale existing published page despite its successful HEAD", async () => {
  // Given: the old page exists but its build predates this PR's squash merge.
  const { server, services, requests } = fixture({ marker: OLD })
  try {
    expect((await fetch(new URL("/posts/existing-post/", server.url), { method: "HEAD" })).ok).toBe(
      true,
    )
    // When: checking this publication, not merely this URL.
    const published = await services.isPublished("existing-post", 7)
    // Then: the existing page is not proof of the new deployment.
    expect(published).toBe(false)
    expect(requests).toContain(
      `GET /repos/Hyper-Accel/hyper-accel.github.io/compare/${MERGE}...${OLD}`,
    )
  } finally {
    server.stop(true)
  }
})

const cases: readonly {
  readonly name: string
  readonly scenario: Scenario
  readonly expected: boolean
}[] = [
  { name: "exact squash merge build", scenario: {}, expected: true },
  {
    name: "later descendant build after skipped deployment",
    scenario: { marker: LATER, comparison: { status: "ahead", merge_base_commit: { sha: MERGE } } },
    expected: true,
  },
  {
    name: "diverged build",
    scenario: {
      marker: LATER,
      comparison: { status: "diverged", merge_base_commit: { sha: OLD } },
    },
    expected: false,
  },
  {
    name: "comparison without the publication as merge base",
    scenario: { marker: LATER, comparison: { status: "ahead", merge_base_commit: { sha: OLD } } },
    expected: false,
  },
  { name: "missing marker on old deployment", scenario: { markerStatus: 404 }, expected: false },
  { name: "malformed marker", scenario: { marker: "<html>old site</html>" }, expected: false },
  { name: "unmerged pull request", scenario: { merged: false }, expected: false },
  { name: "missing merge commit", scenario: { mergeSha: null }, expected: false },
  {
    name: "different post publication",
    scenario: { branch: "post/another-post" },
    expected: false,
  },
  { name: "non-production merge", scenario: { base: "staging" }, expected: false },
  { name: "missing page in correct build", scenario: { pageStatus: 404 }, expected: false },
]

for (const { name, scenario, expected } of cases) {
  test(`checks deployed version for ${name}`, async () => {
    // Given: a public build marker and the selected PR's merge identity.
    const { server, services } = fixture(scenario)
    try {
      // When: checking deployment.
      const published = await services.isPublished("existing-post", 7)
      // Then: only a build containing this merge with a served page succeeds.
      expect(published).toBe(expected)
    } finally {
      server.stop(true)
    }
  })
}
