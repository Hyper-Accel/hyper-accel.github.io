import {
  type DraftKey,
  type DraftRestore,
  type DraftSnapshot,
  type DraftStore,
  draftKeySchema,
  draftSnapshotSchema,
} from "../../shared/onsite/drafts"

const STORE = "snapshots"

export class DraftStorageError extends Error {
  constructor(
    readonly kind: "closed" | "unavailable" | "transaction" | "scope",
    options?: ErrorOptions,
  ) {
    super(
      {
        closed: "초안 저장소가 닫혔습니다.",
        unavailable: "이 기기에서 초안을 보관할 수 없습니다.",
        transaction: "초안을 저장하지 못했습니다. 페이지를 닫기 전에 다시 시도해 주세요.",
        scope: "초안과 문서의 식별자가 일치하지 않습니다.",
      }[kind],
      options,
    )
  }
}

function keyId(key: DraftKey): string {
  return JSON.stringify([key.owner, key.repository, key.userId, key.slug])
}

export interface DraftStoreOptions {
  readonly indexedDB?: IDBFactory
  readonly databaseName?: string
}

export function createDraftStore(options: DraftStoreOptions = {}): DraftStore {
  const factory = options.indexedDB ?? globalThis.indexedDB
  let closed = false
  const pending = new Set<Promise<void>>()
  const failures = new Map<string, unknown>()
  // Opening once also lets edits start transactions without repeatedly opening a connection.
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    if (!factory) {
      reject(new DraftStorageError("unavailable"))
      return
    }
    const request = factory.open(options.databaseName ?? "hyperaccel-onsite-drafts", 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onerror = () => reject(new DraftStorageError("unavailable", { cause: request.error }))
    request.onblocked = () => reject(new DraftStorageError("unavailable"))
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
  // Errors remain observable through operations, even if IndexedDB is blocked before the first edit.
  void database.catch(() => undefined)

  function transaction<T>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore, result: (value: T) => void) => void,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      let result: T
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => reject(new DraftStorageError("transaction", { cause: tx.error }))
      tx.onerror = () => reject(new DraftStorageError("transaction", { cause: tx.error }))
      operation(tx.objectStore(STORE), (value) => {
        result = value
      })
    })
  }
  async function connection(): Promise<IDBDatabase> {
    if (closed) throw new DraftStorageError("closed")
    return database
  }
  async function load(key: DraftKey): Promise<DraftSnapshot | null> {
    const db = await connection()
    return transaction(db, "readonly", (store, result) => {
      const request = store.get(keyId(draftKeySchema.parse(key)))
      request.onsuccess = () => {
        result(request.result === undefined ? null : draftSnapshotSchema.parse(request.result))
      }
    })
  }
  return {
    save(snapshot) {
      // Parse and clone before yielding: callers can keep editing this bundle immediately.
      const copy = structuredClone(draftSnapshotSchema.parse(snapshot))
      if (copy.bundle.slug !== copy.key.slug) return Promise.reject(new DraftStorageError("scope"))
      const id = keyId(copy.key)
      const write = connection().then((db) =>
        transaction<void>(db, "readwrite", (store, result) => {
          const request = store.get(id)
          request.onsuccess = () => {
            const previous =
              request.result === undefined ? null : draftSnapshotSchema.parse(request.result)
            if (!previous || copy.sequence > previous.sequence) store.put(copy, id)
            result(undefined)
          }
        }),
      )
      pending.add(write)
      void write.then(
        () => {
          pending.delete(write)
          failures.delete(id)
        },
        (error: unknown) => {
          pending.delete(write)
          failures.set(id, error)
        },
      )
      return write
    },
    load,
    async restore(key, remoteHeadSha): Promise<DraftRestore> {
      await this.flush()
      const snapshot = await load(key)
      if (!snapshot) return { status: "missing" }
      return snapshot.bundle.headSha === remoteHeadSha
        ? { status: "restored", snapshot }
        : { status: "conflict", snapshot, remoteHeadSha }
    },
    async list(scope) {
      const db = await connection()
      return transaction(db, "readonly", (store, result) => {
        const request = store.getAll()
        request.onsuccess = () => {
          const snapshots = draftSnapshotSchema.array().parse(request.result)
          result(
            snapshots
              .filter(
                ({ key }) =>
                  key.owner === scope.owner &&
                  key.repository === scope.repository &&
                  key.userId === scope.userId,
              )
              .sort((a, b) => b.savedAt - a.savedAt),
          )
        }
      })
    },
    async remove(key) {
      await this.flush()
      const db = await connection()
      await transaction<void>(db, "readwrite", (store, result) => {
        store.delete(keyId(key))
        result(undefined)
      })
    },
    async flush() {
      while (pending.size > 0) await Promise.all(pending)
      if (failures.size > 0)
        throw new DraftStorageError("transaction", { cause: failures.values().next().value })
    },
    close() {
      closed = true
      void database.then(
        (db) => db.close(),
        () => undefined,
      )
    },
  }
}
