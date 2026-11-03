import type { SiteDraft, SiteServices } from "./contracts"

export function relativeUpdatedTime(value: string | undefined, now = Date.now()): string {
  const timestamp = value ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(timestamp)) return "수정 시간 확인 불가"
  const seconds = Math.round((timestamp - now) / 1000)
  const format = new Intl.RelativeTimeFormat("ko", { numeric: "auto" })
  if (Math.abs(seconds) < 60) return format.format(seconds, "second")
  if (Math.abs(seconds) < 3600) return format.format(Math.round(seconds / 60), "minute")
  if (Math.abs(seconds) < 86400) return format.format(Math.round(seconds / 3600), "hour")
  return format.format(Math.round(seconds / 86400), "day")
}

type PullState = Awaited<ReturnType<NonNullable<SiteServices["github"]["getPullState"]>>>

/** Where a pushed draft stands: still being written, waiting for review, or approved at its head. */
export function draftStatus(
  draft: SiteDraft,
  pullState: PullState | undefined,
): "draft" | "review" | "approved" {
  if (pullState?.ok) {
    if (pullState.value.draft) return "draft"
    return pullState.value.approvedHeadShas.includes(pullState.value.headSha)
      ? "approved"
      : "review"
  }
  return draft.status ?? (draft.draft ? "draft" : "review")
}
