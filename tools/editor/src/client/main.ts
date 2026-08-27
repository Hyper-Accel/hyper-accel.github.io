import "@phosphor-icons/web/regular"
import "../../../../assets/css/core/theme-vars.css"
import "../../../../themes/PaperMod/assets/css/core/reset.css"
import "../../../../themes/PaperMod/assets/css/common/post-single.css"
import "./shell.css"
import "./article.css"
import "./agent.css"
import "./merge.css"
import { mountApplication } from "./app"

const root = document.querySelector<HTMLElement>("#app")
if (!root) {
  throw new Error("앱을 마운트할 #app 요소가 없습니다.")
}

mountApplication(root)
