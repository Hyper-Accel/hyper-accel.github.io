import type { UnpairedBundle } from "../../document/repair"
import { type PostBundle, slugSchema } from "../../shared/onsite/document"
import { type DraftRestore, draftKeySchema } from "../../shared/onsite/drafts"
import type { SiteMountDeps, SiteServices } from "./contracts"
import { loadSiteMount } from "./modules"
import { compareRecovery, type RecoverySnapshot, saveRecoveryChoice } from "./recovery"
import { draftAddress, parseSiteRoute } from "./routes"

export function mountSiteShell(
  root: HTMLElement,
  services: SiteServices,
  loadMount: typeof loadSiteMount = loadSiteMount,
): () => void {
  root.innerHTML = `
    <div class="site-editor">
      <p id="site-session" class="site-session" role="status" hidden></p>
      <aside id="site-conflict" role="alert" hidden></aside>
      <div id="site-content" tabindex="-1"><h1></h1><div id="site-screen"></div></div>
      <dialog aria-labelledby="site-login-title">
        <h2 id="site-login-title">다시 로그인해 주세요</h2>
        <p>작성중인 내용은 이 기기에 보관됩니다. 로그인 후 계속 편집할 수 있습니다.</p>
        <div id="site-login"></div>
        <button type="button" id="site-login-close">편집 계속하기</button>
      </dialog>
    </div>`
  const main = root.querySelector<HTMLElement>("#site-content")
  const screen = root.querySelector<HTMLElement>("#site-screen")
  const heading = root.querySelector("h1")
  const session = root.querySelector<HTMLElement>("#site-session")
  const conflict = root.querySelector<HTMLElement>("#site-conflict")
  const dialog = root.querySelector("dialog")
  const loginRoot = root.querySelector<HTMLElement>("#site-login")
  const close = root.querySelector<HTMLButtonElement>("#site-login-close")
  if (!main || !screen || !heading || !session || !conflict || !dialog || !loginRoot || !close) {
    throw new Error("Hosted shell elements are missing")
  }
  let dispose: (() => void) | undefined
  let disposeLogin: (() => void) | undefined
  let controller = new AbortController()
  let disposed = false
  let loginPending = false
  let restoreCurrent: ((remoteSlug?: string) => Promise<void>) | undefined
  let restoreFocus: (() => void) | undefined
  const navigate = (address: string): void => {
    window.location.assign(address)
  }
  function showConflict(message: string): void {
    if (!conflict) return
    conflict.hidden = message.length === 0
    conflict.textContent = message
  }
  function updateSession(): void {
    if (!session) return
    const current = services.auth.getSession()
    session.textContent = current
      ? `${current.login} · ${current.canWrite ? "편집 권한 확인됨" : "읽기 전용"}`
      : "로그인이 필요합니다."
    session.hidden = true
  }
  const deps = (): SiteMountDeps => ({
    ...services,
    slug: null,
    bundle: null,
    unpaired: null,
    repairSequence: 0,
    repairLanguage: "ko",
    repairScrollTop: 0,
    restored: { status: "missing" },
    navigate,
    onConflict: showConflict,
    onAuthenticated: () => {
      updateSession()
      // Editors start where readers do: the blog home, with their drafts on top.
      window.location.assign("/")
    },
  })
  async function showRelogin(): Promise<void> {
    if (disposed || loginPending || dialog?.open) return
    loginPending = true
    const focused = document.activeElement
    const selection = document.getSelection()
    const ranges = selection
      ? Array.from({ length: selection.rangeCount }, (_, index) =>
          selection.getRangeAt(index).cloneRange(),
        )
      : []
    const input =
      focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement
        ? {
            start: focused.selectionStart,
            end: focused.selectionEnd,
            direction: focused.selectionDirection,
          }
        : null
    const scroll = { x: window.scrollX, y: window.scrollY }
    restoreFocus = () => {
      if (!(focused instanceof HTMLElement) || !focused.isConnected) return
      focused.focus({ preventScroll: true })
      if (
        input &&
        input.start !== null &&
        input.end !== null &&
        (focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement)
      ) {
        focused.setSelectionRange(input.start, input.end, input.direction ?? undefined)
      } else if (selection && ranges.length) {
        selection.removeAllRanges()
        for (const range of ranges) selection.addRange(range)
      }
      window.scrollTo(scroll.x, scroll.y)
    }
    try {
      await services.flush()
      const mount = await loadMount("mountLogin")
      if (disposed || !dialog || !loginRoot) return
      disposeLogin?.()
      const cleanup = await mount(loginRoot, {
        ...deps(),
        onAuthenticated: () => {
          dialog.close()
          restoreFocus?.()
          // Logged in again: the expiry notice and the failed request's error go away.
          showConflict("")
          updateSession()
          if (restoreCurrent) void restoreCurrent().catch(reportError)
          else void render().catch(reportError)
        },
      })
      disposeLogin = cleanup || undefined
      if (!session) return
      session.textContent = "로그인이 만료되었습니다. 작성중인 내용은 이 기기에 보관됩니다."
      const retry = document.createElement("button")
      retry.type = "button"
      retry.textContent = "다시 로그인"
      retry.addEventListener("click", () => {
        void showRelogin()
      })
      session.append(" ", retry)
      session.hidden = false
      if (!disposed) dialog.showModal()
    } catch (error: unknown) {
      reportError(error)
    } finally {
      loginPending = false
    }
  }
  function reportError(error: unknown): void {
    showConflict(error instanceof Error ? error.message : "화면을 불러오지 못했습니다.")
  }
  async function render(): Promise<void> {
    controller.abort()
    controller = new AbortController()
    const signal = controller.signal
    await services.flush()
    if (signal.aborted) return
    dispose?.()
    dispose = undefined
    restoreCurrent = undefined
    if (!main || !screen || !heading || !conflict) return
    conflict.hidden = true
    delete screen.dataset["issue"]
    const route = parseSiteRoute(window.location)
    main.dataset["route"] = route.kind
    document.body.classList.toggle("reading-page", route.kind === "compose")
    main.dataset["path"] = `${window.location.pathname}${window.location.search}`
    updateSession()
    screen.replaceChildren()
    const titles = {
      compose: route.kind === "compose" && route.slug ? "글 쓰기" : "새 글",
      login: "로그인",
      callback: "로그인 확인",
      notFound: "페이지를 찾을 수 없습니다",
    }
    heading.textContent = titles[route.kind]
    heading.hidden = false
    document.title = `${heading.textContent} | HyperAccel Blog Editor`
    main.focus()
    if (route.kind === "notFound") {
      screen.innerHTML = '<a href="/">홈으로 돌아가기</a>'
      return
    }
    if (route.kind === "compose" && !services.auth.getSession()) {
      screen.innerHTML = "<p>계속하려면 로그인해 주세요.</p>"
      await showRelogin()
      if (signal.aborted || !services.auth.getSession()) return
    }
    let bundle: PostBundle | null = null
    let unpaired: UnpairedBundle | null = null
    let repairSequence = 0
    let repairLanguage: "ko" | "en" = "ko"
    let repairScrollTop = 0
    let restored: DraftRestore = { status: "missing" }
    const applyRecovery = (snapshot: RecoverySnapshot): void => {
      if ("type" in snapshot) {
        unpaired = snapshot.unpaired
        bundle = null
        restored = { status: "missing" }
        repairSequence = snapshot.sequence
        repairLanguage = snapshot.language
        repairScrollTop = snapshot.scrollTop
        screen.dataset["issue"] = "pairing"
      } else {
        bundle = snapshot.bundle
        unpaired = null
        restored = { status: "restored", snapshot }
        delete screen.dataset["issue"]
      }
      showConflict("")
    }
    const chooseRecovery = async (
      local: RecoverySnapshot,
      remote: PostBundle | UnpairedBundle,
    ): Promise<boolean> => {
      const choice = await compareRecovery(screen, { local, remote }, signal)
      if (!choice || signal.aborted) return false
      applyRecovery(await saveRecoveryChoice(services, { local, remote, choice }))
      screen.dataset["recoveryResolution"] = choice
      return true
    }
    let slug = route.kind === "compose" ? route.slug : null
    if (slug) sessionStorage.removeItem("onsite:new-draft")
    if (route.kind === "compose" && !slug) {
      const current = services.auth.getSession()
      const raw = sessionStorage.getItem("onsite:new-draft")
      if (raw && current) {
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch (error: unknown) {
          if (!(error instanceof SyntaxError)) throw error
        }
        const key = draftKeySchema.safeParse(parsed)
        if (
          key.success &&
          key.data.userId === current.userId &&
          key.data.owner === current.repository.owner &&
          key.data.repository === current.repository.name
        ) {
          restored = await services.drafts.restore(key.data, null)
          if (restored.status === "restored") {
            bundle = restored.snapshot.bundle
            slug = bundle.slug
            history.replaceState(null, "", draftAddress(slug, window.location))
            main.dataset["path"] = `${window.location.pathname}${window.location.search}`
            sessionStorage.removeItem("onsite:new-draft")
          }
        }
      }
    }
    if (route.kind === "compose" && slug && !bundle) {
      const current = services.auth.getSession()
      if (current) {
        const snapshot = await services.drafts.load({
          owner: current.repository.owner,
          repository: current.repository.name,
          userId: current.userId,
          slug,
        })
        if (signal.aborted) return
        if (snapshot?.bundle.headSha === null) {
          restored = { status: "restored", snapshot }
          bundle = snapshot.bundle
        }
      }
    }
    if (slug && !bundle) {
      screen.textContent = "글을 불러오는 중…"
      const loaded = await services.loadForEditing(slug)
      if (signal.aborted) return
      if (loaded.kind === "error") {
        showConflict(loaded.issues.map((issue) => issue.message).join("\n"))
        return
      }
      if (loaded.kind === "bundle") bundle = loaded.bundle
      else {
        unpaired = loaded.unpaired
        showConflict(loaded.issue.message)
        screen.dataset["issue"] = "pairing"
      }
      const remoteHead = loaded.kind === "bundle" ? loaded.bundle.headSha : loaded.unpaired.headSha
      const remote = loaded.kind === "bundle" ? loaded.bundle : loaded.unpaired
      const current = services.auth.getSession()
      if (current) {
        const key = {
          owner: current.repository.owner,
          repository: current.repository.name,
          userId: current.userId,
          slug,
        }
        restored = await services.drafts.restore(key, remoteHead)
        if (signal.aborted) return
        if (restored.status === "conflict") {
          if (!(await chooseRecovery(restored.snapshot, remote))) return
        } else if (restored.status === "restored") {
          applyRecovery(restored.snapshot)
        } else {
          const saved = await services.repairs.load(key)
          if (saved) {
            if (saved.unpaired.headSha !== remoteHead) {
              if (!(await chooseRecovery(saved, remote))) return
            } else applyRecovery(saved)
          }
        }
      }
    }
    if (signal.aborted) return
    const name =
      route.kind === "compose"
        ? "mountComposer"
        : route.kind === "callback"
          ? "mountCallback"
          : "mountLogin"
    const mount = await loadMount(name)
    if (signal.aborted) return
    const mountRoot = document.createElement("div")
    screen.replaceChildren(mountRoot)
    const cleanup = await mount(mountRoot, {
      ...deps(),
      slug,
      bundle,
      unpaired,
      repairSequence,
      repairLanguage,
      repairScrollTop,
      restored,
    })
    if (signal.aborted) {
      cleanup?.()
      return
    }
    dispose = cleanup || undefined
    // The English page of a post opens on the English text.
    if (route.kind === "compose" && route.language === "en")
      mountRoot.querySelector<HTMLButtonElement>('.composer-tab[data-lang="en"]')?.click()
    const editorSession = services.auth.getSession()
    let comparing = false
    // Keep the current editor until an explicit choice, then flush and dispose it
    // before recording that choice so an old autosave cannot replace the selection.
    restoreCurrent = async (remoteSlug) => {
      if (comparing || signal.aborted) return
      comparing = true
      mountRoot.inert = true
      try {
        await services.flush()
        const current = services.auth.getSession()
        const currentRoute = parseSiteRoute(window.location)
        const currentSlug =
          remoteSlug ?? (currentRoute.kind === "compose" ? (currentRoute.slug ?? slug) : slug)
        if (!currentSlug || !current) return
        if (current.userId !== editorSession?.userId) {
          await render()
          return
        }
        const key = {
          owner: current.repository.owner,
          repository: current.repository.name,
          userId: current.userId,
          slug: currentSlug,
        }
        const local = await services.drafts.load(key)
        if (local?.bundle.headSha === null && !remoteSlug) return
        const loaded = await services.loadForEditing(currentSlug)
        if (signal.aborted) return
        if (loaded.kind === "error") {
          showConflict(loaded.issues.map((issue) => issue.message).join("\n"))
          return
        }
        const remoteHead =
          loaded.kind === "bundle" ? loaded.bundle.headSha : loaded.unpaired.headSha
        const savedRepair = await services.repairs.load(key)
        const result = await services.drafts.restore(key, remoteHead)
        if (signal.aborted) return
        const conflicting =
          result.status === "conflict"
            ? result.snapshot
            : savedRepair && savedRepair.unpaired.headSha !== remoteHead
              ? savedRepair
              : null
        if (conflicting) {
          const comparison = document.createElement("div")
          screen.prepend(comparison)
          try {
            const remote = loaded.kind === "bundle" ? loaded.bundle : loaded.unpaired
            const choice = await compareRecovery(comparison, { local: conflicting, remote }, signal)
            if (!choice || signal.aborted) return
            await services.flush()
            if (signal.aborted) return
            dispose?.()
            dispose = undefined
            await saveRecoveryChoice(services, { local: conflicting, remote, choice })
            screen.dataset["recoveryResolution"] = choice
            if (currentRoute.kind === "compose" && !currentRoute.slug) {
              history.replaceState(null, "", draftAddress(currentSlug, window.location))
            }
            await render()
          } finally {
            comparison.remove()
          }
          return
        }
        mountRoot.dispatchEvent(
          new CustomEvent("onsite:draft-restored", { detail: result, bubbles: true }),
        )
      } finally {
        mountRoot.inert = false
        comparing = false
      }
    }
    const onCompare = (event: Event): void => {
      const parsed = slugSchema.safeParse(event instanceof CustomEvent ? event.detail : null)
      if (parsed.success) void restoreCurrent?.(parsed.data).catch(reportError)
    }
    mountRoot.addEventListener("onsite:compare-conflict", onCompare)
    const disposeMount = dispose
    dispose = () => {
      mountRoot.removeEventListener("onsite:compare-conflict", onCompare)
      disposeMount?.()
    }
    const resolution = screen.dataset["recoveryResolution"]
    if (resolution) {
      const notice = document.createElement("p")
      notice.dataset["recoveryResolution"] = resolution
      notice.setAttribute("role", "status")
      notice.textContent =
        resolution === "use-remote"
          ? "명시적으로 선택한 원격 내용으로 이 기기의 초안을 교체했습니다."
          : "이 기기의 내용을 현재 원격 커밋을 기준으로 이어서 편집합니다."
      screen.prepend(notice)
    }
  }
  const onRoute = (): void => {
    void render().catch(reportError)
  }
  const onRelogin = (): void => {
    void showRelogin()
  }
  const onClose = (): void => dialog.close()
  close.addEventListener("click", onClose)
  const onDialogClose = (): void => restoreFocus?.()
  dialog.addEventListener("close", onDialogClose)
  const unsubscribe = services.auth.onReloginRequired(onRelogin)
  const unsubscribeSession = services.onSession(() => updateSession())
  const onWindowFocus = (): void => updateSession()
  window.addEventListener("focus", onWindowFocus)
  onRoute()
  return () => {
    disposed = true
    controller.abort()
    dispose?.()
    disposeLogin?.()
    unsubscribe()
    unsubscribeSession()
    window.removeEventListener("focus", onWindowFocus)
    dialog.close()
    close.removeEventListener("click", onClose)
    dialog.removeEventListener("close", onDialogClose)
    document.body.classList.remove("reading-page")
  }
}
