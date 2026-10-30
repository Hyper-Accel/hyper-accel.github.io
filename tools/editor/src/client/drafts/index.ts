import type { DraftKey, DraftSnapshot, DraftStore } from "../../shared/onsite/drafts"

export type { DraftAutosave, DraftAutosaveOptions } from "./autosave"
export { createDraftAutosave } from "./autosave"
export type { DraftStoreOptions } from "./store"
export { createDraftStore, DraftStorageError } from "./store"

export interface DraftMountDependencies {
  readonly store: DraftStore
  readonly key: DraftKey
  readonly remoteHeadSha: string | null
  readonly onRestore: (snapshot: DraftSnapshot) => void | Promise<void>
  readonly onConflict: (
    snapshot: DraftSnapshot,
    remoteHeadSha: string | null,
  ) => void | Promise<void>
}

/** Mount separately from the composer so recovery never recreates its input nodes. */
export function mountDrafts(root: HTMLElement, deps: DraftMountDependencies): { dispose(): void } {
  const status = document.createElement("p")
  status.setAttribute("role", "status")
  status.textContent = "보관된 초안 확인 중…"
  const compare = document.createElement("button")
  compare.type = "button"
  compare.textContent = "변경 내용 비교"
  compare.hidden = true
  root.replaceChildren(status, compare)
  let disposed = false
  let conflict: DraftSnapshot | null = null
  const onCompare = (): void => {
    if (conflict) void deps.onConflict(conflict, deps.remoteHeadSha)
  }
  compare.addEventListener("click", onCompare)
  void deps.store
    .restore(deps.key, deps.remoteHeadSha)
    .then(async (result) => {
      if (disposed) return
      switch (result.status) {
        case "missing":
          status.textContent = ""
          break
        case "restored":
          await deps.onRestore(result.snapshot)
          if (!disposed) {
            const notice = "초안과 선택 위치를 복원했습니다."
            status.textContent = notice
            // A passing notice: it leaves the corner after a moment unless something replaced it.
            setTimeout(() => {
              if (!disposed && status.textContent === notice) status.textContent = ""
            }, 4000)
          }
          break
        case "conflict":
          conflict = result.snapshot
          status.textContent =
            "원격 글이 변경되었습니다. 보관된 초안과 비교한 뒤 이어서 작성해 주세요."
          compare.hidden = false
          break
      }
    })
    .catch(() => {
      if (!disposed)
        status.textContent =
          "초안을 복원하지 못했습니다. 이 페이지를 닫기 전에 저장 상태를 확인해 주세요."
    })
  return {
    dispose() {
      disposed = true
      compare.removeEventListener("click", onCompare)
      root.replaceChildren()
    },
  }
}
