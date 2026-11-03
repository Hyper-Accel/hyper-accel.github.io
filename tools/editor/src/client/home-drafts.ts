// Loaded on the blog home only for returning editors (assets/js/editor-entry.js).
import "./site/home-drafts.css"
import { mountHomeDrafts } from "./site/home-drafts"
import { createSiteServices } from "./site/services"

const root = document.querySelector<HTMLElement>("[data-editor-drafts]")
if (root) await mountHomeDrafts(root, await createSiteServices())
