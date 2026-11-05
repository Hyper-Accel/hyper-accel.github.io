import type { GitHubUser } from "../../shared/onsite/github"
import { h } from "./dom"
import { blobToBase64, encodeAvatar } from "./images"

/** Fields of content/authors/<name>/_index{,.en}.md for an author who has no profile yet. */
export interface NewAuthorProfile {
  readonly name: string
  readonly github: string
  /** Numeric GitHub user ID: edit access follows it, so a renamed login keeps its posts. */
  readonly githubId: number
  readonly image: string
  /** A pasted or chosen picture (base64 WebP), committed beside the profile as avatar.webp. */
  readonly avatar?: string
  readonly linkedin: string
  readonly bio: { readonly ko: string; readonly en: string }
}

/**
 * Where Hugo publishes content/authors/<name>/avatar.webp: the author page's address, which is
 * the name in Hugo's urlize form (lower case, spaces as hyphens).
 */
export function authorAvatarPath(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
  return `/authors/${slug}/avatar.webp`
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
    `github_id: ${profile.githubId}`,
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
  /** Looks the login up on GitHub; null when no account uses it. */
  readonly resolveUser: (login: string) => Promise<GitHubUser | null>
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
      "aria-labelledby": "author-profile-image-label",
      name: "authorImage",
      autocomplete: "off",
      spellcheck: "false",
      type: "url",
      placeholder: "이미지 주소 또는 붙여넣기",
    })
    // Like the cover: choose a file, or paste or drop a picture anywhere in the dialog.
    const preview = h("img", { class: "author-profile__avatar", alt: "", hidden: true })
    const imageFile = h("input", {
      name: "authorImageFile",
      type: "file",
      accept: "image/*",
      class: "composer-sr-only",
    })
    const imagePick = h("button", { type: "button", class: "composer-button" }, "이미지 선택")
    const imageRemove = h(
      "button",
      { type: "button", class: "composer-button", hidden: true },
      "사진 빼기",
    )
    const imageHint = h(
      "small",
      { class: "composer-field__hint" },
      "비워 두면 GitHub 프로필 사진을 씁니다.",
    )
    let avatar: { readonly data: string; readonly url: string } | null = null
    const clearAvatar = (): void => {
      if (avatar) URL.revokeObjectURL(avatar.url)
      avatar = null
      imageHint.hidden = false
      preview.hidden = true
      preview.removeAttribute("src")
      imageRemove.hidden = true
      image.hidden = false
    }
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
      h(
        "div",
        { class: "metadata-field metadata-field--wide" },
        h(
          "span",
          { class: "composer-field__label", id: "author-profile-image-label" },
          "프로필 사진",
        ),
        h(
          "div",
          { class: "author-profile__image" },
          preview,
          image,
          imageRemove,
          imagePick,
          imageFile,
        ),
        imageHint,
      ),
      field("LinkedIn 주소 (선택)", linkedin),
      field("소개 (한국어)", bioKo),
      field("소개 (English)", bioEn),
      error,
      h("div", { class: "composer-form__actions" }, cancel, submit),
    )
    const dialog = h("dialog", { class: "author-profile-dialog", "aria-label": "새 작성자" }, form)
    defaults.host.append(dialog)
    const show = (messages: readonly string[]): void => {
      error.hidden = messages.length === 0
      error.replaceChildren(...messages.map((message) => h("span", {}, message)))
    }
    const finish = (value: NewAuthorProfile | null): void => {
      clearAvatar()
      dialog.close()
      dialog.remove()
      resolve(value)
    }
    const useFile = async (file: File): Promise<void> => {
      if (!file.type.startsWith("image/")) {
        show(["이미지 파일만 쓸 수 있습니다."])
        return
      }
      imageFile.disabled = true
      try {
        const blob = await encodeAvatar(file)
        const data = await blobToBase64(blob)
        clearAvatar()
        avatar = { data, url: URL.createObjectURL(blob) }
        preview.src = avatar.url
        preview.hidden = false
        imageRemove.hidden = false
        // A pasted picture and an address are alternatives: the picture replaces the address box.
        image.value = ""
        image.hidden = true
        imageHint.hidden = true
        show([])
      } catch (failure: unknown) {
        if (!(failure instanceof Error)) throw failure
        show([failure.message])
      } finally {
        imageFile.disabled = false
      }
    }
    const imageIn = (data: DataTransfer | null): File | undefined =>
      [...(data?.files ?? [])].find((file) => file.type.startsWith("image/"))
    imagePick.addEventListener("click", () => imageFile.click())
    imageFile.addEventListener("change", () => {
      const file = imageFile.files?.[0]
      imageFile.value = ""
      if (file) void useFile(file)
    })
    form.addEventListener("paste", (event) => {
      const file = imageIn(event.clipboardData)
      if (!file) return
      event.preventDefault()
      void useFile(file)
    })
    form.addEventListener("dragover", (event) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault()
    })
    form.addEventListener("drop", (event) => {
      const file = imageIn(event.dataTransfer)
      if (!file) return
      event.preventDefault()
      void useFile(file)
    })
    image.addEventListener("input", () => {
      if (image.value) clearAvatar()
    })
    imageRemove.addEventListener("click", () => {
      clearAvatar()
      image.focus()
    })
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
      show(problems)
      if (problems.length) return
      submit.disabled = true
      void defaults.resolveUser(handle).then(
        (user) => {
          submit.disabled = false
          if (!user) {
            show(["GitHub 아이디를 찾을 수 없습니다."])
            return
          }
          finish({
            name: display,
            github: user.login,
            githubId: user.id,
            image: avatar
              ? authorAvatarPath(display)
              : image.value.trim() || `https://github.com/${user.login}.png`,
            ...(avatar ? { avatar: avatar.data } : {}),
            linkedin: linkedin.value.trim(),
            bio: { ko: bioKo.value.trim(), en: bioEn.value.trim() },
          })
        },
        (failure: unknown) => {
          submit.disabled = false
          show([
            failure instanceof Error ? failure.message : "GitHub 아이디를 확인하지 못했습니다.",
          ])
        },
      )
    })
    dialog.showModal()
    ;(defaults.name ? github : name).focus()
  })
}
