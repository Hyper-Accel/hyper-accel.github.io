import { afterEach, expect, test } from "bun:test"
import { IDBFactory } from "fake-indexeddb"
import { postBundleSchema } from "../../shared/onsite/document"
import type { DraftSnapshot, DraftStore } from "../../shared/onsite/drafts"
import fixture from "../../shared/onsite/fixtures/image-layouts/bundle.json"
import { startFakeGitHub } from "../../testing/fake-github"
import { createAuthHarness } from "../auth/testing"
import { createDraftAutosave } from "./autosave"
import { createDraftStore } from "./store"

const stores: DraftStore[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})
function store(factory = new IDBFactory()): DraftStore {
  const result = createDraftStore({ indexedDB: factory })
  stores.push(result)
  return result
}
function snapshot(sequence = 1): DraftSnapshot {
  return {
    version: 1,
    key: {
      owner: "Hyper-Accel",
      repository: "hyper-accel.github.io",
      userId: 1,
      slug: "image-layouts",
    },
    bundle: {
      ...postBundleSchema.parse(fixture),
      images: [
        {
          status: "pending",
          path: "images/paste.webp",
          blob: new Blob([new Uint8Array([0, 255, 7, 3])], { type: "image/webp" }),
          mime: "image/webp",
        },
      ],
    },
    cursor: {
      language: "en",
      anchor: { blockId: "image-layouts-2", offset: 2 },
      focus: { blockId: "image-layouts-3", offset: 9 },
      scrollTop: 340,
    },
    sequence,
    savedAt: 1_800_000_000_000,
  }
}

test("stores a structured clone of the whole bundle including binary images", async () => {
  const drafts = store()
  const original = snapshot()
  const expected = structuredClone(original)
  const saved = drafts.save(original)
  original.bundle.ko.frontMatter.title = "later edit"
  await saved
  const restored = await drafts.load(original.key)
  expect(restored).toEqual(expected)
  const image = restored?.bundle.images[0]
  if (image?.status !== "pending") throw new Error("Pending image lost")
  expect([...new Uint8Array(await image.blob.arrayBuffer())]).toEqual([0, 255, 7, 3])
})

test("refuses older or equal sequences and isolates repository user and slug scopes", async () => {
  const drafts = store()
  const newer = snapshot(5)
  await Promise.all([drafts.save(newer), drafts.save(snapshot(2)), drafts.save(snapshot(5))])
  expect((await drafts.load(newer.key))?.sequence).toBe(5)
  expect(await drafts.load({ ...newer.key, userId: 2 })).toBeNull()
  expect(await drafts.list({ ...newer.key, repository: "other" })).toEqual([])
  expect(await drafts.list(newer.key)).toHaveLength(1)
})

test("returns conflict metadata without overwriting the saved remote baseline", async () => {
  const drafts = store()
  const saved = snapshot()
  await drafts.save(saved)
  expect(await drafts.restore(saved.key, saved.bundle.headSha)).toMatchObject({
    status: "restored",
  })
  expect(await drafts.restore(saved.key, "f".repeat(40))).toMatchObject({
    status: "conflict",
    snapshot: saved,
    remoteHeadSha: "f".repeat(40),
  })
  expect(await drafts.load(saved.key)).toEqual(saved)
})

test("restores after closing the connection and flushes lifecycle edits", async () => {
  const indexedDB = new IDBFactory()
  const first = store(indexedDB)
  const saved = snapshot()
  const document = new EventTarget()
  const window = new EventTarget()
  const errors: unknown[] = []
  const autosave = createDraftAutosave({
    store: first,
    key: saved.key,
    initialSequence: 0,
    document,
    window,
    now: () => saved.savedAt,
    onError: (error) => errors.push(error),
  })
  const write = autosave.update(saved.bundle, saved.cursor)
  document.dispatchEvent(new Event("visibilitychange"))
  window.dispatchEvent(new Event("pagehide"))
  await write
  await autosave.flush()
  autosave.dispose()
  first.close()
  const reopened = store(indexedDB)
  expect(await reopened.load(saved.key)).toEqual(saved)
  expect(errors).toEqual([])
  await reopened.remove(saved.key)
  expect(await reopened.restore(saved.key, null)).toEqual({ status: "missing" })
})

test("token expires mid-edit then re-login restores identical content images and cursor", async () => {
  let now = 1_800_000_000_000
  const fake = startFakeGitHub({ now: () => now })
  const drafts = store()
  const harness = createAuthHarness(
    fake,
    () => drafts.flush(),
    () => now,
  )
  try {
    await harness.auth.beginLogin()
    await harness.callback()
    const saved = snapshot()
    const autosave = createDraftAutosave({
      store: drafts,
      key: saved.key,
      initialSequence: 0,
      now: () => saved.savedAt,
      onError: (error) => {
        throw error
      },
    })
    await autosave.update(saved.bundle, saved.cursor)
    const expired = new Promise<void>((resolve) => {
      harness.auth.onReloginRequired(() => resolve())
    })
    now += 28_800_001
    expect(harness.auth.tokens.getAccessToken()).toBeNull()
    await expired
    await harness.auth.beginLogin()
    await harness.callback()
    const restored = await drafts.restore(saved.key, saved.bundle.headSha)
    expect(restored).toEqual({ status: "restored", snapshot: saved })
    if (restored.status !== "restored") throw new Error("Draft not restored")
    const image = restored.snapshot.bundle.images[0]
    if (image?.status !== "pending") throw new Error("Image not restored")
    expect([...new Uint8Array(await image.blob.arrayBuffer())]).toEqual([0, 255, 7, 3])
    const token = harness.auth.tokens.getAccessToken()
    expect(JSON.stringify(restored)).not.toContain(token ?? "missing-token")
    // The tab's sessionStorage holds the login only; the saved draft never carries the token.
    expect([...harness.sessionStorage.values].map(([key]) => key)).toEqual(["onsite:session"])
    autosave.dispose()
  } finally {
    harness.auth.dispose()
    fake.stop()
  }
})
