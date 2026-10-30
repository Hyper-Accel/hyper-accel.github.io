import ky, { HTTPError } from "ky"
import { z } from "zod"
import { documentCodec, type EditableParse, parseForEditing } from "../../document"
import { FONTS_STYLESHEET } from "../blocks/text-style"
import { createDraftStore } from "../drafts"
import { createGitHubAdapter } from "../github"
import { createSiteAuth } from "./auth"
import type { SiteServices } from "./contracts"
import { createPublicationServices } from "./publication"
import { createRepairStore } from "./repair-store"

const configSchema = z.object({
  development: z.literal(true),
  clientId: z.string().min(1),
  apiBaseUrl: z.url(),
  exchangeUrl: z.url(),
})

export async function createSiteServices(): Promise<SiteServices> {
  let config = {
    development: false,
    clientId: import.meta.env["VITE_EDITOR_GITHUB_CLIENT_ID"] ?? "",
    apiBaseUrl: "https://api.github.com",
    exchangeUrl: import.meta.env["VITE_EDITOR_TOKEN_EXCHANGE_URL"] ?? "",
  }
  if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
    try {
      config = configSchema.parse(await ky.get("/__site/config", { retry: 0 }).json())
    } catch (error: unknown) {
      if (!(error instanceof HTTPError)) throw error
    }
  }
  const drafts = createDraftStore()
  const repairs = createRepairStore()
  const editing = new Map<string, EditableParse>()
  const codec = {
    ...documentCodec,
    async parse(input: Parameters<typeof documentCodec.parse>[0]) {
      const parsed = await parseForEditing(input)
      editing.set(input.slug, parsed)
      if (parsed.kind === "bundle")
        return { ok: true as const, bundle: parsed.bundle, migratedLegacy: parsed.migratedLegacy }
      return {
        ok: false as const,
        issues: parsed.kind === "repair" ? [parsed.issue] : parsed.issues,
      }
    },
  }
  const flushers = new Set<() => Promise<void>>()
  const flush = async (): Promise<void> => {
    for (const save of flushers) await save()
    await drafts.flush()
    await repairs.flush()
  }
  const { auth, onSession } = createSiteAuth({ ...config, flushDrafts: flush })
  const publication = createPublicationServices({
    apiBaseUrl: config.apiBaseUrl,
    siteBaseUrl: location.origin,
    apiFetch: auth.fetch,
  })
  // One adapter per application, not per auth session. Its unresolved mutations
  // and ETags survive re-authentication; auth.fetch handles 401 invalidation.
  const github = createGitHubAdapter({
    owner: "Hyper-Accel",
    repository: "hyper-accel.github.io",
    tokenProvider: auth.tokens,
    expiresAt: () => auth.getSession()?.expiresAt ?? 0,
    fetch: Object.assign(auth.fetch, { preconnect: globalThis.fetch.preconnect }),
    baseUrl: config.apiBaseUrl,
    codec,
  })
  const manifest = z
    .record(z.string(), z.object({ file: z.string() }))
    .parse(await ky.get("/editor/manifest.json", { retry: 0 }).json())
  const stylesheet = manifest["preview.css"]
  if (!stylesheet) throw new Error("Compiled site preview stylesheet is missing")
  const authors = z
    .array(z.string().min(1))
    .min(1)
    .parse(await ky.get("/editor/authors.json", { retry: 0 }).json())
  return {
    auth,
    tokens: auth.tokens,
    drafts,
    github,
    codec,
    repairs,
    async loadForEditing(slug) {
      editing.delete(slug)
      const loaded = await github.loadBundle(slug)
      const parsed = editing.get(slug)
      if (parsed) return parsed
      if (loaded.ok) return { kind: "bundle", bundle: loaded.value, migratedLegacy: false }
      return { kind: "error", issues: [{ code: "legacy", message: loaded.error.message }] }
    },
    apiBaseUrl: config.apiBaseUrl,
    onSession,
    // The font menu's web fonts, so styled text reads the same in review and mobile preview.
    frameStylesheets: [
      new URL(`/editor/${stylesheet.file}`, location.origin).href,
      FONTS_STYLESHEET,
    ],
    authors,
    flush,
    registerFlush(save) {
      flushers.add(save)
      return () => {
        flushers.delete(save)
      }
    },
    async isPublished(slug, pullNumber) {
      if (config.development) {
        return z
          .object({ published: z.boolean() })
          .parse(await ky.get(`/__dev/published/${slug}`, { retry: 0 }).json()).published
      }
      return publication.isPublished(slug, pullNumber)
    },
    async dispose() {
      await flush()
      auth.dispose()
      drafts.close()
      await repairs.close()
    },
  }
}
