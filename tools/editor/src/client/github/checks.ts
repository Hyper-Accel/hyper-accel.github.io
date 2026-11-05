import { z } from "zod"
import { gitShaSchema } from "../../shared/onsite/document"
import type { CommitCheck } from "../../shared/onsite/github"
import type { GitHubHttp } from "./http"

const runSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  html_url: z.url().nullable(),
  details_url: z.url().nullable(),
  output: z.object({
    title: z.string().nullable(),
    summary: z.string().nullable(),
    text: z.string().nullable(),
    annotations_count: z.number().int().nonnegative(),
  }),
})
const runsSchema = z.object({ check_runs: z.array(runSchema) })
const statusSchema = z.object({
  id: z.number().int().positive(),
  context: z.string(),
  state: z.enum(["error", "failure", "pending", "success"]),
  description: z.string().nullable(),
  target_url: z.url().nullable(),
})
const annotationSchema = z.object({
  path: z.string(),
  start_line: z.number().int().positive(),
  annotation_level: z.enum(["notice", "warning", "failure"]),
  message: z.string(),
})

function checkState(run: z.infer<typeof runSchema>): CommitCheck["state"] {
  if (run.status !== "completed") return run.status === "in_progress" ? "running" : "queued"
  switch (run.conclusion) {
    case "success":
    case "neutral":
    case "skipped":
    case "cancelled":
      return run.conclusion
    case "failure":
    case "timed_out":
    case "action_required":
    case "stale":
    case "startup_failure":
      return "failure"
    default:
      return "unknown"
  }
}

function detailsUrl(value: string | null): string | null {
  return value && new URL(value).protocol === "https:" ? value : null
}

/** Read check runs and legacy commit statuses for one immutable saved version. */
export async function readCommitChecks(http: GitHubHttp, headSha: string): Promise<CommitCheck[]> {
  const sha = gitShaSchema.parse(headSha)
  const readRuns = async (): Promise<z.infer<typeof runSchema>[]> => {
    const runs: z.infer<typeof runSchema>[] = []
    for (let page = 1; ; page += 1) {
      const batch = await http.request(
        `${http.repo}/commits/${sha}/check-runs?filter=latest&per_page=100&page=${page}`,
        runsSchema,
        { fresh: true },
      )
      runs.push(...batch.check_runs)
      if (batch.check_runs.length < 100) return runs
    }
  }
  const [runs, statuses] = await Promise.all([
    readRuns(),
    http.list(`${http.repo}/commits/${sha}/statuses`, statusSchema, true),
  ])
  const checks = await Promise.all(
    runs.map(async (run): Promise<CommitCheck> => {
      const state = checkState(run)
      const annotations =
        state === "failure" && run.output.annotations_count > 0
          ? await http.list(`${http.repo}/check-runs/${run.id}/annotations`, annotationSchema, true)
          : []
      return {
        id: `check:${run.id}`,
        name: run.name,
        state,
        title: run.output.title ?? "",
        summary: run.output.summary ?? "",
        text: run.output.text ?? "",
        detailsUrl: detailsUrl(run.details_url ?? run.html_url),
        annotations: annotations.map((entry) => ({
          path: entry.path,
          line: entry.start_line,
          level: entry.annotation_level,
          message: entry.message,
        })),
      }
    }),
  )
  const latest = new Map<string, z.infer<typeof statusSchema>>()
  for (const status of statuses) {
    const context = status.context.toLowerCase()
    const previous = latest.get(context)
    if (!previous || status.id > previous.id) latest.set(context, status)
  }
  for (const status of latest.values()) {
    checks.push({
      id: `status:${status.id}`,
      name: status.context,
      state:
        status.state === "pending" ? "queued" : status.state === "success" ? "success" : "failure",
      title: "",
      summary: status.description ?? "",
      text: "",
      detailsUrl: detailsUrl(status.target_url),
      annotations: [],
    })
  }
  return checks
}
