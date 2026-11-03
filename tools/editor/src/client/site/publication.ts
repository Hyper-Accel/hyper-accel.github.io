import ky from "ky"
import { z } from "zod"
import { gitShaSchema } from "../../shared/onsite/document"
import type { HttpFetch } from "../auth/controller"

const pullSchema = z.object({
  number: z.number().int().positive(),
  node_id: z.string().min(1),
  head: z.object({ ref: z.string(), sha: gitShaSchema }),
  base: z.object({ ref: z.string() }),
  draft: z.boolean(),
  state: z.enum(["open", "closed"]),
  merged: z.boolean(),
  merge_commit_sha: gitShaSchema.nullish(),
})
const comparisonSchema = z.object({
  status: z.enum(["ahead", "behind", "identical", "diverged"]),
  merge_base_commit: z.object({ sha: gitShaSchema }),
})

export function createPublicationServices(options: {
  readonly apiBaseUrl: string
  readonly siteBaseUrl: string
  readonly apiFetch: HttpFetch
}): {
  readonly isPublished: (slug: string, pullNumber: number) => Promise<boolean>
} {
  const api = ky.create({ fetch: options.apiFetch, retry: 0, cache: "no-store" })
  const site = ky.create({ retry: 0, cache: "no-store" })
  const repo = `${options.apiBaseUrl}/repos/Hyper-Accel/hyper-accel.github.io`
  const pull = async (pullNumber: number): Promise<z.infer<typeof pullSchema>> =>
    pullSchema.parse(
      await api.get(`${repo}/pulls/${z.number().int().positive().parse(pullNumber)}`).json(),
    )

  return {
    async isPublished(slug, pullNumber) {
      const pr = await pull(pullNumber)
      if (
        !pr.merged ||
        !pr.merge_commit_sha ||
        pr.head.ref !== `post/${slug}` ||
        pr.base.ref !== "main"
      )
        return false
      const marker = await site.get(new URL("/editor/build-commit.txt", options.siteBaseUrl), {
        throwHttpErrors: false,
      })
      if (!marker.ok) return false
      const deployed = gitShaSchema.safeParse((await marker.text()).trim())
      if (!deployed.success) return false
      if (deployed.data !== pr.merge_commit_sha) {
        // Queued Pages builds may skip this merge and deploy a later descendant.
        const comparison = comparisonSchema.parse(
          await api.get(`${repo}/compare/${pr.merge_commit_sha}...${deployed.data}`).json(),
        )
        if (
          comparison.status !== "ahead" ||
          comparison.merge_base_commit.sha !== pr.merge_commit_sha
        )
          return false
      }
      return (
        await site.head(new URL(`/posts/${slug}/`, options.siteBaseUrl), {
          throwHttpErrors: false,
        })
      ).ok
    },
  }
}
