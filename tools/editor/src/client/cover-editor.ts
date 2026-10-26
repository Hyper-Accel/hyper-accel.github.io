import type { PostCover, PostDocument } from "../shared/contracts"
import { uploadCoverImage } from "./api"
import { errorMessage, requiredElement } from "./dom"

export const maximumCoverBytes = 1024 * 1024
const coverImageTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])

export function validateCoverFile(file: File): string | undefined {
  if (!coverImageTypes.has(file.type))
    return "대표 이미지는 PNG, JPEG, GIF, WebP 파일만 사용할 수 있습니다."
  if (file.size === 0 || file.size > maximumCoverBytes)
    return "대표 이미지는 비어 있지 않은 1MB 이하 파일을 선택해 주세요."
  return undefined
}

export function coverPreviewUrl(path: string, cover: PostCover): string | undefined {
  if (/^https?:\/\//i.test(cover.image)) return cover.image
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(cover.image)) return undefined
  const query = new URLSearchParams({ path, src: cover.image })
  return `/api/cover-media?${query.toString()}`
}

export function coverEditorMarkup(): string {
  return `
    <section class="cover-editor" id="cover-section" aria-labelledby="cover-heading">
      <div class="cover-heading-row">
        <h2 id="cover-heading">대표 이미지</h2>
        <div class="cover-actions">
          <button class="secondary-button" id="cover-select" type="button"><i class="ph ph-image" aria-hidden="true"></i><span class="cover-button-label">대표 이미지 추가</span></button>
          <button class="secondary-button" id="cover-remove" type="button" hidden>대표 이미지 제거</button>
        </div>
      </div>
      <input id="cover-file-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden />
      <div class="cover-empty" id="cover-empty"><p>글 목록에 표시할 대표 이미지를 선택하세요. 본문 이미지는 별도로 추가합니다.</p></div>
      <div class="cover-preview" id="cover-preview" hidden><img id="cover-image" alt="대표 이미지 미리보기" /></div>
      <div class="cover-alt-field" id="cover-alt-field" hidden>
        <label for="cover-alt">대표 이미지 대체 텍스트</label>
        <textarea id="cover-alt" rows="2" maxlength="1000" aria-describedby="cover-alt-help" placeholder="이미지를 보지 못하는 독자를 위한 설명"></textarea>
        <p id="cover-alt-help">현재 언어의 대표 이미지만 변경합니다. 이미지 파일과 번역 글은 유지됩니다.</p>
      </div>
      <p class="cover-status" id="cover-status" role="status">PNG · JPEG · GIF · WebP, 최대 1MB</p>
      <p class="cover-error" id="cover-error" role="alert" hidden></p>
    </section>
  `
}

type CoverEditorOptions = {
  readonly onChange: () => void
  readonly onBusyChange: (busy: boolean) => void
}

type CoverChange = { readonly cover?: PostCover | null }

