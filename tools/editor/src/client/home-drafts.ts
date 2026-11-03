// Loaded on the blog home only for returning editors (assets/js/editor-entry.js).
import "./site/home-drafts.css"
import { mountAccount } from "./site/account"
import { mountHomeDrafts } from "./site/home-drafts"
import { createSiteServices } from "./site/services"

const root = document.querySelector<HTMLElement>("[data-editor-drafts]")
if (root) {
  const services = await createSiteServices()
  mountAccount(services)
  await mountHomeDrafts(root, services)
}
