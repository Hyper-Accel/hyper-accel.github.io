/**
 * Who may edit a post in the editor: its authors (by the `github_id:` in their profile) and
 * the people listed under `editors:`. Logins can be renamed and reused, so both are matched by
 * the numeric GitHub user ID. Authors without an ID must be fixed in the repository before
 * anyone may edit their post.
 */
export type EditAccess = "author" | "editor" | "read-only" | "unlinked-author"

export function editAccess(input: {
  readonly authors: readonly string[]
  /** User IDs from `editors:`, legacy login entries already resolved. */
  readonly editors: readonly number[]
  /** Author name to GitHub user ID. */
  readonly ids: ReadonlyMap<string, number>
  readonly userId: number
}): EditAccess {
  const authorIds = input.authors.flatMap((name) => input.ids.get(name) ?? [])
  if (authorIds.length === 0) return "unlinked-author"
  if (authorIds.includes(input.userId)) return "author"
  return input.editors.includes(input.userId) ? "editor" : "read-only"
}

/**
 * The user IDs in a post's `editors:`. Posts saved before IDs were used list logins; those are
 * looked up as they are now, and an entry that cannot be looked up grants nothing.
 */
export async function editorIds(
  value: unknown,
  lookup: (login: string) => Promise<number | null>,
): Promise<number[]> {
  const entries: readonly unknown[] = Array.isArray(value) ? value : []
  const ids = await Promise.all(
    entries.map(async (entry): Promise<number | null> => {
      if (typeof entry === "number") return Number.isInteger(entry) && entry > 0 ? entry : null
      if (typeof entry !== "string") return null
      if (/^\d+$/.test(entry)) return Number(entry)
      return lookup(entry.replace(/^@/, ""))
    }),
  )
  return ids.filter((id): id is number => id !== null)
}
