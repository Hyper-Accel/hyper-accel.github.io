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
  /**
   * "relogin": the session-expired popup over the editor: no prompt text (the popup's title says
   * it), one GitHub button that logs in and goes back to editing. Errors still show.
   */
  readonly variant?: "page" | "relogin"
}

const GITHUB_MARK =
  "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"

function githubMark(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", "0 0 16 16")
  svg.setAttribute("width", "18")
  svg.setAttribute("height", "18")
  svg.setAttribute("fill", "currentColor")
  svg.setAttribute("aria-hidden", "true")
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
  path.setAttribute("d", GITHUB_MARK)
  svg.append(path)
  return svg
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
  const relogin = deps.variant === "relogin"
  if (relogin) {
    action.className = "auth-github"
    action.append(githubMark(), "로그인하고 편집 계속하기")
  } else action.textContent = "GitHub 로그인"
  let disposed = false
  function render(session: AuthSession | null): void {
    status.textContent = session
      ? session.canWrite
        ? `${session.login}님으로 로그인했습니다.`
        : "이 저장소에 글을 쓸 권한이 없습니다. 저장소 관리자에게 쓰기 권한을 요청해 주세요."
      : relogin
        ? ""
        : "GitHub 계정으로 로그인해 주세요. 작성 내용은 이 기기에 보관됩니다."
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
    if (!relogin)
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
