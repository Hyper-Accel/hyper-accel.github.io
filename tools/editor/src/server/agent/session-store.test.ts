import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentSessionStore } from "./session-store"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe("AgentSessionStore", () => {
  test("loads a saved chronological session after a new store instance starts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "techblog-session-store-"))
    directories.push(directory)
    const session = {
      id: "10000000-0000-4000-8000-000000000055",
      provider: "codex" as const,
      path: "content/posts/example/index.md",
      createdAt: "2026-08-27T10:00:00.000Z",
      updatedAt: "2026-08-27T10:01:00.000Z",
      entries: [
        {
          type: "user" as const,
          text: "도입부를 다듬어줘",
          at: "2026-08-27T10:00:00.000Z",
        },
        {
          type: "event" as const,
          event: { type: "tool" as const, label: "Read: index.md", status: "completed" as const },
          at: "2026-08-27T10:00:01.000Z",
        },
        {
          type: "event" as const,
          event: { type: "message" as const, text: "도입부를 수정했습니다." },
          at: "2026-08-27T10:00:02.000Z",
        },
      ],
    }

    await new AgentSessionStore(directory).save(session)

    const restarted = new AgentSessionStore(directory)
    expect(await restarted.get(session.id)).toEqual(session)
    expect(await restarted.list(session.path)).toEqual([
      {
        id: session.id,
        provider: "codex",
        path: session.path,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        preview: "도입부를 다듬어줘",
        entryCount: 3,
      },
    ])
  })

  test("sorts matching post sessions by most recent update", async () => {
    const directory = await mkdtemp(join(tmpdir(), "techblog-session-store-"))
    directories.push(directory)
    const store = new AgentSessionStore(directory)
    const base = {
      provider: "omo" as const,
      path: "content/posts/example/index.md",
      createdAt: "2026-08-27T10:00:00.000Z",
      entries: [],
    }
    await store.save({
      ...base,
      id: "10000000-0000-4000-8000-000000000056",
      updatedAt: "2026-08-27T10:01:00.000Z",
    })
    await store.save({
      ...base,
      id: "10000000-0000-4000-8000-000000000057",
      updatedAt: "2026-08-27T10:02:00.000Z",
    })

    expect((await store.list(base.path)).map((session) => session.id)).toEqual([
      "10000000-0000-4000-8000-000000000057",
      "10000000-0000-4000-8000-000000000056",
    ])
  })

  test("serializes concurrent saves and keeps the latest snapshot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "techblog-session-store-"))
    directories.push(directory)
    let releaseFirst: () => void = () => undefined
    let markFirstStarted: () => void = () => undefined
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const snapshots: string[] = []
    const store = new AgentSessionStore(directory, async (path, content) => {
      snapshots.push(JSON.parse(content).updatedAt)
      if (snapshots.length === 1) {
        markFirstStarted()
        await firstGate
      }
      return Bun.write(path, content)
    })
    const base = {
      id: "10000000-0000-4000-8000-000000000058",
      provider: "codex" as const,
      path: "content/posts/example/index.md",
      createdAt: "2026-08-27T10:00:00.000Z",
      entries: [],
    }

    const first = store.save({ ...base, updatedAt: "2026-08-27T10:01:00.000Z" })
    await firstStarted
    const second = store.save({ ...base, updatedAt: "2026-08-27T10:02:00.000Z" })
    await Promise.resolve()
    expect(snapshots).toEqual(["2026-08-27T10:01:00.000Z"])
    releaseFirst()
    await Promise.all([first, second])

    expect(snapshots).toEqual(["2026-08-27T10:01:00.000Z", "2026-08-27T10:02:00.000Z"])
    expect((await store.get(base.id))?.updatedAt).toBe("2026-08-27T10:02:00.000Z")
  })
})
