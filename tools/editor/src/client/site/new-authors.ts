import { z } from "zod"
import type { BundleFile, PostBundle } from "../../shared/onsite/document"
import type { NewAuthorProfile } from "../composer/author-profile"
import { authorProfileMarkdown } from "../composer/author-profile"

/**
 * Profiles of authors added in the editor but not yet merged into content/authors. They live
 * on this device until a post that names them is saved; that save commits the profile files.
 */
const profileSchema = z.object({
  name: z.string().min(1),
  github: z.string().min(1),
  image: z.string(),
  linkedin: z.string(),
  bio: z.object({ ko: z.string(), en: z.string() }),
})

export class NewAuthors {
  constructor(
    private readonly key: string,
    private readonly known: readonly string[],
  ) {}

  list(): NewAuthorProfile[] {
    const raw = localStorage.getItem(this.key)
    const parsed = z.array(profileSchema).safeParse(raw ? JSON.parse(raw) : [])
    // Once the profile is on the site the stored copy is no longer needed.
    return parsed.success ? parsed.data.filter((profile) => !this.known.includes(profile.name)) : []
  }

  remember(profile: NewAuthorProfile): void {
    const next = [...this.list().filter((entry) => entry.name !== profile.name), profile]
    localStorage.setItem(this.key, JSON.stringify(next))
  }

  /** Profile files for the new authors this post names. */
  files(bundle: PostBundle): BundleFile[] {
    const named = new Set(bundle.ko.frontMatter.authors)
    return this.list()
      .filter((profile) => named.has(profile.name))
      .flatMap((profile) => [
        {
          path: `content/authors/${profile.name}/_index.md`,
          encoding: "utf-8" as const,
          content: authorProfileMarkdown(profile, "ko"),
        },
        {
          path: `content/authors/${profile.name}/_index.en.md`,
          encoding: "utf-8" as const,
          content: authorProfileMarkdown(profile, "en"),
        },
      ])
  }
}
