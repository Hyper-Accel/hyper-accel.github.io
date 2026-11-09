/**
 * Whether a post appears in the blog's lists. One kept out of them (`build: { list: never }`, like
 * the editor's example post) stays out of 작성 중인 글 too, and the editor never saves it.
 */
export function listedPost(frontMatter: Readonly<Record<string, unknown>>): boolean {
  const build = frontMatter["build"]
  return !(build && typeof build === "object" && "list" in build && build.list === "never")
}
