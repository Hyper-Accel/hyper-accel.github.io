import type { EditableParse, UnpairedBundle } from "../../document/repair"
import type { AuthSession, MemoryTokenProvider } from "../../shared/onsite/auth"
import type { DocumentCodec, PostBundle } from "../../shared/onsite/document"
import type { DraftRestore, DraftStore } from "../../shared/onsite/drafts"
import type { DraftPullRequest, GitHubAdapter } from "../../shared/onsite/github"
import type { OnsiteAuth } from "../auth"
import type { RepairStore } from "./repair-store"

export interface SiteDraft extends DraftPullRequest {
  readonly status?: "draft" | "review" | "approved"
  readonly updatedAt?: string
  readonly author?: string
}

export interface SiteServices {
  readonly auth: OnsiteAuth
  readonly tokens: MemoryTokenProvider
  readonly drafts: DraftStore
  readonly github: GitHubAdapter
  readonly codec: DocumentCodec
  readonly apiBaseUrl: string
  readonly frameStylesheets: readonly string[]
  readonly authors: readonly string[]
  readonly flush: () => Promise<void>
  readonly registerFlush: (flush: () => Promise<void>) => () => void
  readonly repairs: RepairStore
  readonly loadForEditing: (slug: string) => Promise<EditableParse>
  readonly isPublished: (slug: string, pullNumber: number) => Promise<boolean>
  readonly onSession: (listener: (session: AuthSession | null) => void) => () => void
  readonly dispose: () => Promise<void>
}

export interface SiteMountDeps extends SiteServices {
  readonly slug: string | null
  readonly bundle: PostBundle | null
  readonly unpaired: UnpairedBundle | null
  readonly repairSequence: number
  readonly repairLanguage: "ko" | "en"
  readonly repairScrollTop: number
  readonly restored: DraftRestore
  readonly navigate: (path: string) => void
  readonly onConflict: (message: string) => void
  readonly onAuthenticated: () => void
}

export type SiteMount = (
  root: HTMLElement,
  deps: SiteMountDeps,
) => undefined | (() => void) | Promise<undefined | (() => void)>

export interface SiteLaneModule {
  readonly mountLogin?: SiteMount
  readonly mountCallback?: SiteMount
  readonly mountComposer?: SiteMount
}
