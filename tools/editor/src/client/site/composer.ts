import { Extension } from "@tiptap/core"
import { z } from "zod"
import { computeSnapshotHash } from "../../document/codec"
import type { PostBundle } from "../../shared/onsite/document"
import type { DraftCursor } from "../../shared/onsite/drafts"
import type { DraftPullRequest, GitHubUser } from "../../shared/onsite/github"
import { createBlockExtensions } from "../blocks"
import { type ComposerHandle, mountComposer as mountLaneComposer } from "../composer"
import { h } from "../composer/dom"
import type { BlockExtensionContext } from "../composer/types"
import { createDraftAutosave, type DraftAutosave, mountDrafts } from "../drafts"
import { editAccess, editorIds } from "./access"
import { SiteChecks } from "./ci-status"
import { SiteComments } from "./comments"
import type { SiteMount } from "./contracts"
import { observeEditorOcclusion } from "./editor-occlusion"
import { mountHelp } from "./intro"
import type { Person } from "./mentions"
import { NewAuthors, ProfileEdits } from "./new-authors"
import { ImageLibrary, MobilePreview, type SidePanel } from "./panels"
import { prepareSiteImages } from "./renderer"
import { ReviewFlow } from "./review-flow"
import { draftAddress, parseSiteRoute } from "./routes"
import { EditorRegistry, SiteToolbox } from "./toolbox"

const peopleSchema = z.array(
  z.object({
    name: z.string(),
    handle: z.string(),
    id: z.number().int().positive().optional(),
    avatar: z.string().url().optional(),
    profile: z
      .object({
        image: z.string(),
        linkedin: z.string(),
        bio: z.object({ ko: z.string(), en: z.string() }),
      })
      .optional(),
  }),
)

async function loadPeople(): Promise<readonly Person[]> {
  const response = await fetch("/editor/people.json")
  if (!response.ok) return []
  const parsed = peopleSchema.safeParse(await response.json())
  return parsed.success
    ? parsed.data.map((person) => ({
        name: person.name,
        handle: person.handle,
        ...(person.id ? { id: person.id } : {}),
        ...(person.avatar ? { avatar: person.avatar } : {}),
        ...(person.profile ? { profile: person.profile } : {}),
      }))
    : []
}

const taxonomiesSchema = z.object({ tags: z.array(z.string()), series: z.array(z.string()) })

async function loadTaxonomies(): Promise<z.infer<typeof taxonomiesSchema>> {
  const response = await fetch("/editor/taxonomies.json")
  if (!response.ok) return { tags: [], series: [] }
  const parsed = taxonomiesSchema.safeParse(await response.json())
  return parsed.success ? parsed.data : { tags: [], series: [] }
}

