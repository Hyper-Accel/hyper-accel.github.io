import type { PostBundle } from "../../shared/onsite/document"
import type { DraftCursor, DraftKey, DraftStore } from "../../shared/onsite/drafts"

export interface DraftAutosaveOptions {
  readonly store: DraftStore
  readonly key: DraftKey
  /** Use the restored snapshot's sequence, or zero for a new draft. */
  readonly initialSequence: number
  readonly onError: (error: unknown) => void
  readonly now?: () => number
  readonly document?: EventTarget
  readonly window?: EventTarget
}

export interface DraftAutosave {
  update(bundle: PostBundle, cursor: DraftCursor | null): Promise<void>
  flush(): Promise<void>
  dispose(): void
}

/** Every edit starts an atomic write immediately (zero debounce, no unload-only queue). */
export function createDraftAutosave(options: DraftAutosaveOptions): DraftAutosave {
  let sequence = options.initialSequence
  const doc = options.document ?? globalThis.document
  const win = options.window ?? globalThis.window
  const flush = (): Promise<void> => options.store.flush()
  const onLeave = (): void => {
    void flush().catch(options.onError)
  }
  doc?.addEventListener("visibilitychange", onLeave)
  win?.addEventListener("pagehide", onLeave)
  return {
    update(bundle, cursor) {
      sequence += 1
      return options.store.save({
        version: 1,
        key: options.key,
        bundle,
        cursor,
        sequence,
        savedAt: (options.now ?? Date.now)(),
      })
    },
    flush,
    dispose() {
      doc?.removeEventListener("visibilitychange", onLeave)
      win?.removeEventListener("pagehide", onLeave)
    },
  }
}
