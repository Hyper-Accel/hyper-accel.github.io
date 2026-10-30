import type { SiteDraft, SiteServices } from "./contracts"
import { draftStatus, relativeUpdatedTime } from "./drafts"
import { prepareSiteImages } from "./renderer"
import { editAddress, NEW_PATH } from "./routes"

type CardStatus = "local" | "draft" | "review" | "approved"
const STATUS_LABEL: Record<CardStatus, string> = {
  local: "이 기기에만",
  draft: "작성중",
  review: "리뷰중",
  approved: "승인됨",
}

interface CategoryLook {
  readonly title: string
  readonly style: string
}

interface CardInput {
  readonly slug: string
  readonly title: string
  readonly categories: readonly string[]
  readonly authors: readonly string[]
  readonly updated: string | undefined
  readonly status: CardStatus
  readonly cover?: string | undefined
}

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function parseCategories(raw: string | undefined): Map<string, CategoryLook> {
  const looks = new Map<string, CategoryLook>()
  if (!raw) return looks
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== "object") return looks
  for (const [key, value] of Object.entries(parsed)) {
    if (value && typeof value === "object" && "title" in value && "style" in value)
      looks.set(key, { title: String(value.title), style: String(value.style) })
  }
  return looks
}

/**
 * The home page's "작성 중인 글" shelf for a signed-in editor: the same cards as published posts,
 * with the draft's state tagged on the thumbnail. Readers never load this module.
 */
export async function mountHomeDrafts(root: HTMLElement, services: SiteServices): Promise<void> {
  const session = services.auth.getSession()
  const grid = root.querySelector<HTMLElement>("[data-drafts-grid]")
  if (!session || !grid) return
  const english = document.documentElement.lang.startsWith("en")
  const looks = parseCategories(root.dataset["categories"])
  // Published posts are edited on their own page; the home page lists their slugs.
  const publishedRaw: unknown = JSON.parse(root.dataset["published"] ?? "[]")
  const published = new Set(
    Array.isArray(publishedRaw) ? publishedRaw.filter((slug) => typeof slug === "string") : [],
  )
  const lookOf = (categories: readonly string[]): CategoryLook | undefined => {
    const term = categories[0]?.toLowerCase() ?? ""
    return looks.get(term) ?? looks.get(term.replace(/&/g, "and").replace(/[^a-z0-9가-힣]+/g, "-"))
  }

  const card = (input: CardInput): HTMLElement => {
    const isPublished = published.has(input.slug)
    const href = editAddress(input.slug, isPublished, english ? "en" : "ko")
    const look = lookOf(input.categories)
    const article = element("article", "tr-card tr-draft-card")
    article.dataset["slug"] = input.slug
    if (look) article.setAttribute("style", look.style)
    const media = element("a", "tr-card-media")
    media.href = href
    media.tabIndex = -1
    media.setAttribute("aria-hidden", "true")
    if (input.cover) {
      const image = element("img", "")
      image.src = input.cover
      image.alt = ""
      image.loading = "lazy"
      media.append(image)
    }
    const brand = element("span", "tr-card-brand", "HYPERACCEL ")
    brand.append(element("b", "", "TECH BLOG"))
    const state = element("span", "tr-draft-state", STATUS_LABEL[input.status])
    state.dataset["status"] = input.status
    media.append(brand, state)
    // Same split as layouts/partials/d/titleparts.html: "[Series - Part 01] Title".
    const parts = /^\[([^\]]+)\]\s*(.+)$/.exec(input.title)
    const kicker = element("p", "tr-card-kicker")
    if (look) kicker.append(element("span", "tr-cat", look.title))
    if (parts?.[1]) kicker.append(element("span", "tr-part", parts[1]))
    const title = element("h3", "tr-card-title")
    const link = element("a", "", parts?.[2] ?? (input.title || input.slug))
    link.href = href
    title.append(link)
    const meta = element(
      "p",
      "tr-card-meta",
      `${input.authors.join(", ") || "작성자 확인 불가"} · ${relativeUpdatedTime(input.updated)}`,
    )
    article.append(media, kicker, title, meta)
    return article
  }

  const create = element("a", "tr-draft-new")
  create.href = NEW_PATH
  create.append(element("span", "tr-draft-new-plus", "+"), element("span", "", "새 글"))
  grid.replaceChildren(create)
  root.hidden = false

  const cards = new Map<string, HTMLElement>()
  const place = (slug: string, next: HTMLElement): void => {
    const current = cards.get(slug)
    if (current) current.replaceWith(next)
    else grid.append(next)
    cards.set(slug, next)
  }
  const snapshots = await services.drafts.list({
    owner: session.repository.owner,
    repository: session.repository.name,
    userId: session.userId,
  })
  for (const snapshot of snapshots) {
    const matter = snapshot.bundle[english ? "en" : "ko"].frontMatter
    place(
      snapshot.key.slug,
      card({
        slug: snapshot.key.slug,
        title: matter.title || snapshot.bundle.ko.frontMatter.title,
        categories: snapshot.bundle.ko.frontMatter.categories ?? [],
        authors: snapshot.bundle.ko.frontMatter.authors,
        updated: new Date(snapshot.savedAt).toISOString(),
        status: "local",
      }),
    )
  }
  const result = await services.github.listDrafts()
  if (!result.ok) {
    const error = element("p", "tr-drafts-error", result.error.message)
    error.setAttribute("role", "alert")
    root.append(error)
    return
  }
  const drafts: readonly SiteDraft[] = result.value
  // Keep the list order while each draft's details arrive.
  for (const draft of drafts) {
    if (!cards.has(draft.slug)) {
      place(
        draft.slug,
        card({
          slug: draft.slug,
          title: draft.slug,
          categories: [],
          authors: draft.author ? [draft.author] : [],
          updated: draft.updatedAt,
          status: draftStatus(draft, undefined),
        }),
      )
    }
  }
  await Promise.all(
    drafts.map(async (draft) => {
      const loaded = await services.github.loadBundle(draft.slug)
      const pullState = await services.github.getPullState?.(draft.number)
      if (!loaded.ok) return
      const bundle = loaded.value
      const matter = bundle[english ? "en" : "ko"].frontMatter
      const coverField: unknown = bundle.ko.frontMatter["cover"]
      const coverPath =
        coverField && typeof coverField === "object" && "image" in coverField
          ? String(coverField.image)
          : undefined
      const cover = coverPath
        ? (await prepareSiteImages(services, bundle)).imageUrl(coverPath)
        : undefined
      place(
        draft.slug,
        card({
          slug: draft.slug,
          title: matter.title || bundle.ko.frontMatter.title,
          categories: bundle.ko.frontMatter.categories ?? [],
          authors: draft.author ? [draft.author] : bundle.ko.frontMatter.authors,
          updated: draft.updatedAt,
          status: draftStatus(draft, pullState),
          cover,
        }),
      )
    }),
  )
}
