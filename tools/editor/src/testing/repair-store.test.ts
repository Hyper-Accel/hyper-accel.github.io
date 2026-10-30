import { expect, test } from "bun:test"
import { IDBFactory } from "fake-indexeddb"
import { createRepairStore, type RepairSnapshot } from "../client/site/repair-store"
import { fixtureBundles } from "../shared/onsite/fixtures"

test("repair snapshots preserve unequal blocks, binary images and scope across reopen", async () => {
  const fixture = fixtureBundles[0]
  if (!fixture) throw new Error("Missing bundle fixture")
  const factory = new IDBFactory()
  const first = createRepairStore(factory)
  const snapshot: RepairSnapshot = {
    type: "repair",
    version: 1,
    sequence: 2,
    language: "en",
    scrollTop: 100,
    key: { owner: "Hyper-Accel", repository: "blog", userId: 1, slug: fixture.slug },
    unpaired: {
      slug: fixture.slug,
      headSha: "a".repeat(40),
      ko: { ...fixture.ko, blocks: ["한국어 첫째", "한국어 둘째"] },
      en: { ...fixture.en, blocks: ["English first"] },
      images: [
        {
          status: "pending",
          path: "images/paste.webp",
          mime: "image/webp",
          blob: new Blob([new Uint8Array([1, 255, 3])]),
        },
      ],
    },
  }
  await Promise.all([
    first.save(snapshot),
    first.save({ ...snapshot, sequence: 1, language: "ko" }),
  ])
  await first.flush()
  await first.close()
  const second = createRepairStore(factory)
  try {
    const restored = await second.load(snapshot.key)
    expect(restored?.sequence).toBe(2)
    expect(restored?.language).toBe("en")
    expect(restored?.unpaired.ko.blocks).toEqual(["한국어 첫째", "한국어 둘째"])
    expect(restored?.unpaired.en.blocks).toEqual(["English first"])
    const image = restored?.unpaired.images[0]
    if (image?.status !== "pending") throw new Error("Pending repair image missing")
    expect(Array.from(new Uint8Array(await image.blob.arrayBuffer()))).toEqual([1, 255, 3])
    expect(await second.load({ ...snapshot.key, userId: 2 })).toBeNull()
    await second.remove(snapshot.key)
    expect(await second.load(snapshot.key)).toBeNull()
  } finally {
    await second.close()
  }
})