export const mountComposer: SiteMount = async (root, deps) => {
  const session = deps.auth.getSession()
  if (!session) throw new Error("글을 편집할 권한이 없습니다.")
  // Someone without write access reads the same editor, read-only, to comment and approve.
  const reviewerOnly = !session.canWrite
  root.innerHTML = `<div data-site-controls><div data-recovery></div><p role="status" data-site-save-status></p><button type="button" data-site-save title="리뷰어가 볼 수 있게 GitHub 초안에 올립니다. 공개되지 않습니다.">GitHub에 저장</button></div><div data-composer></div>`
  const host = root.querySelector<HTMLElement>("[data-composer]")
  const status = root.querySelector<HTMLElement>("[data-site-save-status]")
  const recoveryRoot = root.querySelector<HTMLElement>("[data-recovery]")
  const saveButton = root.querySelector<HTMLButtonElement>("[data-site-save]")
  const saveControls = root.querySelector<HTMLElement>("[data-site-controls]")
  if (!host || !status || !recoveryRoot || !saveButton || !saveControls)
    throw new Error("Composer host is missing")
  saveButton.hidden = deps.bundle === null
  const initial = deps.bundle ?? deps.unpaired
  // Started before the pictures are prepared, and read once for the whole editor.
  const peopleLoad = loadPeople()
  const taxonomiesLoad = loadTaxonomies()
  const imagesLoad = initial ? prepareSiteImages(deps, initial) : Promise.resolve(null)
  const newAuthors = new NewAuthors(
    `onsite:new-authors:${session.repository.owner}/${session.repository.name}`,
    deps.authors,
  )
  // Editors are looked up alongside the profile lists, not after them: each lookup is a GitHub call,
  // so none is made for what is already known (the signed-in account, a profile in people.json, a
  // login just resolved).
  const signedIn = { login: session.login, id: session.userId }
  const resolved = new Map<number, GitHubUser>([[signedIn.id, signedIn]])
  const editorsLoad = initial
    ? editorIds(initial.ko.frontMatter["editors"], async (login) => {
        if (login.toLowerCase() === signedIn.login.toLowerCase()) return signedIn.id
        const user = await deps.github.getUser(login)
        if (!user.ok || !user.value) return null
        resolved.set(user.value.id, user.value)
        return user.value.id
      }).then(async (editors) => {
        const profiled = new Set((await peopleLoad).map((person) => person.id))
        return {
          editors,
          users: await Promise.all(
            editors.map(async (id) => {
              if (profiled.has(id)) return null
              const known = resolved.get(id)
              if (known) return known
              const user = await deps.github.getUserById(id)
              return user.ok ? user.value : null
            }),
          ),
        }
      })
    : Promise.resolve({ editors: [], users: [] })
  const [initialImages, people, taxonomies, editorLoad] = await Promise.all([
    imagesLoad,
    peopleLoad,
    taxonomiesLoad,
    editorsLoad,
  ])
  const profileEdits = new ProfileEdits(
    `onsite:profile-edits:${session.repository.owner}/${session.repository.name}`,
    new Map(people.flatMap((person) => (person.profile ? [[person.name, person.profile]] : []))),
  )
  // Editing is limited to the post's authors and the people they list under `editors:`.
  // Existing posts use repository profiles, never local author registrations.
  const ids = new Map(
    people.flatMap((person): [string, number][] =>
      person.id === undefined ? [] : [[person.name, person.id]],
    ),
  )
  let readOnly: string | undefined
  let lockEditors = false
  // Editors without an author profile, shown by their current login in the editor picker.
  let users: GitHubUser[] = []
  let accessNotice: HTMLElement | null = null
  if (initial) {
    const front = initial.ko.frontMatter
    const { editors } = editorLoad
    const profiled = new Set(ids.values())
    users = editorLoad.users.filter(
      (user): user is GitHubUser => user !== null && !profiled.has(user.id),
    )
    const access = editAccess({ authors: front.authors, editors, ids, userId: session.userId })
    lockEditors = access === "editor"
    // Not an author or editor: the same editor, read-only, to comment and approve.
    if (access === "read-only") readOnly = "읽기 전용"
    if (access === "unlinked-author") {
      readOnly = "읽기 전용"
      // A small closable note in the corner, clear of the post.
      const notice = h(
        "div",
        { class: "site-access-toast", role: "status", "data-author-access": "unlinked" },
        h(
          "p",
          {},
          "작성자 프로필에 github_id가 없어 편집할 수 없습니다. ",
          h(
            "a",
            {
              href: `https://github.com/${encodeURIComponent(session.repository.owner)}/${encodeURIComponent(session.repository.name)}/tree/main/content/authors`,
              target: "_blank",
              rel: "noopener noreferrer",
            },
            "작성자 프로필",
          ),
        ),
        h(
          "button",
          { type: "button", "aria-label": "안내 닫기", onclick: () => notice.remove() },
          "✕",
        ),
      )
      accessNotice = notice
      document.body.append(notice)
    }
  }
  if (reviewerOnly) readOnly = "읽기 전용"
  if (readOnly) saveButton.hidden = true
  let composer: ComposerHandle | undefined
  let flow: ReviewFlow | undefined
  let autosave: DraftAutosave | undefined
  let latest: PostBundle | null = deps.bundle
  let remoteHead = initial?.headSha ?? null
  let repairSequence = deps.repairSequence
  let repairPending = deps.unpaired !== null
  let revision = 0
  let disposed = false
  let touched = false
  let needsDraftAddress = deps.bundle === null && deps.unpaired === null
  let remoteSaving = false
  let remoteSnapshotHash: string | null = null
  let remoteError: string | null = null
  let recovery: { dispose(): void } | undefined
  const showSavedState = (): void => {
    // A profile change waiting for this post's next save also needs "GitHub에 저장".
    const remoteSaved =
      remoteSnapshotHash !== null &&
      remoteSnapshotHash === latest?.snapshotHash &&
      profileEdits.files(latest.slug).length === 0
    status.dataset["state"] = remoteSaving ? "saving" : "saved"
    status.dataset["remoteState"] = remoteSaving
      ? "saving"
      : remoteError
        ? "error"
        : remoteSaved
          ? "saved"
          : remoteSnapshotHash
            ? "dirty"
            : "local"
    status.textContent = remoteSaving
      ? "GitHub에 저장 중…"
      : remoteError
        ? `GitHub 저장 실패: ${remoteError}`
        : remoteSaved
          ? "GitHub에 저장됨"
          : remoteSnapshotHash
            ? "이 기기에 보관됨 · GitHub 저장 필요"
            : "이 기기에 보관됨"
  }
  const error = (value: unknown, remote = false): void => {
    const message = value instanceof Error ? value.message : "초안을 보관하지 못했습니다."
    if (remote) {
      remoteError = message
      showSavedState()
      status.dataset["state"] = "error"
      return
    }
    status.dataset["state"] = "error"
    status.textContent = message
  }
  const compareConflict = (message: string): void => {
    deps.onConflict(message)
    root.dispatchEvent(
      new CustomEvent("onsite:compare-conflict", { detail: latest?.slug, bubbles: true }),
    )
  }
  const ensureAutosave = (bundle: PostBundle): DraftAutosave => {
    if (autosave) return autosave
    const key = {
      owner: session.repository.owner,
      repository: session.repository.name,
      userId: session.userId,
      slug: bundle.slug,
    }
    autosave = createDraftAutosave({
      store: deps.drafts,
      key,
      initialSequence: deps.restored.status === "restored" ? deps.restored.snapshot.sequence : 0,
      onError: error,
    })
    if (needsDraftAddress) sessionStorage.setItem("onsite:new-draft", JSON.stringify(key))
    recovery = mountDrafts(recoveryRoot, {
      store: deps.drafts,
      key,
      remoteHeadSha: bundle.headSha,
      onRestore(snapshot) {
        if (touched || !composer) return
        if (latest?.snapshotHash !== snapshot.bundle.snapshotHash)
          composer.setBundle(snapshot.bundle)
        composer.setCursor(snapshot.cursor)
      },
      onConflict() {
        compareConflict("원격 글이 변경되었습니다. 보관된 초안을 비교해 주세요.")
      },
    })
    return autosave
  }
  const persist = async (bundle: PostBundle, cursor: DraftCursor | null): Promise<void> => {
    // A read-only post keeps no draft and offers no save.
    if (readOnly) return
    saveButton.hidden = false
    const current = ++revision
    touched = true
    status.dataset["state"] = "saving"
    if (remoteSaving) showSavedState()
    const snapshot = {
      ...bundle,
      headSha: remoteHead,
      snapshotHash: await computeSnapshotHash(bundle),
    }
    if (disposed || current !== revision) return
    latest = snapshot
    await ensureAutosave(snapshot).update(snapshot, cursor)
    if (disposed || current !== revision) return
    if (needsDraftAddress) {
      needsDraftAddress = false
      const here = parseSiteRoute(window.location)
      if (here.kind === "compose" && here.slug === null) {
        history.replaceState(null, "", draftAddress(snapshot.slug, window.location))
        const main = root.closest<HTMLElement>("#site-content")
        if (main) main.dataset["path"] = `${window.location.pathname}${window.location.search}`
      }
      sessionStorage.removeItem("onsite:new-draft")
    }
    if (repairPending) {
      await deps.repairs.flush()
      await deps.repairs.remove({
        owner: session.repository.owner,
        repository: session.repository.name,
        userId: session.userId,
        slug: snapshot.slug,
      })
      repairPending = false
      deps.onConflict("")
    }
    if (disposed || current !== revision) return
    status.dataset["revision"] = String(current)
    status.dataset["language"] = cursor?.language ?? ""
    status.dataset["anchor"] = String(cursor?.anchor.offset ?? "")
    status.dataset["focus"] = String(cursor?.focus.offset ?? "")
    status.dataset["selection"] =
      cursor && cursor.anchor.offset !== cursor.focus.offset ? "range" : "caret"
    showSavedState()
  }
  const persistRepair = async (): Promise<void> => {
    if (readOnly) return
    const unpaired = composer?.getUnpaired()
    if (!unpaired) return
    repairSequence += 1
    status.dataset["state"] = "saving"
    await deps.repairs.save({
      type: "repair",
      version: 1,
      key: {
        owner: session.repository.owner,
        repository: session.repository.name,
        userId: session.userId,
        slug: unpaired.slug,
      },
      unpaired,
      sequence: repairSequence,
      language:
        host.querySelector<HTMLElement>(".composer")?.dataset["lang"] === "en" ? "en" : "ko",
      scrollTop: Math.max(0, window.scrollY),
    })
    status.dataset["state"] = "saved"
    status.dataset["repairSequence"] = String(repairSequence)
    status.textContent = "짝 맞춤 작업을 이 기기에 보관함"
  }
  const flush = async (): Promise<void> => {
    await persistRepair()
    const bundle = composer?.getBundle()
    if (bundle) await persist(bundle, composer?.getCursor() ?? null)
    await autosave?.flush()
    await deps.repairs.flush()
  }
  let saving: Promise<DraftPullRequest> | null = null
  const saveRemote = (purpose?: "review"): Promise<DraftPullRequest> => {
    if (readOnly) return Promise.reject(new Error("읽기 전용 글은 저장할 수 없습니다."))
    if (saving) return purpose === "review" ? saving.then(() => saveRemote("review")) : saving
    remoteSaving = true
    remoteError = null
    showSavedState()
    saving = (async () => {
      saveButton.disabled = true
      try {
        await flush()
        let bundle = latest
        if (!bundle) throw new Error("먼저 글 정보를 입력해 주세요.")
        if (purpose === "review") {
          const prepared = {
            ...bundle,
            ko: { ...bundle.ko, frontMatter: { ...bundle.ko.frontMatter, draft: false } },
            en: { ...bundle.en, frontMatter: { ...bundle.en.frontMatter, draft: false } },
          }
          const issues = deps.codec.validate(prepared, "review")
          if (issues.length) throw new Error(issues.map((issue) => issue.message).join("\n"))
          await composer?.setDraft(false)
          bundle = latest ?? prepared
        }
        const validation = deps.codec.validate(bundle, "save")
        if (validation.length) throw new Error(validation.map((issue) => issue.message).join("\n"))
        const serialized = await deps.codec.serialize(bundle)
        const profileFiles = profileEdits.files(bundle.slug)
        const pulls = await deps.github.listDrafts()
        if (!pulls.ok) throw new Error(pulls.error.message)
        const existing = pulls.value.find((pull) => pull.slug === bundle.slug)
        const pr = existing
          ? { ok: true as const, value: existing }
          : await deps.github.ensureDraftPR(bundle.slug, bundle.ko.frontMatter.title, [
              ...serialized.files,
              ...newAuthors.files(bundle),
              ...profileFiles,
            ])
        if (!pr.ok) throw new Error(pr.error.message)
        if (existing) {
          const readBack = await deps.github.loadBundle(bundle.slug)
          if (!readBack.ok) throw new Error(readBack.error.message)
          if (readBack.value.snapshotHash === serialized.snapshotHash && !profileFiles.length) {
            remoteHead = readBack.value.headSha
          } else {
            if (!remoteHead || readBack.value.headSha !== remoteHead) {
              compareConflict("원격 글이 변경되었습니다. 저장 결과를 비교한 뒤 계속해 주세요.")
              throw new Error("원격 저장 기준이 변경되었습니다.")
            }
            const committed = await deps.github.commitBundle(bundle.slug, remoteHead, [
              ...serialized.files,
              ...newAuthors.files(bundle),
              ...profileFiles,
            ])
            if (!committed.ok) {
              if (committed.error.kind === "conflict") compareConflict(committed.error.message)
              throw new Error(committed.error.message)
            }
            remoteHead = committed.value.headSha
          }
        } else {
          const readBack = await deps.github.loadBundle(bundle.slug)
          if (!readBack.ok || readBack.value.snapshotHash !== serialized.snapshotHash) {
            compareConflict("원격 저장 내용을 확인하지 못했습니다. 다시 불러와 비교해 주세요.")
            throw new Error("저장 결과를 다시 확인해야 합니다.")
          }
          remoteHead = pr.value.headSha
        }
        if (!remoteHead) throw new Error("원격 저장 커밋을 확인하지 못했습니다.")
        if (profileFiles.length) profileEdits.committed(bundle.slug)
        if (disposed) return { ...pr.value, headSha: remoteHead }
        await flush()
        sessionStorage.removeItem("onsite:new-draft")
        history.replaceState(null, "", draftAddress(bundle.slug, window.location))
        const main = root.closest<HTMLElement>("#site-content")
        if (main) main.dataset["path"] = `${window.location.pathname}${window.location.search}`
        status.dataset["remoteHead"] = remoteHead
        remoteSnapshotHash = serialized.snapshotHash
        remoteSaving = false
        showSavedState()
        void flow?.refresh()
        void comments.refresh().catch(error)
        void checks.refresh()
        return { ...pr.value, headSha: remoteHead }
      } finally {
        remoteSaving = false
        saveButton.disabled = false
        saving = null
      }
    })()
    return saving
  }
  const comments = new SiteComments({
    github: deps.github,
    codec: deps.codec,
    people: () => peopleLoad,
    bundle: () => composer?.getBundle() ?? latest,
    ensureSaved: async () => {
      if (readOnly) {
        const pulls = await deps.github.listDrafts()
        if (!pulls.ok) throw new Error(pulls.error.message)
        const pr = pulls.value.find((pull) => pull.slug === initial?.slug)
        if (!pr) throw new Error("댓글을 남길 리뷰 요청을 찾지 못했습니다.")
        return { number: pr.number, headSha: pr.headSha }
      }
      const pr = await saveRemote()
      return { number: pr.number, headSha: pr.headSha }
    },
    findPull: async () => {
      const slug = latest?.slug ?? deps.bundle?.slug
      if (!slug) return null
      const pulls = await deps.github.listDrafts()
      if (!pulls.ok) return null
      const pr = pulls.value.find((pull) => pull.slug === slug)
      return pr ? { number: pr.number, headSha: remoteHead ?? pr.headSha } : null
    },
  })
  const checks = new SiteChecks({ github: deps.github, head: () => remoteHead })
  const registry = new EditorRegistry()
  let blockContext: BlockExtensionContext | null = null
  const panels: SidePanel[] = []
  const onPanelOpen = (opened: SidePanel): void => {
    for (const panel of panels) if (panel !== opened) panel.close()
  }
  const currentBundle = (): PostBundle | null => composer?.getBundle() ?? latest
  const library = new ImageLibrary({
    bundle: currentBundle,
    context: () => blockContext,
    registry,
    onOpen: onPanelOpen,
  })
  const preview = new MobilePreview({
    codec: deps.codec,
    stylesheets: deps.frameStylesheets,
    bundle: currentBundle,
    language: () =>
      host.querySelector<HTMLElement>(".composer")?.dataset["lang"] === "en" ? "en" : "ko",
    context: () => blockContext,
    onOpen: onPanelOpen,
  })
  panels.push(library, preview)
  const toolbox = new SiteToolbox({
    registry,
    context: () => blockContext,
    panels: [library.toggle, preview.toggle],
  })
  host.before(toolbox.element)
  // Nothing can be inserted into a post the writer may not edit.
  toolbox.element.hidden = readOnly !== undefined
  function captureSelection(): void {
    if (!root.contains(document.activeElement)) return
    const bundle = composer?.getBundle()
    if (bundle) void persist(bundle, composer?.getCursor() ?? null).catch(error)
  }
  composer = mountLaneComposer(host, {
    saveControls,
    bundle: deps.bundle,
    unpaired: deps.unpaired,
    cursor: deps.restored.status === "restored" ? deps.restored.snapshot.cursor : null,
    authors: [...deps.authors, ...newAuthors.list().map((profile) => profile.name)],
    people: [
      ...people.map((person) => {
        // A change made here and not yet published is what the writer sees when editing again.
        const edited = profileEdits.list().find((profile) => profile.name === person.name)
        const profile = edited
          ? { image: edited.image, linkedin: edited.linkedin, bio: edited.bio }
          : person.profile
        return {
          name: person.name,
          handle: person.handle,
          ...(person.id ? { id: person.id } : {}),
          ...(profile ? { profile } : {}),
        }
      }),
      ...newAuthors.list().map((profile) => ({
        name: profile.name,
        handle: profile.github,
        id: profile.githubId,
      })),
    ],
    tags: taxonomies.tags,
    series: taxonomies.series,
    currentLogin: session.login,
    currentUserId: session.userId,
    users,
    resolveUser: async (login) => {
      const user = await deps.github.getUser(login)
      if (!user.ok) throw new Error(user.error.message)
      return user.value
    },
    onNewAuthor: (profile) => newAuthors.remember(profile),
    onProfileEdit: (profile) => {
      profileEdits.remember(profile)
      saveButton.hidden = false
      showSavedState()
    },
    ...(readOnly ? { readOnly } : {}),
    ...(lockEditors ? { lockEditors } : {}),
    onComment: (editor) => comments.start(editor),
    blockExtensions: (context) => {
      blockContext = context
      return [
        ...createBlockExtensions(context),
        comments.extension,
        registry.extension,
        library.extension,
        Extension.create({
          name: "onsiteDraftSelection",
          onSelectionUpdate: captureSelection,
        }),
      ]
    },
    resolveImage: (path) => initialImages?.imageUrl(path),
    onChange: (change) => {
      for (const panel of panels) panel.refresh()
      return persist(composer?.getBundle() ?? change.bundle, change.cursor)
    },
  })
  if (deps.bundle) ensureAutosave(deps.bundle)
  if (deps.bundle?.headSha) void comments.refresh().catch(error)
  // Review lives in the editor's dock: request review / publish for the post's authors, 승인 for
  // anyone else (beside the read-only notice).
  if (deps.bundle) {
    flow = new ReviewFlow({
      role: readOnly ? "reviewer" : "author",
      github: deps.github,
      bundle: () => composer?.getBundle() ?? latest,
      validate: deps.codec.validate,
      isPublished: deps.isPublished,
      ...(readOnly ? {} : { save: saveRemote }),
      status: (text) => {
        status.textContent = text
      },
    })
    const dockButton = host.querySelector<HTMLElement>('button[data-action="request-review"]')
    if (dockButton) dockButton.replaceWith(flow.element)
    else host.querySelector(".composer-readonly")?.after(flow.element)
    void flow.refresh()
  }
  let help: HTMLButtonElement | undefined
  const syncHelp = (): void => {
    const dock = host.querySelector(".composer-dock")
    if (!dock) return
    help ??= mountHelp(readOnly ? "reviewer" : "author", root)
    if (help.parentElement !== dock) dock.prepend(help)
    if (comments.countButton.parentElement !== dock) help.after(comments.countButton)
    if (checks.button.parentElement !== dock) comments.countButton.after(checks.button)
  }
  // The site header's language pill switches the editing language, like reading /en/.
  const wrapper = host.querySelector<HTMLElement>(".composer")
  const languageSwitch = document.querySelector<HTMLAnchorElement>(".tr-header [data-lang-switch]")
  const switchLabel = languageSwitch?.textContent ?? ""
  const switchName = languageSwitch?.getAttribute("aria-label") ?? ""
  const syncLanguageSwitch = (): void => {
    if (!languageSwitch || !wrapper) return
    const mode = wrapper.dataset["mode"]
    languageSwitch.style.display = mode === "form" ? "none" : ""
    // The round button reads "En" toward English and "한" toward Korean; its name stays spelled out.
    const toKorean = wrapper.dataset["lang"] === "en"
    const editing = mode === "edit"
    languageSwitch.textContent = editing ? (toKorean ? "한" : "En") : switchLabel
    const name = editing ? (toKorean ? "한국어" : "English") : switchName
    languageSwitch.setAttribute("aria-label", name)
    languageSwitch.setAttribute("title", name)
  }
  const onLanguageSwitch = (event: MouseEvent): void => {
    if (wrapper?.dataset["mode"] !== "edit") return
    event.preventDefault()
    const next = wrapper.dataset["lang"] === "en" ? "ko" : "en"
    host.querySelector<HTMLButtonElement>(`.composer-tab[data-lang="${next}"]`)?.click()
  }
  const composerObserver = new MutationObserver(() => {
    syncLanguageSwitch()
    syncHelp()
  })
  if (wrapper) {
    composerObserver.observe(wrapper, {
      attributes: true,
      attributeFilter: ["data-lang", "data-mode"],
      childList: true,
    })
  }
  languageSwitch?.addEventListener("click", onLanguageSwitch)
  syncLanguageSwitch()
  syncHelp()
  const headerObserver = observeEditorOcclusion(toolbox.element)
  if (deps.unpaired) {
    const tab = host.querySelector<HTMLButtonElement>(
      `.composer-tab[data-lang="${deps.repairLanguage}"]`,
    )
    tab?.click()
    window.scrollTo(0, deps.repairScrollTop)
    void persistRepair().catch(error)
  }
  const selection = captureSelection
  document.addEventListener("selectionchange", selection)
  root.addEventListener("focusin", selection)
  root.addEventListener("keyup", selection)
  root.addEventListener("mouseup", selection)
  const onLanguage = (event: MouseEvent): void => {
    const operation =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-op][data-lang]")
        : null
    const wrapper = host.querySelector<HTMLElement>(".composer")
    if (operation && wrapper) wrapper.dataset["lang"] = operation.dataset["lang"] ?? "ko"
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[role=tab][data-lang]")
        : null
    const cursor = composer?.getCursor()
    if (button && cursor) {
      const language = button.dataset["lang"] === "en" ? "en" : "ko"
      composer?.setCursor({ ...cursor, language })
      selection()
    }
    if (composer?.getUnpaired()) void persistRepair().catch(error)
  }
  root.addEventListener("click", onLanguage)
  const onSave = (): void => {
    void saveRemote().catch((value: unknown) => error(value, true))
  }
  saveButton.addEventListener("click", onSave)
  const unregister = deps.registerFlush(flush)
  return () => {
    disposed = true
    flow?.dispose()
    unregister()
    document.removeEventListener("selectionchange", selection)
    root.removeEventListener("focusin", selection)
    root.removeEventListener("keyup", selection)
    root.removeEventListener("mouseup", selection)
    root.removeEventListener("click", onLanguage)
    saveButton.removeEventListener("click", onSave)
    composerObserver.disconnect()
    languageSwitch?.removeEventListener("click", onLanguageSwitch)
    if (languageSwitch) {
      languageSwitch.textContent = switchLabel
      languageSwitch.style.display = ""
    }
    headerObserver.disconnect()
    document.documentElement.style.removeProperty("--composer-sticky-top")
    document.documentElement.style.removeProperty("--composer-toolbox-height")
    document.body.style.removeProperty("--reading-offset")
    accessNotice?.remove()
    comments.dispose()
    checks.dispose()
    toolbox.dispose()
    for (const panel of panels) panel.dispose()
    recovery?.dispose()
    autosave?.dispose()
    composer?.dispose()
    initialImages?.dispose()
  }
}
