import type { SiteServices } from "./contracts"

/** The header keeps logout reachable after the login page redirects home. */
export function mountAccount(services: SiteServices): void {
  const tools = document.querySelector(".tr-tools")
  if (!tools) return
  const button = document.createElement("button")
  button.type = "button"
  button.className = "tr-pill tr-session-logout"
  button.setAttribute("aria-label", "로그아웃")
  button.innerHTML =
    '<svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 4H4v16h5M14 7l5 5-5 5M8 12h11"/></svg>'
  const update = (): void => {
    const session = services.auth.getSession()
    button.hidden = session === null
    button.title = session ? `${session.login} · 로그아웃` : "로그아웃"
  }
  button.addEventListener("click", async () => {
    button.disabled = true
    try {
      await services.flush()
      services.auth.logout()
      window.location.assign("/")
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error
      button.disabled = false
      button.title = "작성 내용을 저장하지 못했습니다. 다시 로그아웃해 주세요."
      button.setAttribute("aria-label", button.title)
    }
  })
  tools.insertBefore(button, tools.querySelector(".tr-pill-careers"))
  services.onSession(update)
  update()
}
