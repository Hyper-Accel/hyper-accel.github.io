import { Extension } from "@tiptap/core"
import { z } from "zod"
import { computeSnapshotHash } from "../../document/codec"
import type { PostBundle } from "../../shared/onsite/document"
import type { DraftCursor } from "../../shared/onsite/drafts"
import type { DraftPullRequest } from "../../shared/onsite/github"
import { createBlockExtensions } from "../blocks"
import { type ComposerHandle, mountComposer as mountLaneComposer } from "../composer"
import type { BlockExtensionContext } from "../composer/types"
import { createDraftAutosave, type DraftAutosave, mountDrafts } from "../drafts"
import { editAccess } from "./access"
import { SiteComments } from "./comments"
import type { SiteMount } from "./contracts"
import { observeEditorOcclusion } from "./editor-occlusion"
import type { Person } from "./mentions"
import { NewAuthors } from "./new-authors"
import { ImageLibrary, MobilePreview, type SidePanel } from "./panels"
import { prepareSiteImages } from "./renderer"
import { ReviewFlow } from "./review-flow"
import { draftAddress, parseSiteRoute } from "./routes"
import { EditorRegistry, SiteToolbox } from "./toolbox"

const peopleSchema = z.array(
  z.object({ name: z.string(), handle: z.string(), avatar: z.string().url().optional() }),
)

async function loadPeople(): Promise<readonly Person[]> {
  const response = await fetch("/editor/people.json")
  if (!response.ok) return []
  const parsed = peopleSchema.safeParse(await response.json())
  return parsed.success
    ? parsed.data.map((person) => ({
        name: person.name,
        handle: person.handle,
        ...(person.avatar ? { avatar: person.avatar } : {}),
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
  root.innerHTML = `<div data-site-controls><div data-recovery></div><p role="status" data-site-save-status></p><button type="button" data-site-save>GitHub에 저장</button></div><div data-composer></div>`
  const host = root.querySelector<HTMLElement>("[data-composer]")
  const status = root.querySelector<HTMLElement>("[data-site-save-status]")
  const recoveryRoot = root.querySelector<HTMLElement>("[data-recovery]")
  const saveButton = root.querySelector<HTMLButtonElement>("[data-site-save]")
  const saveControls = root.querySelector<HTMLElement>("[data-site-controls]")
  if (!host || !status || !recoveryRoot || !saveButton || !saveControls)
    throw new Error("Composer host is missing")
  saveButton.hidden = deps.bundle === null
  const initial = deps.bundle ?? deps.unpaired
  const initialImages = initial ? await prepareSiteImages(deps, initial) : null
  const newAuthors = new NewAuthors(
    `onsite:new-authors:${session.repository.owner}/${session.repository.name}`,
    deps.authors,
  )
  const [people, taxonomies] = await Promise.all([loadPeople(), loadTaxonomies()])
  // Editing is limited to the post's authors and the GitHub logins they list under `editors:`.
  // Posts whose authors have no GitHub handle on file stay open to every writer.
  const handles = new Map<string, string>([
    ...people.map((person): [string, string] => [person.name, person.handle]),
    ...newAuthors.list().map((profile): [string, string] => [profile.name, profile.github]),
  ])
  let readOnly: string | undefined
  let lockEditors = false
  if (deps.bundle) {
    const front = deps.bundle.ko.frontMatter
    const access = editAccess({
      authors: front.authors,
      editors: front["editors"],
      handles,
      login: session.login,
    })
    lockEditors = access === "editor"
    // Not an author or editor: the same editor, read-only, to comment and approve.
    if (access === "read-only") readOnly = "읽기 전용"
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
    const remoteSaved = remoteSnapshotHash !== null && remoteSnapshotHash === latest?.snapshotHash
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
  const saveRemote = (): Promise<DraftPullRequest> => {
    if (saving) return saving
    remoteSaving = true
    remoteError = null
    showSavedState()
    saving = (async () => {
      saveButton.disabled = true
      try {
        await flush()
        const bundle = latest
        if (!bundle) throw new Error("먼저 글 정보를 입력해 주세요.")
        const validation = deps.codec.validate(bundle, "save")
        if (validation.length) throw new Error(validation.map((issue) => issue.message).join("\n"))
        const serialized = await deps.codec.serialize(bundle)
        const pulls = await deps.github.listDrafts()
        if (!pulls.ok) throw new Error(pulls.error.message)
        const existing = pulls.value.find((pull) => pull.slug === bundle.slug)
        const pr = existing
          ? { ok: true as const, value: existing }
          : await deps.github.ensureDraftPR(bundle.slug, bundle.ko.frontMatter.title, [
              ...serialized.files,
              ...newAuthors.files(bundle),
            ])
        if (!pr.ok) throw new Error(pr.error.message)
        if (existing) {
          const readBack = await deps.github.loadBundle(bundle.slug)
          if (!readBack.ok) throw new Error(readBack.error.message)
          if (readBack.value.snapshotHash === serialized.snapshotHash) {
            remoteHead = readBack.value.headSha
          } else {
            if (!remoteHead || readBack.value.headSha !== remoteHead) {
              compareConflict("원격 글이 변경되었습니다. 저장 결과를 비교한 뒤 계속해 주세요.")
              throw new Error("원격 저장 기준이 변경되었습니다.")
            }
            const committed = await deps.github.commitBundle(bundle.slug, remoteHead, [
              ...serialized.files,
              ...newAuthors.files(bundle),
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
    people: loadPeople,
    bundle: () => composer?.getBundle() ?? latest,
    ensureSaved: async () => {
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
  saveButton.before(comments.countButton)
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
      ...people.map((person) => ({ name: person.name, handle: person.handle })),
      ...newAuthors.list().map((profile) => ({ name: profile.name, handle: profile.github })),
    ],
    tags: taxonomies.tags,
    series: taxonomies.series,
    currentLogin: session.login,
    onNewAuthor: (profile) => newAuthors.remember(profile),
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
  const languageObserver = new MutationObserver(syncLanguageSwitch)
  if (wrapper) {
    languageObserver.observe(wrapper, {
      attributes: true,
      attributeFilter: ["data-lang", "data-mode"],
    })
  }
  languageSwitch?.addEventListener("click", onLanguageSwitch)
  syncLanguageSwitch()
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
    languageObserver.disconnect()
    languageSwitch?.removeEventListener("click", onLanguageSwitch)
    if (languageSwitch) {
      languageSwitch.textContent = switchLabel
      languageSwitch.style.display = ""
    }
    headerObserver.disconnect()
    document.documentElement.style.removeProperty("--composer-sticky-top")
    document.documentElement.style.removeProperty("--composer-toolbox-height")
    document.body.style.removeProperty("--reading-offset")
    comments.dispose()
    toolbox.dispose()
    for (const panel of panels) panel.dispose()
    recovery?.dispose()
    autosave?.dispose()
    composer?.dispose()
    initialImages?.dispose()
  }
}
