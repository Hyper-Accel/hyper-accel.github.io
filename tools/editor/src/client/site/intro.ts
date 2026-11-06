import { h } from "../composer/dom"
import authorFormat from "./guide/author-format.mp4"
import authorInsert from "./guide/author-insert.mp4"
import authorReview from "./guide/author-review.mp4"
import authorSave from "./guide/author-save.mp4"
import reviewerApprove from "./guide/reviewer-approve.mp4"
import reviewerComment from "./guide/reviewer-comment.mp4"
import reviewerReadonly from "./guide/reviewer-readonly.mp4"

type Role = "author" | "reviewer"

interface GuidePage {
  readonly title: string
  readonly body: string
  /** A short clip of it on a demo post (recorded from the demo site). */
  readonly clip: string
}

const GUIDE: Record<Role, readonly GuidePage[]> = {
  author: [
    {
      title: "발행될 모습 그대로 편집",
      body: "본문에서 문구를 선택하면 바로 위에 서식 도구가 나타납니다. 굵게·기울임·링크 같은 서식을 바로 적용할 수 있습니다.",
      clip: authorFormat,
    },
    {
      title: "블록과 그림 넣기",
      body: "위쪽 ‘＋ 넣기’를 누르면 그림·표·수식 같은 블록을 넣을 수 있습니다. 그림은 ‘라이브러리’에서 붙여넣거나 고릅니다.",
      clip: authorInsert,
    },
    {
      title: "자동 보관과 초안 저장",
      body: "작성 내용은 이 기기에 자동으로 보관됩니다. ‘GitHub에 저장’을 누르면 리뷰어가 볼 수 있는 초안에 저장되며, 블로그에는 공개되지 않습니다.",
      clip: authorSave,
    },
    {
      title: "리뷰 요청과 게시",
      body: "‘리뷰 요청’ 후 승인을 받으면 같은 버튼이 ‘게시’로 바뀌고, 누르면 블로그에 공개됩니다. 리뷰 중에는 ‘초안으로 되돌리기’로 요청을 취소할 수 있습니다.",
      clip: authorReview,
    },
  ],
  reviewer: [
    {
      title: "발행될 모습 그대로 읽기",
      body: "글은 발행될 모습 그대로 보입니다. 리뷰 화면에서는 글을 고칠 수 없고, 댓글과 승인만 남길 수 있습니다.",
      clip: reviewerReadonly,
    },
    {
      title: "댓글 남기기",
      body: "의견을 남길 문구를 선택한 뒤 ‘댓글’을 누릅니다.",
      clip: reviewerComment,
    },
    {
      title: "글 승인하기",
      body: "작성자가 리뷰를 요청한 뒤에 승인할 수 있습니다. 글을 확인한 뒤 오른쪽 아래 ‘승인’을 누릅니다.",
      clip: reviewerApprove,
    },
  ],
}

const HELP_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5h.01"/></svg>'

/**
 * The editor's help: a paged guide that opens every time the editor (or a post to review) opens,
 * until 다시 보지 않기, and the ⓘ button that opens it at any time. Automated browsers do not get
 * the automatic guide, so it does not stand in front of their clicks.
 */
