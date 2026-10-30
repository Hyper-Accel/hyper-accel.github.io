/**
 * Who may edit a post in the editor: its authors (by the GitHub handle in their profile) and
 * the GitHub logins listed under `editors:`. Posts whose authors have no handle on file stay
 * open, since nobody could be recognised as their author.
 */
export type EditAccess = "author" | "editor" | "read-only"

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
  if (authorHandles.length === 0 || authorHandles.includes(login)) return "author"
  const editors = (Array.isArray(input.editors) ? input.editors : [])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.replace(/^@/, "").toLowerCase())
  return editors.includes(login) ? "editor" : "read-only"
}
