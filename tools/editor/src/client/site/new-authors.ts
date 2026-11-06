import { z } from "zod"
import type { BundleFile, PostBundle } from "../../shared/onsite/document"
import type { AuthorProfileFields, NewAuthorProfile } from "../composer/author-profile"
import { authorProfileMarkdown } from "../composer/author-profile"

/**
 * Profiles of authors added in the editor but not yet merged into content/authors. They live
 * on this device until a post that names them is saved; that save commits the profile files.
 */
const profileSchema = z.object({
  name: z.string().min(1),
  github: z.string().min(1),
  githubId: z.number().int().positive(),
  image: z.string(),
  avatar: z.string().optional(),
  linkedin: z.string(),
  bio: z.object({ ko: z.string(), en: z.string() }),
})

function profileFiles(profile: NewAuthorProfile): BundleFile[] {
  return [
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
    ...(profile.avatar
      ? [
          {
            path: `content/authors/${profile.name}/avatar.webp`,
            encoding: "base64" as const,
            content: profile.avatar,
          },
        ]
      : []),
  ]
}

function withoutUndefinedAvatar({
  avatar,
  ...profile
}: z.infer<typeof profileSchema>): NewAuthorProfile {
  return avatar ? { ...profile, avatar } : profile
}

const editSchema = z.object({ profile: profileSchema, committed: z.array(z.string()) })

/**
 * The signed-in writer's changes to their own existing profile. Each post saved after the change
 * carries it once; the copy here is dropped when the site publishes the same profile.
 */
export class ProfileEdits {
  constructor(
    private readonly key: string,
    private readonly published: ReadonlyMap<string, AuthorProfileFields>,
  ) {}

  private read(): z.infer<typeof editSchema>[] {
    const raw = localStorage.getItem(this.key)
    const parsed = z.array(editSchema).safeParse(raw ? JSON.parse(raw) : [])
    if (!parsed.success) return []
    return parsed.data.filter(({ profile }) => {
      const site = this.published.get(profile.name)
      return !(
        site &&
        site.image === profile.image &&
        site.linkedin === profile.linkedin &&
        site.bio.ko === profile.bio.ko &&
        site.bio.en === profile.bio.en
      )
    })
  }

  list(): NewAuthorProfile[] {
    return this.read().map((entry) => withoutUndefinedAvatar(entry.profile))
  }

  remember(profile: NewAuthorProfile): void {
    const next = [
      ...this.read().filter((entry) => entry.profile.name !== profile.name),
      { profile, committed: [] },
    ]
    localStorage.setItem(this.key, JSON.stringify(next))
  }

  /** Profile files the post `slug` has not carried yet. */
  files(slug: string): BundleFile[] {
    return this.read()
      .filter((entry) => !entry.committed.includes(slug))
      .flatMap((entry) => profileFiles(withoutUndefinedAvatar(entry.profile)))
  }

  committed(slug: string): void {
    const next = this.read().map((entry) =>
      entry.committed.includes(slug) ? entry : { ...entry, committed: [...entry.committed, slug] },
    )
    localStorage.setItem(this.key, JSON.stringify(next))
  }
}

export class NewAuthors {
  constructor(
    private readonly key: string,
    private readonly known: readonly string[],
  ) {}

  list(): NewAuthorProfile[] {
    const raw = localStorage.getItem(this.key)
    const parsed = z.array(profileSchema).safeParse(raw ? JSON.parse(raw) : [])
    // Once the profile is on the site the stored copy is no longer needed.
    return parsed.success
      ? parsed.data
          .filter((profile) => !this.known.includes(profile.name))
          .map(withoutUndefinedAvatar)
      : []
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
      .flatMap(profileFiles)
  }
}