export function mountHelp(role: Role, host: HTMLElement): HTMLButtonElement {
  const key = `onsite:help-hidden:${role}`
  const button = h("button", {
    type: "button",
    class: "onsite-help-button",
    "data-site-help": "",
    "aria-label": "도움말",
    title: "도움말",
  })
  button.innerHTML = HELP_ICON
  button.addEventListener("click", () => openGuide(false))

  function openGuide(automatic: boolean): void {
    host.querySelector("dialog.onsite-intro")?.remove()
    const pages = GUIDE[role]
    let index = 0
    const media = h("video", {
      class: "onsite-intro__media",
      "aria-hidden": "true",
      preload: "auto",
    })
    media.muted = true
    media.loop = true
    media.playsInline = true
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches
    const title = h("h2", { id: "onsite-intro-title" })
    const body = h("p", { class: "onsite-intro__body" })
    const dots = h(
      "div",
      { class: "onsite-intro__dots", "aria-hidden": "true" },
      ...pages.map(() => h("span", {})),
    )
    const close = h(
      "button",
      { type: "button", class: "onsite-intro__close", "aria-label": "닫기" },
      "×",
    )
    const prev = h("button", { type: "button", class: "onsite-intro__prev" }, "이전")
    const next = h("button", { type: "button", class: "onsite-intro__next" }, "다음")
    const skip = h("button", { type: "button", class: "onsite-intro__skip" }, "다시 보지 않기")
    skip.hidden = !automatic
    // A finished post that uses every tool (content/posts/editor-showcase), opened in the editor to
    // try things out; it is never saved. The new tab keeps its opener so it starts signed in (the
    // login lives in this tab's sessionStorage, which a noopener tab does not receive).
    const showcase =
      role === "author"
        ? h(
            "a",
            {
              class: "onsite-intro__showcase",
              href: "/posts/editor-showcase/?edit",
              target: "_blank",
              rel: "opener",
            },
            "예시 글 보기 ↗",
          )
        : null
    const dialog = h(
      "dialog",
      { class: "onsite-intro", "aria-labelledby": "onsite-intro-title" },
      h("div", { class: "onsite-intro__head" }, dots, close),
      media,
      title,
      body,
      h(
        "div",
        { class: "onsite-intro__foot" },
        h("div", { class: "onsite-intro__aside" }, skip, showcase),
        prev,
        next,
      ),
    )
    const show = (to: number): void => {
      index = Math.max(0, Math.min(pages.length - 1, to))
      const page = pages[index]
      if (!page) return
      title.textContent = page.title
      body.textContent = page.body
      media.src = page.clip
      if (!still) void media.play().catch(() => undefined)
      dots.querySelectorAll("span").forEach((dot, at) => {
        dot.classList.toggle("is-current", at === index)
      })
      prev.hidden = index === 0
      next.textContent = index === pages.length - 1 ? "시작하기" : "다음"
    }
    prev.addEventListener("click", () => show(index - 1))
    next.addEventListener("click", () => {
      if (index === pages.length - 1) dialog.close()
      else show(index + 1)
    })
    close.addEventListener("click", () => dialog.close())
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") show(index + 1)
      else if (event.key === "ArrowLeft") show(index - 1)
    })
    skip.addEventListener("click", () => {
      localStorage.setItem(key, "hidden")
      dialog.close()
      pointAtHelp()
    })
    dialog.addEventListener("close", () => dialog.remove())
    host.append(dialog)
    dialog.showModal()
    // Every page takes the tallest page's height, so 이전·다음 do not jump as the text changes.
    for (const page of pages) {
      body.textContent = page.body
      body.style.minHeight = `${Math.max(body.offsetHeight, Number.parseFloat(body.style.minHeight) || 0)}px`
    }
    show(0)
    next.focus()
  }

  /** After 다시 보지 않기: a bubble over the ⓘ button says the guide is still there. */
  function pointAtHelp(): void {
    const ok = h("button", { type: "button", class: "onsite-help-tip__ok" }, "확인")
    const tip = h(
      "div",
      { class: "onsite-help-tip", role: "dialog", "aria-label": "도움말 안내" },
      h(
        "p",
        { class: "onsite-help-tip__text" },
        "언제든 ⓘ 버튼을 눌러 도움말을 다시 볼 수 있습니다.",
      ),
      ok,
    )
    const done = (): void => {
      tip.remove()
      button.classList.remove("is-pointed")
      document.removeEventListener("keydown", onKey)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") done()
    }
    ok.addEventListener("click", done)
    document.addEventListener("keydown", onKey)
    host.append(tip)
    const at = button.getBoundingClientRect()
    const width = tip.offsetWidth
    const left = Math.max(12, Math.min(innerWidth - width - 12, at.left + at.width / 2 - 28))
    tip.style.left = `${left}px`
    tip.style.bottom = `${innerHeight - at.top + 12}px`
    tip.style.setProperty("--arrow", `${at.left + at.width / 2 - left}px`)
    button.classList.add("is-pointed")
    ok.focus()
  }

  if (!navigator.webdriver && !localStorage.getItem(key)) queueMicrotask(() => openGuide(true))
  return button
}
