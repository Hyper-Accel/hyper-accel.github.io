import "../../../../assets/css/core/theme-vars.css"
import "./site.css"
import { relayPopupCallback } from "./site/auth"
import { createSiteServices } from "./site/services"
import { mountSiteShell } from "./site/shell"

export { parseSiteRoute, type SiteRoute } from "./site/routes"
export { mountSiteShell } from "./site/shell"

const root = document.querySelector<HTMLElement>("#app")
if (!root) throw new Error("Hosted editor requires #app")
if (relayPopupCallback()) {
  root.textContent = "로그인이 완료되었습니다. 편집기로 돌아갑니다."
} else {
  const services = await createSiteServices()
  mountSiteShell(root, services)
}
