import { h } from "./dom"

/** Fields of content/authors/<name>/_index{,.en}.md for an author who has no profile yet. */
export interface NewAuthorProfile {
  readonly name: string
  readonly github: string
  readonly image: string
  readonly linkedin: string
  readonly bio: { readonly ko: string; readonly en: string }
}

const NAME = /^[A-Za-z][A-Za-z .'-]*[A-Za-z]$/
const HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/

function quote(value: string): string {
  return JSON.stringify(value)
}

/** Hugo front matter for one language of the profile, matching the existing author pages. */
export function authorProfileMarkdown(profile: NewAuthorProfile, language: "ko" | "en"): string {
  const lines = [
    "---",
    `title: ${quote(profile.name)}`,
    `image: ${quote(profile.image)}`,
    ...(profile.linkedin ? [`linkedin: ${quote(profile.linkedin)}`] : []),
    `github: ${quote(`https://github.com/${profile.github}`)}`,
    `bio: ${quote(profile.bio[language] || profile.bio.ko || profile.bio.en)}`,
    "---",
    "",
  ]
  return lines.join("\n")
}

/**
 * Asks for a new author's profile. The name becomes the content/authors directory and the
 * `authors:` value; the GitHub ID links the profile to the writer's login.
 */
export function requestAuthorProfile(defaults: {
  readonly name?: string
  readonly github?: string
  readonly taken: readonly string[]
  /** Inside the composer so the dialog picks up the editor's form styles. */
  readonly host: HTMLElement
}): Promise<NewAuthorProfile | null> {
  return new Promise((resolve) => {
    const field = (label: string, input: HTMLInputElement, hint?: string): HTMLLabelElement =>
      h(
        "label",
        { class: "metadata-field metadata-field--wide" },
        h("span", { class: "composer-field__label" }, label),
        input,
        hint ? h("small", { class: "composer-field__hint" }, hint) : null,
      )
    const name = h("input", { name: "authorName", autocomplete: "off", value: defaults.name ?? "" })
    const github = h("input", {
      name: "authorGithub",
      autocomplete: "off",
      spellcheck: "false",
      value: defaults.github ?? "",
    })
    const image = h("input", {
      name: "authorImage",
      autocomplete: "off",
      spellcheck: "false",
      type: "url",
    })
    const linkedin = h("input", {
      name: "authorLinkedin",
      autocomplete: "off",
      spellcheck: "false",
      type: "url",
    })
    const bioKo = h("input", { name: "authorBioKo", autocomplete: "off" })
    const bioEn = h("input", { name: "authorBioEn", autocomplete: "off", lang: "en" })
    const error = h("p", { class: "composer-form__errors", role: "alert", hidden: true })
    const submit = h(
      "button",
      { type: "submit", class: "composer-button composer-button--primary" },
      "작성자 추가",
    )
    const cancel = h("button", { type: "button", class: "composer-button" }, "취소")
    const form = h(
      "form",
      { class: "composer-form author-profile", method: "dialog" },
      h("h2", { class: "author-profile__title" }, "새 작성자"),
      field(
        "이름 (영문)",
        name,
        "작성자 페이지 주소와 글의 작성자 표시에 쓰입니다. 예: Gildong Hong",
      ),
      field("GitHub 아이디", github),
      field("프로필 사진 주소", image, "비워 두면 GitHub 프로필 사진을 씁니다."),
      field("LinkedIn 주소 (선택)", linkedin),
      field("소개 (한국어)", bioKo),
      field("소개 (English)", bioEn),
      error,
      h("div", { class: "composer-form__actions" }, cancel, submit),
    )
    const dialog = h("dialog", { class: "author-profile-dialog", "aria-label": "새 작성자" }, form)
    defaults.host.append(dialog)
    const finish = (value: NewAuthorProfile | null): void => {
      dialog.close()
      dialog.remove()
      resolve(value)
    }
    cancel.addEventListener("click", () => finish(null))
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault()
      finish(null)
    })
    form.addEventListener("submit", (event) => {
      event.preventDefault()
      const handle = github.value
        .trim()
        .replace(/^@/, "")
        .replace(/^https:\/\/github\.com\//, "")
      const problems: string[] = []
      const display = name.value.trim().replace(/\s+/g, " ")
      if (!NAME.test(display)) problems.push("이름은 영문으로 입력하세요. 예: Gildong Hong")
      if (defaults.taken.some((taken) => taken.toLowerCase() === display.toLowerCase()))
        problems.push("이미 있는 작성자입니다. 목록에서 선택하세요.")
      if (!HANDLE.test(handle)) problems.push("GitHub 아이디를 확인하세요.")
      if (!bioKo.value.trim() && !bioEn.value.trim()) problems.push("소개를 한 줄 이상 입력하세요.")
      error.hidden = problems.length === 0
      error.replaceChildren(...problems.map((problem) => h("span", {}, problem)))
      if (problems.length) return
      finish({
        name: display,
        github: handle,
        image: image.value.trim() || `https://github.com/${handle}.png`,
        linkedin: linkedin.value.trim(),
        bio: { ko: bioKo.value.trim(), en: bioEn.value.trim() },
      })
    })
    dialog.showModal()
    ;(defaults.name ? github : name).focus()
  })
}
