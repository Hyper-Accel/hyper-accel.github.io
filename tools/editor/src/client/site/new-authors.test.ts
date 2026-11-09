import { beforeEach, expect, test } from "bun:test"
import type { NewAuthorProfile } from "../composer/author-profile"
import { ProfileEdits } from "./new-authors"

const values = new Map<string, string>()
beforeEach(() => {
  values.clear()
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
})

const published = { image: "/authors/jaewoo-kim/a.jpg", linkedin: "", bio: { ko: "옛", en: "Old" } }
const edited: NewAuthorProfile = {
  name: "Jaewoo Kim",
  github: "JustinKim98",
  githubId: 86652601,
  ...published,
  bio: { ko: "새 소개", en: "New bio" },
}
const paths = (edits: ProfileEdits, slug: string): string[] =>
  edits.files(slug).map((file) => file.path)

test("each post carries a profile change once until the site publishes it", () => {
  const edits = new ProfileEdits("key", new Map([["Jaewoo Kim", published]]))
  edits.remember(edited)
  expect(paths(edits, "first")).toEqual([
    "content/authors/Jaewoo Kim/_index.md",
    "content/authors/Jaewoo Kim/_index.en.md",
  ])
  edits.committed("first")
  expect(paths(edits, "first")).toEqual([])
  expect(paths(edits, "second")).toHaveLength(2)
  // Once the site shows the same profile, the copy on this device is gone.
  const live = new ProfileEdits("key", new Map([["Jaewoo Kim", { ...published, bio: edited.bio }]]))
  expect(live.list()).toEqual([])
  expect(paths(live, "second")).toEqual([])
})
