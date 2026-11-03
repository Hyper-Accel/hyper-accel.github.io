import type { CreatePostRequest } from "../shared/contracts"
import { createPostRequestSchema, registerAuthorRequestSchema } from "../shared/contracts"
import { createPost, fetchAuthors, registerAuthor } from "./api"
import { errorMessage, requiredElement } from "./dom"

export function createPostMarkup(): string {
  return `
    <dialog class="create-post-dialog" id="create-post-dialog" aria-labelledby="create-post-heading" aria-describedby="create-post-description">
      <form id="create-post-form">
        <h2 id="create-post-heading">새 글 만들기</h2>
        <p id="create-post-description">한국어·영어 글 파일을 함께 만듭니다. 본문과 번역은 생성 후 작성하세요.</p>
        <fieldset class="create-post-fields" id="create-post-fields">
          <label for="new-post-directory">디렉터리명</label>
          <input id="new-post-directory" name="directory" required maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="my-new-post" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="new-post-directory-help" />
          <small id="new-post-directory-help">영문 소문자·숫자·하이픈으로 입력하세요. content/posts/ 아래에 생성됩니다.</small>
          <label for="new-post-title">글 제목</label>
          <input id="new-post-title" name="title" required maxlength="240" autocomplete="off" />
          <label for="new-post-author">저자명</label>
          <div class="author-check-row">
            <input id="new-post-author" name="author" required maxlength="240" list="registered-authors" autocomplete="off" aria-describedby="new-post-author-help new-post-author-status" />
            <button class="secondary-button" id="check-author-button" type="button" disabled>저자명 확인</button>
          </div>
          <datalist id="registered-authors"></datalist>
          <small id="new-post-author-help">등록된 이름을 입력하거나 선택하세요.</small>
          <p class="author-check-status" id="new-post-author-status" role="status">저자명 확인 후 글을 만들 수 있습니다.</p>
          <fieldset class="new-author-fields" id="new-author-fields" hidden disabled>
            <legend>새 저자 프로필</legend>
            <p>한국어·영어 소개는 필수입니다. 추가한 프로필은 글 생성을 취소해도 남습니다.</p>
            <label for="new-author-bio-ko">한국어 소개</label>
            <textarea id="new-author-bio-ko" name="bioKo" rows="2" required maxlength="1000"></textarea>
            <label for="new-author-bio-en">영어 소개</label>
            <textarea id="new-author-bio-en" name="bioEn" rows="2" required maxlength="1000"></textarea>
            <label for="new-author-image">프로필 이미지 URL <span>(선택)</span></label>
            <input id="new-author-image" name="image" type="url" maxlength="2048" placeholder="https://…" />
            <label for="new-author-github">GitHub URL <span>(선택)</span></label>
            <input id="new-author-github" name="github" type="url" maxlength="2048" placeholder="https://github.com/…" />
            <label for="new-author-linkedin">LinkedIn URL <span>(선택)</span></label>
            <input id="new-author-linkedin" name="linkedin" type="url" maxlength="2048" placeholder="https://www.linkedin.com/in/…" />
            <button class="secondary-button" id="register-author-button" type="button">저자 추가</button>
          </fieldset>
        </fieldset>
        <p class="create-post-error" id="create-post-error" role="alert" tabindex="-1" hidden></p>
        <p class="create-post-status" id="create-post-status" role="status"></p>
        <div class="create-post-actions">
          <button class="secondary-button" id="create-post-cancel" type="button">취소</button>
          <button class="save-button" id="create-post-submit" type="submit" disabled>글 만들기</button>
        </div>
      </form>
    </dialog>
  `
}

type CreatePostOptions = {
  readonly beforeOpen: () => Promise<boolean>
  readonly onCreated: (path: string) => Promise<void>
}

