import { z } from "zod"
import type { AuthSession } from "../../shared/onsite/auth"
import { CALLBACK_PATH, createAuthController, type OnsiteAuth } from "../auth"

const callbackSchema = z
  .object({
    type: z.literal("onsite:oauth-callback"),
    url: z.url(),
  })
  .strict()

export interface SiteAuthOptions {
  readonly clientId: string
  readonly exchangeUrl: string
  readonly apiBaseUrl: string
  readonly development: boolean
  readonly flushDrafts: () => Promise<void>
}

// Only one-use OAuth code/state cross this channel, never access tokens.
export function relayPopupCallback(): boolean {
  if (!window.opener || !location.search) return false
  const url = new URL(location.href)
  if (!url.searchParams.has("code") && !url.searchParams.has("error")) return false
  const opener: Window = window.opener
  opener.postMessage({ type: "onsite:oauth-callback", url: url.href }, url.origin)
  history.replaceState(null, "", CALLBACK_PATH)
  window.close()
  return true
}

export function createSiteAuth(options: SiteAuthOptions): {
  readonly auth: OnsiteAuth
  readonly onSession: (listener: (session: AuthSession | null) => void) => () => void
} {
  const listeners = new Set<(session: AuthSession | null) => void>()
  let callbackUrl: string | null = null
  let pending: {
    readonly popup: Window
    readonly done: PromiseWithResolvers<void>
    readonly timeout: ReturnType<typeof setTimeout>
  } | null = null
  const emit = (session: AuthSession | null): void => {
    for (const listener of listeners) listener(session)
  }
  const core = createAuthController({
    clientId: options.clientId,
    exchangeUrl: options.exchangeUrl,
    repository: { owner: "Hyper-Accel", name: "hyper-accel.github.io" },
    flushDrafts: options.flushDrafts,
    apiOrigin: options.apiBaseUrl,
    browser: {
      href: () => callbackUrl ?? location.href,
      navigate: (target) => {
        if (!pending) throw new Error("로그인 창이 닫혔습니다.")
        const url = new URL(target)
        const destination = options.development
          ? new URL(`/__dev/authorize${url.search}`, location.origin).href
          : url.href
        pending.popup.location.replace(destination)
      },
      replace: (target) => {
        if (callbackUrl) callbackUrl = null
        else history.replaceState(null, "", target)
      },
      sessionStorage,
      localStorage,
      events: window,
    },
  })
  function finish(error?: unknown): void {
    if (!pending) return
    const { popup, done, timeout } = pending
    pending = null
    callbackUrl = null
    clearTimeout(timeout)
    popup.close()
    if (error) done.reject(error)
    else done.resolve()
  }
  async function receive(event: MessageEvent<unknown>): Promise<void> {
    if (!pending || event.source !== pending.popup || event.origin !== location.origin) return
    const parsed = callbackSchema.safeParse(event.data)
    if (!parsed.success) return
    const target = new URL(parsed.data.url)
    if (target.origin !== location.origin || target.pathname !== CALLBACK_PATH) return
    callbackUrl = target.href
    try {
      const session = await core.handleCallback()
      if (!session) throw new Error("로그인 응답을 확인하지 못했습니다.")
      finish()
      emit(session)
    } catch (error: unknown) {
      finish(error)
    }
  }
  const onMessage = (event: MessageEvent<unknown>): void => {
    void receive(event)
  }
  window.addEventListener("message", onMessage)
  const beginLogin = async (): Promise<void> => {
    if (pending) return pending.done.promise
    if (!options.clientId || !options.exchangeUrl)
      throw new Error("GitHub App 로그인 환경 설정이 필요합니다.")
    const popup = window.open("about:blank", "onsite-editor-login", "popup,width=600,height=760")
    if (!popup) throw new Error("로그인 팝업을 허용한 뒤 다시 시도해 주세요.")
    const done = Promise.withResolvers<void>()
    pending = {
      popup,
      done,
      timeout: setTimeout(() => finish(new Error("로그인 요청이 만료되었습니다.")), 10 * 60 * 1000),
    }
    void core.beginLogin().catch(finish)
    return done.promise
  }
  return {
    auth: {
      ...core,
      beginLogin,
      async login() {
        await beginLogin()
        const session = core.getSession()
        if (!session) throw new Error("로그인 응답을 확인하지 못했습니다.")
        return session
      },
      logout() {
        core.logout()
        emit(null)
      },
      dispose() {
        finish(new Error("로그인 화면이 닫혔습니다."))
        window.removeEventListener("message", onMessage)
        listeners.clear()
        core.dispose()
      },
    },
    onSession(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
