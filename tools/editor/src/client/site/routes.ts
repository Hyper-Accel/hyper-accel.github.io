export type Language = "ko" | "en"

export type SiteRoute =
  | { readonly kind: "login" | "callback" | "notFound" }
  | { readonly kind: "compose"; readonly slug: string | null; readonly language: Language }

/** Login (and the OAuth callback) has its own page. */
export const LOGIN_PATH = "/editor-login/"
/** New posts and drafts that are not published yet. */
export const NEW_PATH = "/editor-new/"

const SLUG = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/
const POST = /^\/(?:(en)\/)?posts\/([^/]+)\/$/

/**
 * The editor has no address of its own: a published post is edited on its page (?edit), a new
 * post or an unpublished draft on /editor-new/ (?draft=<slug>). Review happens in that same editor,
 * so an older ?review=<PR number> address opens it too.
 */
export function parseSiteRoute(location: {
  readonly pathname: string
  readonly search: string
}): SiteRoute {
  const params = new URLSearchParams(location.search)
  if (location.pathname === LOGIN_PATH)
    return params.has("code") || params.has("error") ? { kind: "callback" } : { kind: "login" }
  const post = POST.exec(location.pathname)
  const language: Language = post?.[1] === "en" ? "en" : "ko"
  let slug: string | null
  if (location.pathname === NEW_PATH) {
    slug = params.get("draft")
    if (slug !== null && !SLUG.test(slug)) return { kind: "notFound" }
  } else if (post?.[2] && SLUG.test(post[2]) && (params.has("edit") || params.has("review"))) {
    slug = post[2]
  } else return { kind: "notFound" }
  return { kind: "compose", slug, language }
}

/** Where a post is edited: its own page once published, /editor-new/ before that. */
export function editAddress(slug: string, published: boolean, language: Language = "ko"): string {
  return published
    ? `${language === "en" ? "/en" : ""}/posts/${slug}/?edit`
    : `${NEW_PATH}?draft=${slug}`
}

/** This editing page, now for `slug` (a new post that has just been given its address). */
export function draftAddress(slug: string, here: { readonly pathname: string }): string {
  return here.pathname === NEW_PATH ? `${NEW_PATH}?draft=${slug}` : `${here.pathname}?edit`
}