export function setupCreatePost(options: CreatePostOptions): void {
  const trigger = requiredElement<HTMLButtonElement>("#new-post-button")
  const dialog = requiredElement<HTMLDialogElement>("#create-post-dialog")
  const form = requiredElement<HTMLFormElement>("#create-post-form")
  const fields = requiredElement<HTMLFieldSetElement>("#create-post-fields")
  const profile = requiredElement<HTMLFieldSetElement>("#new-author-fields")
  const directory = requiredElement<HTMLInputElement>("#new-post-directory")
  const author = requiredElement<HTMLInputElement>("#new-post-author")
  const checkAuthor = requiredElement<HTMLButtonElement>("#check-author-button")
  const addAuthor = requiredElement<HTMLButtonElement>("#register-author-button")
  const authorStatus = requiredElement<HTMLParagraphElement>("#new-post-author-status")
  const suggestions = requiredElement<HTMLDataListElement>("#registered-authors")
  const submit = requiredElement<HTMLButtonElement>("#create-post-submit")
  const cancel = requiredElement<HTMLButtonElement>("#create-post-cancel")
  const error = requiredElement<HTMLParagraphElement>("#create-post-error")
  const status = requiredElement<HTMLParagraphElement>("#create-post-status")
  let busy = false
  let opening = false
  let checkedAuthor: string | undefined
  let unregisteredAuthor: string | undefined

  const syncControls = (): void => {
    submit.disabled = busy || checkedAuthor !== author.value.trim()
    checkAuthor.disabled = busy || !author.value.trim()
    addAuthor.disabled = busy || unregisteredAuthor !== author.value.trim()
  }

  const setBusy = (value: boolean, label = ""): void => {
    busy = value
    fields.disabled = value
    syncControls()
    cancel.disabled = value
    status.textContent = label
    form.setAttribute("aria-busy", String(value))
  }
  const hideProfile = (): void => {
    profile.hidden = true
    profile.disabled = true
  }
  const showError = (message: string): void => {
    error.textContent = message
    error.hidden = false
    error.focus()
  }
  const refreshAuthors = async (): Promise<readonly string[]> => {
    const authors = await fetchAuthors()
    suggestions.replaceChildren(
      ...authors.map((name) => {
        const option = document.createElement("option")
        option.value = name
        return option
      }),
    )
    return authors
  }

  trigger.addEventListener("click", () => {
    if (opening || dialog.open) return
    opening = true
    trigger.disabled = true
    void (async () => {
      try {
        if (!(await options.beforeOpen())) return
        form.reset()
        checkedAuthor = undefined
        unregisteredAuthor = undefined
        authorStatus.textContent = "저자명 확인 후 글을 만들 수 있습니다."
        hideProfile()
        error.hidden = true
        dialog.showModal()
        directory.focus()
        setBusy(true, "등록된 저자 확인 중…")
        await refreshAuthors()
      } catch (cause: unknown) {
        showError(errorMessage(cause))
      } finally {
        setBusy(false)
        if (dialog.open && error.hidden) directory.focus()
        opening = false
        trigger.disabled = false
      }
    })()
  })
  cancel.addEventListener("click", () => dialog.close())
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") event.stopPropagation()
  })
  dialog.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault()
  })
  dialog.addEventListener("close", () => trigger.focus())
  author.addEventListener("input", () => {
    checkedAuthor = undefined
    unregisteredAuthor = undefined
    hideProfile()
    for (const input of profile.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    )) {
      input.value = ""
    }
    error.hidden = true
    status.textContent = ""
    authorStatus.textContent = "저자명 확인 후 글을 만들 수 있습니다."
    syncControls()
  })

  checkAuthor.addEventListener("click", () => {
    if (busy) return
    const parsed = createPostRequestSchema.shape.author.safeParse(author.value)
    checkedAuthor = undefined
    unregisteredAuthor = undefined
    hideProfile()
    error.hidden = true
    authorStatus.textContent = ""
    if (!parsed.success) {
      showError("저자명을 올바르게 입력해 주세요.")
      syncControls()
      return
    }
    const name = parsed.data
    setBusy(true, "저자명 확인 중…")
    void (async () => {
      try {
        const authors = await refreshAuthors()
        if (authors.includes(name)) {
          checkedAuthor = name
          authorStatus.textContent = `등록된 저자 '${name}' 확인 완료. 글을 만들 수 있습니다.`
        } else {
          const similar = authors.find(
            (entry) => entry.normalize("NFC").toLowerCase() === name.normalize("NFC").toLowerCase(),
          )
          if (similar) {
            authorStatus.textContent = `등록된 저자명 '${similar}'을 그대로 입력한 뒤 다시 확인해 주세요.`
          } else {
            unregisteredAuthor = name
            profile.hidden = false
            profile.disabled = false
            authorStatus.textContent =
              "등록되지 않은 저자입니다. 프로필 입력 후 저자 추가를 눌러 주세요."
          }
        }
      } catch (cause: unknown) {
        showError(errorMessage(cause))
        authorStatus.textContent = "저자명 확인에 실패했습니다. 다시 확인해 주세요."
      } finally {
        setBusy(false)
      }
    })()
  })

  addAuthor.addEventListener("click", () => {
    if (busy || !unregisteredAuthor || unregisteredAuthor !== author.value.trim()) return
    for (const input of profile.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    )) {
      if (!input.reportValidity()) return
    }
    const data = new FormData(form)
    const value = (key: string): string => String(data.get(key) ?? "").trim()
    const parsed = registerAuthorRequestSchema.safeParse({
      author: unregisteredAuthor,
      profile: {
        bioKo: value("bioKo"),
        bioEn: value("bioEn"),
        image: value("image"),
        github: value("github"),
        linkedin: value("linkedin"),
      },
    })
    if (!parsed.success) {
      showError("저자 소개와 URL을 확인해 주세요. URL은 http 또는 https 주소여야 합니다.")
      return
    }
    error.hidden = true
    setBusy(true, "저자 프로필 추가 중…")
    void (async () => {
      let registered = false
      try {
        const name = await registerAuthor(parsed.data)
        registered = true
        const authors = await refreshAuthors()
        if (!authors.includes(name)) throw new Error("등록한 저자를 목록에서 확인하지 못했습니다.")
        checkedAuthor = name
        unregisteredAuthor = undefined
        hideProfile()
        authorStatus.textContent = `저자 '${name}' 추가 완료. 글을 만들 수 있습니다.`
      } catch (cause: unknown) {
        showError(
          registered
            ? `저자는 추가됐지만 목록 확인에 실패했습니다. 저자명 확인을 다시 눌러 주세요. ${errorMessage(cause)}`
            : errorMessage(cause),
        )
      } finally {
        setBusy(false)
      }
    })()
  })

  form.addEventListener("submit", (event) => {
    event.preventDefault()
    if (busy) return
    if (!checkedAuthor || checkedAuthor !== author.value.trim()) {
      showError("저자명 확인 또는 저자 추가를 먼저 완료해 주세요.")
      return
    }
    const data = new FormData(form)
    const value = (key: string): string => String(data.get(key) ?? "").trim()
    const request: CreatePostRequest = {
      directory: value("directory"),
      title: value("title"),
      author: value("author"),
    }
    error.hidden = true
    setBusy(true, "글 파일 만드는 중…")
    void (async () => {
      let createdPath: string | undefined
      try {
        const validated = createPostRequestSchema.safeParse(request)
        if (!validated.success) {
          showError(validated.error.issues[0]?.message ?? "입력 내용을 확인해 주세요.")
          return
        }
        status.textContent = "글 파일 만드는 중…"
        createdPath = await createPost(validated.data)
      } catch (cause: unknown) {
        showError(errorMessage(cause))
      } finally {
        setBusy(false)
      }
      if (createdPath) {
        dialog.close()
        await options.onCreated(createdPath)
      }
    })()
  })
}
