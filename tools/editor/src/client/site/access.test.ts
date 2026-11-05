import { expect, test } from "bun:test"
import { editAccess, editorIds } from "./access"

const ids = new Map([
  ["Seungbin Shin", 76479598],
  ["Donghyeon Choi", 93566126],
])

test("authors edit their own post, matched by GitHub user ID", () => {
  expect(editAccess({ authors: ["Donghyeon Choi"], editors: [], ids, userId: 93566126 })).toBe(
    "author",
  )
})

test("another account that takes an author's former login is not the author", () => {
  expect(editAccess({ authors: ["Donghyeon Choi"], editors: [], ids, userId: 1 })).toBe("read-only")
})

test("people the authors list under editors may edit but are not authors", () => {
  expect(
    editAccess({ authors: ["Seungbin Shin"], editors: [93566126], ids, userId: 93566126 }),
  ).toBe("editor")
  expect(editAccess({ authors: ["Seungbin Shin"], editors: [5], ids, userId: 93566126 })).toBe(
    "read-only",
  )
})

test.each([{ editors: [] }, { editors: [5] }])(
  "authors without a GitHub ID block editing even for listed editors %j",
  ({ editors }) => {
    expect(editAccess({ authors: ["Fixture Author"], editors, ids, userId: 5 })).toBe(
      "unlinked-author",
    )
  },
)

test("editors are read as user IDs; legacy logins are looked up and unknown ones grant nothing", async () => {
  const logins = new Map([["donghyunnn", 93566126]])
  const lookup = async (login: string): Promise<number | null> =>
    logins.get(login.toLowerCase()) ?? null
  expect(await editorIds([76479598, "130212029", "@DongHyunnn", "gone", 0, null], lookup)).toEqual([
    76479598, 130212029, 93566126,
  ])
  expect(await editorIds("DongHyunnn", lookup)).toEqual([])
})
