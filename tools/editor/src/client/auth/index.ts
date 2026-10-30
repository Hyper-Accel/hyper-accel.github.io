import type { AuthSession } from "../../shared/onsite/auth"
import { AuthError, type OnsiteAuth } from "./controller"

export type { AuthOptions, OnsiteAuth } from "./controller"
export {
  AuthError,
  CALLBACK_PATH,
  createAuthController,
  isReturningEditor,
} from "./controller"

export interface AuthMountDependencies {
  readonly auth: OnsiteAuth
  readonly onSession: (session: AuthSession | null) => void | Promise<void>
}

/** Uses the host's button/theme styles; never replaces the writing surface. */
export function mountAuth(root: HTMLElement, deps: AuthMountDependencies): { dispose(): void } {
  const status = document.createElement("p")
  status.setAttribute("role", "status")
  status.setAttribute("aria-live", "polite")
  const action = document.createElement("button")
  action.type = "button"
  const logout = document.createElement("button")
  logout.type = "button"
  logout.textContent = "로그아웃"
  root.replaceChildren(status, action, logout)
  let disposed = false
  function render(session: AuthSession | null): void {
    status.textContent = session
      ? session.canWrite
        ? `${session.login}님으로 로그인했습니다.`
        : "이 저장소에 글을 쓸 권한이 없습니다. 저장소 관리자에게 쓰기 권한을 요청해 주세요."
      : "GitHub 계정으로 로그인해 주세요. 작성 내용은 이 기기에 보관됩니다."
    action.textContent = "GitHub 로그인"
    action.hidden = session !== null
    logout.hidden = session === null
  }
  async function publish(session: AuthSession | null): Promise<void> {
    if (disposed) return
    render(session)
    await deps.onSession(session)
  }
  const unsubscribe = deps.auth.onReloginRequired(() => {
    render(null)
    status.textContent =
      "로그인이 만료되었습니다. 다시 로그인하면 작성 중인 내용을 이어갈 수 있습니다."
    void deps.onSession(null)
  })
  async function login(): Promise<void> {
    action.disabled = true
    status.textContent = "GitHub 로그인을 준비하고 있습니다."
    try {
      await deps.auth.beginLogin()
    } catch (error) {
      if (!disposed) {
        status.textContent =
          error instanceof AuthError
            ? error.message
            : "작성 내용 저장 또는 로그인에 실패했습니다. 다시 시도해 주세요."
      }
    } finally {
      if (!disposed) action.disabled = false
    }
  }
  function signOut(): void {
    deps.auth.logout()
    void publish(null)
  }
  action.addEventListener("click", login)
  logout.addEventListener("click", signOut)
  render(deps.auth.getSession())
  action.disabled = true
  void deps.auth
    .handleCallback()
    .then(async (session) => {
      // A login this tab already holds (sessionStorage) counts like a fresh one.
      const current = session ?? deps.auth.getSession()
      if (current) await publish(current)
    })
    .catch((error: unknown) => {
      if (!disposed)
        status.textContent =
          error instanceof AuthError ? error.message : "로그인에 실패했습니다. 다시 시도해 주세요."
    })
    .finally(() => {
      if (!disposed) action.disabled = false
    })
  return {
    dispose() {
      disposed = true
      unsubscribe()
      action.removeEventListener("click", login)
      logout.removeEventListener("click", signOut)
      root.replaceChildren()
    },
  }
}
