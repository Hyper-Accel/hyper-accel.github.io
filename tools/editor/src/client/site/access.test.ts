import { expect, test } from "bun:test"
import { editAccess } from "./access"

const handles = new Map([
  ["Seungbin Shin", "seungbinshin"],
  ["Donghyeon Choi", "DongHyunnn"],
])

test("authors edit their own post, matched by GitHub handle in any case", () => {
  expect(
    editAccess({ authors: ["Donghyeon Choi"], editors: [], handles, login: "donghyunnn" }),
  ).toBe("author")
})

test("people the authors list under editors may edit but are not authors", () => {
  expect(
    editAccess({
      authors: ["Seungbin Shin"],
      editors: ["@DongHyunnn"],
      handles,
      login: "DongHyunnn",
    }),
  ).toBe("editor")
})

test("everyone else sees the post read-only", () => {
  expect(
    editAccess({ authors: ["Seungbin Shin"], editors: ["someone"], handles, login: "DongHyunnn" }),
  ).toBe("read-only")
  expect(
    editAccess({ authors: ["Seungbin Shin"], editors: "DongHyunnn", handles, login: "DongHyunnn" }),
  ).toBe("read-only")
})

test.each([{ editors: [] }, { editors: ["anyone"] }])(
  "unlinked authors block editing even for listed editors %j",
  ({ editors }) => {
    expect(editAccess({ authors: ["Fixture Author"], editors, handles, login: "anyone" })).toBe(
      "unlinked-author",
    )
  },
)

test("a matching handle on a different author's profile does not grant access", () => {
  expect(
    editAccess({ authors: ["Seungbin Shin"], editors: [], handles, login: "DongHyunnn" }),
  ).toBe("read-only")
})
