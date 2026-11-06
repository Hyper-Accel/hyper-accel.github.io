import { expect, test } from "bun:test"
import { listedPost } from "./listed"

test("a post kept out of the blog's lists is kept out of 작성 중인 글", () => {
  expect(listedPost({ title: "Post" })).toBe(true)
  expect(listedPost({ build: { list: "always" } })).toBe(true)
  expect(listedPost({ build: { list: "never" }, robotsNoIndex: true })).toBe(false)
})
