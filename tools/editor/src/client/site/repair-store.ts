import { z } from "zod"
import {
  bundleImageSchema,
  bundleLanguageSchema,
  gitShaSchema,
  languageSchema,
  slugSchema,
} from "../../shared/onsite/document"
import { type DraftKey, draftKeySchema } from "../../shared/onsite/drafts"

const unpairedLanguageSchema = bundleLanguageSchema.omit({ blocks: true }).extend({
  blocks: z.array(z.string()).readonly(),
})
export const repairSnapshotSchema = z
  .object({
    type: z.literal("repair"),
    version: z.literal(1),
    key: draftKeySchema,
    sequence: z.number().int().nonnegative(),
    language: languageSchema,
    scrollTop: z.number().nonnegative(),
    unpaired: z.object({
      slug: slugSchema,
      headSha: gitShaSchema.nullable(),
      images: z.array(bundleImageSchema).readonly(),
      ko: unpairedLanguageSchema,
      en: unpairedLanguageSchema,
    }),
  })
  .refine((snapshot) => snapshot.key.slug === snapshot.unpaired.slug, "Repair scope mismatch")
export type RepairSnapshot = z.infer<typeof repairSnapshotSchema>

export interface RepairStore {
  save(snapshot: RepairSnapshot): Promise<void>
  load(key: DraftKey): Promise<RepairSnapshot | null>
  remove(key: DraftKey): Promise<void>
  flush(): Promise<void>
  close(): Promise<void>
}

export function createRepairStore(factory: IDBFactory = indexedDB): RepairStore {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open("hyperaccel-onsite-repairs", 1)
    request.onupgradeneeded = () => request.result.createObjectStore("repairs")
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error("짝 맞춤 보관함을 열지 못했습니다."))
  })
  void database.catch(() => undefined)
  const id = (key: DraftKey): string =>
    JSON.stringify([key.owner, key.repository, key.userId, key.slug])
  const pending = new Set<Promise<void>>()
  let failure: unknown = null
  async function write(action: (store: IDBObjectStore) => void): Promise<void> {
    const db = await database
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("repairs", "readwrite")
      action(tx.objectStore("repairs"))
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
      tx.onerror = () => reject(tx.error)
    })
  }
  const track = (operation: Promise<void>): Promise<void> => {
    pending.add(operation)
    void operation.then(
      () => {
        pending.delete(operation)
        failure = null
      },
      (error: unknown) => {
        pending.delete(operation)
        failure = error
      },
    )
    return operation
  }
  return {
    save(snapshot) {
      const copy = structuredClone(repairSnapshotSchema.parse(snapshot))
      return track(
        write((store) => {
          const request = store.get(id(copy.key))
          request.onsuccess = () => {
            const previous = repairSnapshotSchema.safeParse(request.result)
            if (!previous.success || previous.data.sequence < copy.sequence)
              store.put(copy, id(copy.key))
          }
        }),
      )
    },
    async load(key) {
      const db = await database
      return new Promise<RepairSnapshot | null>((resolve, reject) => {
        const tx = db.transaction("repairs")
        const request = tx.objectStore("repairs").get(id(draftKeySchema.parse(key)))
        let snapshot: RepairSnapshot | null = null
        request.onsuccess = () => {
          const parsed = repairSnapshotSchema.safeParse(request.result)
          if (request.result !== undefined && !parsed.success) {
            reject(parsed.error)
            tx.abort()
          } else if (parsed.success) snapshot = parsed.data
        }
        tx.oncomplete = () => resolve(snapshot)
        tx.onabort = () => reject(tx.error)
      })
    },
    remove(key) {
      return track(
        write((store) => {
          store.delete(id(key))
        }),
      )
    },
    async flush() {
      await Promise.all(pending)
      if (failure) throw failure
    },
    async close() {
      await Promise.all(pending)
      ;(await database).close()
    },
  }
}
