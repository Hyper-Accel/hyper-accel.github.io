/**
 * Who may edit a post in the editor: its authors (by the GitHub handle in their profile) and
 * the GitHub logins listed under `editors:`. Unlinked authors must be fixed in the repository
 * before anyone may edit their post.
 */
export type EditAccess = "author" | "editor" | "read-only" | "unlinked-author"

export function editAccess(input: {
  readonly authors: readonly string[]
  readonly editors: unknown
  /** Author name to GitHub handle. */
  readonly handles: ReadonlyMap<string, string>
  readonly login: string
}): EditAccess {
  const login = input.login.toLowerCase()
  const authorHandles = input.authors.flatMap(
    (name) => input.handles.get(name)?.toLowerCase() ?? [],
  )
  if (authorHandles.length === 0) return "unlinked-author"
  if (authorHandles.includes(login)) return "author"
  const editors = (Array.isArray(input.editors) ? input.editors : [])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.replace(/^@/, "").toLowerCase())
  return editors.includes(login) ? "editor" : "read-only"
}