export function setupCoverEditor(options: CoverEditorOptions) {
  const section = requiredElement<HTMLElement>("#cover-section")
  const select = requiredElement<HTMLButtonElement>("#cover-select")
  const selectLabel = requiredElement<HTMLElement>("#cover-select .cover-button-label")
  const remove = requiredElement<HTMLButtonElement>("#cover-remove")
  const input = requiredElement<HTMLInputElement>("#cover-file-input")
  const alt = requiredElement<HTMLTextAreaElement>("#cover-alt")
  const altField = requiredElement<HTMLElement>("#cover-alt-field")
  const preview = requiredElement<HTMLElement>("#cover-preview")
  const image = requiredElement<HTMLImageElement>("#cover-image")
  const empty = requiredElement<HTMLElement>("#cover-empty")
  const status = requiredElement<HTMLElement>("#cover-status")
  const error = requiredElement<HTMLElement>("#cover-error")
  let path: string | undefined
  let cover: PostCover | null = null
  let previewUrl: string | undefined
  let changed = false
  let uploading = false
  let disabled = false
  let generation = 0

  const renderControls = (): void => {
    const locked = disabled || uploading || !path
    select.disabled = locked
    remove.disabled = locked
    input.disabled = locked
    alt.disabled = locked
    section.setAttribute("aria-busy", String(uploading))
    status.textContent = uploading
      ? "대표 이미지 업로드 중…"
      : changed
        ? cover
          ? "대표 이미지 설정이 변경됐습니다. 저장 버튼으로 반영해 주세요."
          : "저장하면 대표 이미지 설정만 제거합니다. 이미지 파일은 유지됩니다."
        : "PNG · JPEG · GIF · WebP, 최대 1MB"
  }
  const renderCover = (): void => {
    const populated = Boolean(cover?.image)
    remove.hidden = !populated
    altField.hidden = !populated
    preview.hidden = !populated
    empty.hidden = populated
    selectLabel.textContent = populated ? "이미지 교체" : "대표 이미지 추가"
    alt.value = cover?.alt ?? ""
    image.alt = cover?.alt || "대표 이미지 미리보기"
    if (populated && previewUrl) {
      image.hidden = false
      image.src = previewUrl
    } else {
      image.removeAttribute("src")
      image.hidden = true
    }
    renderControls()
  }
  const showError = (message: string): void => {
    error.textContent = message
    error.hidden = false
  }

  image.addEventListener("error", () => {
    if (!cover?.image) return
    showError(
      "대표 이미지를 불러오지 못했습니다. 이미지 경로를 확인하거나 다른 파일로 교체해 주세요.",
    )
    image.hidden = true
  })
  image.addEventListener("load", () => {
    if (cover?.image) image.hidden = false
  })
  select.addEventListener("click", () => input.click())
  input.addEventListener("change", () => {
    const file = input.files?.[0]
    input.value = ""
    if (!file || !path || uploading || disabled) return
    error.hidden = true
    const validation = validateCoverFile(file)
    if (validation) {
      showError(validation)
      return
    }
    const target = path
    const token = ++generation
    uploading = true
    renderControls()
    options.onBusyChange(true)
    void (async () => {
      try {
        const result = await uploadCoverImage(target, file)
        if (generation !== token || path !== target) return
        cover = { image: result.markdownPath, alt: cover?.alt ?? "", relative: true }
        previewUrl = result.previewUrl
        changed = true
        renderCover()
        options.onChange()
      } catch (cause: unknown) {
        if (generation === token && path === target) showError(errorMessage(cause))
      } finally {
        if (generation === token && path === target) {
          uploading = false
          renderControls()
          options.onBusyChange(false)
        }
      }
    })()
  })
  remove.addEventListener("click", () => {
    if (!path || uploading || disabled) return
    generation++
    cover = null
    previewUrl = undefined
    changed = true
    error.hidden = true
    renderCover()

    options.onChange()
    select.focus()
  })
  alt.addEventListener("input", () => {
    if (!cover || uploading || disabled) return
    cover = { ...cover, alt: alt.value }
    image.alt = alt.value || "대표 이미지 미리보기"
    changed = true
    renderControls()
    options.onChange()
  })

  renderCover()
  return {
    showPost(document: PostDocument): void {
      generation++
      path = document.path
      cover = document.cover ?? null
      previewUrl = cover?.image ? coverPreviewUrl(document.path, cover) : undefined
      changed = false
      uploading = false
      error.hidden = true
      renderCover()
      if (cover?.image && !previewUrl)
        showError("지원하지 않는 대표 이미지 주소입니다. 다른 이미지로 교체해 주세요.")
      options.onBusyChange(false)
    },
    setDisabled(value: boolean): void {
      disabled = value
      renderControls()
    },
    getChange(): CoverChange {
      return changed ? { cover: cover ? { ...cover } : null } : {}
    },
    markSaved(expected: PostCover | null | undefined): void {
      if (expected !== undefined && JSON.stringify(expected) === JSON.stringify(cover))
        changed = false
      renderControls()
    },
    isDirty(): boolean {
      return changed
    },
  }
}
