import "./composer.css"
import { ALLOWED_CATEGORIES } from "../../document/categories"
import {
  computeSnapshotHash,
  createBundle,
  LANGUAGES,
  newBlockId,
  validateBundle,
} from "../../document/codec"
import {
  pairingIssueOf,
  pairUnpaired,
  repairStatus,
  type UnpairedBundle,
} from "../../document/repair"
import type { BundleImage, DocumentIssue, Language, PostBundle } from "../../shared/onsite/document"
import type { DraftCursor } from "../../shared/onsite/drafts"
import { createMarkdownTransport, isRelativeMedia, splitFragment } from "../markdown"
import type { NewAuthorProfile } from "./author-profile"
import { categoryChips, layoutCreateForm } from "./create-layout"
import { h, replaceChildren } from "./dom"
import { createMetadataForm, type MetadataForm } from "./form"
import { imageChooser } from "./image-chooser"
import { pendingImageFromFile, pendingImageName } from "./images"
import {
  applyMetadata,
  formatLocalIso,
  metadataFromBundle,
  newPostFields,
  type PostMetadata,
} from "./metadata"
import { createPairEditor, LANGUAGE_NAME, type PairEditor, type PairRow } from "./pair-editor"
import { createPostSurface, type PostSurface, type SurfaceField } from "./post-surface"
import { createRepairView, type RepairView } from "./repair"
import { POST_TEMPLATES, type PostTemplate } from "./templates"
import type { ComposerChange, ComposerDeps, ComposerHandle, ImageChoice } from "./types"

export type {
  BlockExtensionContext,
  BlockExtensionsOption,
  ComposerChange,
  ComposerDeps,
  ComposerHandle,
  ImageChoice,
} from "./types"

const COVER_PATH = "images/cover.webp"

const FIELD_CONTROL: Record<SurfaceField, string> = {
  authors: 'input[name="authorQuery"]',
  category: 'input[name="categoryQuery"]',
  tags: 'input[name="tagQuery"]',
  date: 'input[name="date"]',
  series: 'input[name="seriesQuery"]',
}

function openField(info: HTMLDetailsElement, form: MetadataForm, field: SurfaceField): void {
  info.open = true
  const control = form.element.querySelector<HTMLElement>(FIELD_CONTROL[field])
  control?.focus({ preventScroll: true })
  control?.scrollIntoView({ block: "center" })
}

function rowsOf(bundle: PostBundle): PairRow[] {
  return bundle.ko.blocks.map((block, index) => ({
    id: block.id,
    ko: block.markdown,
    en: bundle.en.blocks[index]?.markdown ?? "",
  }))
}

export function mountComposer(root: HTMLElement, deps: ComposerDeps): ComposerHandle {
  const now = deps.now ?? (() => new Date())
  const categories = deps.categories ?? ALLOWED_CATEGORIES
  const knownAuthors = [...deps.authors]
  const pickerOptions = {
    ...(deps.people ? { people: deps.people } : {}),
    ...(deps.tags ? { tags: deps.tags } : {}),
    ...(deps.series ? { series: deps.series } : {}),
    ...(deps.currentLogin ? { currentLogin: deps.currentLogin } : {}),
    ...(deps.lockEditors || deps.readOnly ? { lockEditors: true } : {}),
    onNewAuthor: (profile: NewAuthorProfile) => {
      if (!knownAuthors.includes(profile.name)) knownAuthors.push(profile.name)
      deps.onNewAuthor?.(profile)
    },
  }
  // The signed-in writer is the new post's author when their GitHub login has a profile.
  const currentAuthor = deps.currentLogin
    ? deps.people?.find(
        (person) => person.handle.toLowerCase() === deps.currentLogin?.toLowerCase(),
      )?.name
    : undefined
  const wrapper = h("div", { class: "composer", "data-lang": deps.cursor?.language ?? "ko" })
  root.append(wrapper)

  let bundle: PostBundle | null = null
  let images: BundleImage[] = []
  let issues: readonly DocumentIssue[] = []
  let sequence = 0
  let disposed = false
  let pairEditor: PairEditor | null = null
  let repairView: RepairView | null = null
  let form: MetadataForm | null = null
  let surface: PostSurface | null = null
  let emitting: Promise<void> | null = null
  let dirty = false

  const objectUrls = new Map<string, string>()
  const previewToPath = new Map<string, string>()

  const registerImage = (image: BundleImage): void => {
    if (image.status !== "pending") return
    const url = URL.createObjectURL(image.blob)
    objectUrls.set(image.path, url)
    previewToPath.set(url, image.path)
  }
  const releaseImages = (): void => {
    for (const url of objectUrls.values()) URL.revokeObjectURL(url)
    objectUrls.clear()
    previewToPath.clear()
  }
  const previewFor = (path: string): string | undefined => {
    const pending = objectUrls.get(path)
    if (pending) return pending
    const resolved = deps.resolveImage?.(path)
    if (resolved) previewToPath.set(splitFragment(resolved).path, path)
    return resolved
  }
  const toPreview = (source: string): string => {
    if (!isRelativeMedia(source)) return source
    const { path, fragment } = splitFragment(source)
    const url = previewFor(path)
    return url ? `${url}${fragment}` : source
  }
  const toOriginal = (preview: string): string => {
    const { path, fragment } = splitFragment(preview)
    const original = previewToPath.get(path)
    return original ? `${original}${fragment}` : preview
  }

  const addPendingImage = async (file: File, path: string): Promise<BundleImage> => {
    const image = await pendingImageFromFile(file, path)
    const previous = objectUrls.get(path)
    if (previous) {
      URL.revokeObjectURL(previous)
      objectUrls.delete(path)
      previewToPath.delete(previous)
    }
    images = [...images.filter((existing) => existing.path !== path), image]
    registerImage(image)
    return image
  }

  const summary = h("p", { class: "composer-summary", role: "status" })
  const saveState = h("span", { class: "composer-save-state", "aria-live": "polite" })

  const imageAlt = (file: File): string => file.name.replace(/\.[^.]+$/, "")
  /** Registers picture files (picked or pasted from the clipboard) as this post's pictures. */
  const addImageFiles = async (files: readonly File[]): Promise<ImageChoice[]> => {
    const choices: ImageChoice[] = []
    for (const file of files) {
      const image = await addPendingImage(file, pendingImageName(now()))
      choices.push({ src: image.path, alt: imageAlt(file) })
    }
    void emit()
    return choices
  }
  const requestImages = (multiple: boolean): Promise<ImageChoice[]> =>
    new Promise((resolve) => {
      const input = h("input", {
        type: "file",
        accept: "image/*",
        class: "composer-sr-only",
        multiple,
      })
      const finish = (choices: ImageChoice[]): void => {
        input.remove()
        resolve(choices)
      }
      input.addEventListener("change", () => {
        const files = [...(input.files ?? [])]
        if (files.length === 0) {
          finish([])
          return
        }
        void addImageFiles(files)
          .then((choices) => {
            finish(choices)
          })
          .catch((error: unknown) => {
            saveState.textContent = `이미지 변환 실패: ${error instanceof Error ? error.message : String(error)}`
            finish([])
          })
      })
      input.addEventListener("cancel", () => finish([]))
      wrapper.append(input)
      input.click()
    })
  // Picture buttons go through the library when the site has one (imageChooser), else the picker.
  const chooseImages = (multiple: boolean): Promise<ImageChoice[]> =>
    imageChooser.current ? imageChooser.current(multiple) : requestImages(multiple)
  const requestImage = async (): Promise<ImageChoice | null> =>
    (await chooseImages(false))[0] ?? null
  const blockExtensions =
    typeof deps.blockExtensions === "function"
      ? deps.blockExtensions({
          mediaUrl: toPreview,
          requestImage,
          requestImages: () => chooseImages(true),
          addImages: () => requestImages(true),
          addImageFiles,
        })
      : (deps.blockExtensions ?? [])
  const customImageNode = blockExtensions.some((extension) => extension.name === "image")
  const transport = customImageNode
    ? createMarkdownTransport(
        (source) => source,
        (source) => source,
      )
    : createMarkdownTransport(toPreview, toOriginal)
  const issuesHeading = h("h2", { class: "composer-issues__title" })
  const issuesList = h("ul", { class: "composer-issues__list" })
  const issuesPanel = h(
    "section",
    { class: "composer-issues", id: "composer-issues", hidden: true },
    issuesHeading,
    issuesList,
  )
  const reviewButton = h(
    "button",
    {
      type: "button",
      class: "composer-button",
      "data-action": "request-review",
      "aria-describedby": "composer-issues",
      disabled: true,
    },
    "리뷰 요청",
  )
  const tabs = h(
    "div",
    { class: "composer-tabs", role: "tablist", "aria-label": "편집 언어" },
    ...LANGUAGES.map((language) =>
      h(
        "button",
        {
          type: "button",
          role: "tab",
          class: "composer-tab",
          "data-lang": language,
          "aria-selected": "false",
          onclick: () => setLanguage(language),
        },
        LANGUAGE_NAME[language],
      ),
    ),
  )

  function setLanguage(language: Language): void {
    wrapper.dataset["lang"] = language
    pairEditor?.setLanguage(language)
    if (surface && form) surface.update(form.read(), language)
    const description = bundle?.[language].frontMatter["description"]
    surface?.setDescription(typeof description === "string" ? description : "")
    refreshSurface()
    for (const tab of tabs.querySelectorAll<HTMLButtonElement>("[role=tab]")) {
      tab.setAttribute("aria-selected", String(tab.dataset["lang"] === language))
    }
  }

  function currentLanguage(): Language {
    return wrapper.dataset["lang"] === "en" ? "en" : "ko"
  }

  function refreshSurface(): void {
    const language = currentLanguage()
    surface?.refresh(
      wrapper.querySelector<HTMLElement>(
        `.composer-article-language[data-lang="${language}"] .ProseMirror`,
      ),
      language,
    )
  }

  function currentBundle(): PostBundle | null {
    if (!bundle) return null
    const rows = pairEditor?.getRows() ?? rowsOf(bundle)
    return {
      ...bundle,
      ko: { ...bundle.ko, blocks: rows.map((row) => ({ id: row.id, markdown: row.ko })) },
      en: { ...bundle.en, blocks: rows.map((row) => ({ id: row.id, markdown: row.en })) },
      images: [...images],
    }
  }

  function renderIssues(): void {
    const counts = pairEditor?.statusCounts() ?? {
      complete: 0,
      "needs-ko": 0,
      "needs-en": 0,
      empty: 0,
    }
    const total = counts.complete + counts["needs-ko"] + counts["needs-en"] + counts.empty
    const pending = total - counts.complete
    summary.textContent =
      counts.empty === total
        ? "본문을 작성해 주세요"
        : pending
          ? "번역을 확인해 주세요"
          : "두 언어 작성됨"
    summary.hidden = pending === 0
    issuesPanel.hidden = issues.length === 0
    issuesHeading.textContent = `리뷰 요청 전 확인 ${issues.length}건`
    replaceChildren(
      issuesList,
      ...issues.map((issue) => {
        const message =
          issue.code === "emptyTranslation"
            ? issue.language
              ? `${LANGUAGE_NAME[issue.language]} 본문에 아직 작성하지 않은 부분이 있습니다.`
              : "본문을 작성해 주세요."
            : issue.message
        return h(
          "li",
          { "data-code": issue.code },
          issue.blockId
            ? h(
                "button",
                {
                  type: "button",
                  class: "composer-link",
                  "data-block-id": issue.blockId,
                  "data-lang": issue.language ?? "",
                },
                message,
              )
            : message,
        )
      }),
    )
    reviewButton.disabled = issues.length > 0
    reviewButton.title = issues.length > 0 ? "확인 사항을 해결하면 리뷰를 요청할 수 있습니다." : ""
  }

  function refreshValidation(current: PostBundle): void {
    issues = validateBundle(current, "review")
    renderIssues()
  }

  function emit(): Promise<void> {
    dirty = true
    refreshSurface()
    if (emitting) return emitting
    emitting = (async () => {
      try {
        while (dirty && !disposed) {
          dirty = false
          const current = currentBundle()
          if (!current) return
          refreshValidation(current)
          saveState.textContent = "변경 사항 저장 중…"
          const snapshotHash = await computeSnapshotHash(current)
          if (disposed) return
          bundle = { ...current, snapshotHash }
          sequence += 1
          const change: ComposerChange = { bundle, cursor: api.getCursor(), sequence }
          try {
            await deps.onChange(change)
            saveState.textContent = ""
          } catch (error: unknown) {
            saveState.textContent = `자동 저장 실패: ${error instanceof Error ? error.message : String(error)}`
          }
          wrapper.dataset["sequence"] = String(sequence)
        }
      } finally {
        emitting = null
      }
    })()
    return emitting
  }

  const coverHandler = async (file: File): Promise<string> => {
    const image = await addPendingImage(file, COVER_PATH)
    return image.path
  }

  issuesList.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button[data-block-id]")
    const blockId = button?.dataset["blockId"]
    if (!button || !blockId) return
    const language: Language = button.dataset["lang"] === "en" ? "en" : "ko"
    setLanguage(language)
    pairEditor?.focus(blockId, language)
  })
  reviewButton.addEventListener("click", () => {
    void (async () => {
      await emitting
      if (issues.length > 0 || !bundle) return
      reviewButton.disabled = true
      try {
        await deps.onRequestReview?.(bundle)
      } finally {
        reviewButton.disabled = issues.length > 0
      }
    })()
  })

  function renderRepair(initial: UnpairedBundle): void {
    pairEditor?.dispose()
    pairEditor = null
    surface = null
    repairView?.dispose()
    releaseImages()
    bundle = null
    images = [...initial.images]
    for (const image of images) registerImage(image)
    const finish = h(
      "button",
      {
        type: "button",
        class: "composer-button composer-button--primary",
        "data-action": "finish-repair",
        disabled: true,
      },
      "짝 맞춤 완료",
    )
    const refresh = (unpaired: UnpairedBundle): void => {
      const status = repairStatus(unpaired)
      const difference = Math.abs(status.ko - status.en)
      summary.textContent = `짝 맞춤 · 한국어 ${status.ko} · 영어 ${status.en} · ${
        status.aligned ? "블록 수 일치" : `차이 ${difference}`
      }`
      summary.dataset["aligned"] = String(status.aligned)
      finish.disabled = !status.aligned
      finish.title = status.aligned ? "" : "두 언어의 블록 수가 같아야 완료할 수 있습니다."
      issues = [pairingIssueOf(unpaired)]
      issuesPanel.hidden = false
      issuesHeading.textContent = "리뷰 요청 전 확인 1건"
      replaceChildren(issuesList, h("li", { "data-code": "pairing" }, issues[0]?.message ?? ""))
      reviewButton.disabled = true
      reviewButton.title = "짝 맞춤을 끝내면 리뷰를 요청할 수 있습니다."
    }
    const view = createRepairView({ unpaired: initial, onChange: refresh })
    repairView = view
    finish.addEventListener("click", () => {
      void (async () => {
        finish.disabled = true
        const result = await pairUnpaired(view.current())
        if (disposed) return
        if (!result.ok) {
          saveState.textContent = result.issues.map((issue) => issue.message).join(" ")
          finish.disabled = false
          return
        }
        repairView?.dispose()
        repairView = null
        renderEditor(result.bundle, null)
        void emit()
      })()
    })
    const bar = h(
      "div",
      { class: "composer-bar" },
      tabs,
      h("div", { class: "composer-bar__status" }, summary, saveState),
      h("div", { class: "composer-bar__actions" }, finish, reviewButton),
    )
    replaceChildren(wrapper, bar, issuesPanel, view.element)
    wrapper.dataset["mode"] = "repair"
    saveState.textContent = "짝 맞춤이 끝나면 자동 보관이 시작됩니다."
    setLanguage("ko")
    refresh(initial)
  }

  function renderEditor(initial: PostBundle, cursor: DraftCursor | null): void {
    pairEditor?.dispose()
    repairView?.dispose()
    repairView = null
    releaseImages()
    bundle = initial
    images = [...initial.images]
    for (const image of images) registerImage(image)
    const metadataForm = createMetadataForm({
      mode: "edit",
      initial: metadataFromBundle(initial),
      authors: knownAuthors,
      ...pickerOptions,
      categories,
      onChange: (metadata) => {
        if (disposed || form !== metadataForm || !bundle) return
        bundle = applyMetadata(bundle, metadata)
        surface?.update(metadata, currentLanguage())
        void emit()
      },
      onCoverFile: coverHandler,
      coverPreviewUrl: previewFor,
    })
    categoryChips(metadataForm.element)
    form = metadataForm
    const list = h("div", { class: "composer-article", "aria-label": "글 본문" })
    pairEditor = createPairEditor({
      container: list,
      ...(deps.onComment ? { onComment: deps.onComment } : {}),
      editable: !deps.readOnly,
      extensions: blockExtensions,
      transport,
      mediaUrl: toPreview,
      onChange: () => void emit(),
      onImage: async (file) => {
        const image = await addPendingImage(file, pendingImageName(now()))
        void emit()
        const src = customImageNode ? image.path : (objectUrls.get(image.path) ?? image.path)
        return { src, alt: imageAlt(file) }
      },
    })
    const meta = h(
      "details",
      { class: "composer-meta" },
      h("summary", { class: "composer-meta__summary" }, "글 정보 수정"),
      form.element,
    )
    const postSurface = createPostSurface({
      mode: "edit",
      info: meta,
      languages: tabs,
      onTitle: (title) => {
        if (disposed || form !== metadataForm || !bundle) return
        const language = currentLanguage()
        const current = metadataForm.read()
        const next = { ...current, title: { ...current.title, [language]: title } }
        metadataForm.setMetadata(next)
        bundle = applyMetadata(bundle, next)
        void emit()
      },
      onDescription: (description) => {
        if (disposed || form !== metadataForm || !bundle) return
        const language = currentLanguage()
        const { description: _previous, ...rest } = bundle[language].frontMatter
        const frontMatter = description ? { ...rest, description } : rest
        bundle = { ...bundle, [language]: { ...bundle[language], frontMatter } }
        void emit()
      },
      onField: (field) => {
        if (field !== "tags") {
          openField(meta, metadataForm, field)
          return
        }
        // Tags open in place under the post and fold away again with the same link.
        const panel = postSurface.tagPanel
        if (panel.hidden) {
          panel.replaceChildren(h("div", { class: "composer-form" }, metadataForm.lendTags()))
          panel.hidden = false
          panel.querySelector<HTMLInputElement>('input[name="tagQuery"]')?.focus()
        } else {
          metadataForm.returnTags()
          panel.replaceChildren()
          panel.hidden = true
        }
        postSurface.update(metadataForm.read(), currentLanguage())
      },
    })
    surface = postSurface
    postSurface.content.append(list)
    postSurface.after.append(issuesPanel)
    const dock = h(
      "div",
      { class: "composer-dock" },
      h("div", { class: "composer-dock__status" }, summary, saveState),
      deps.saveControls ?? null,
      reviewButton,
    )
    replaceChildren(wrapper, postSurface.element, dock)
    wrapper.dataset["mode"] = "edit"
    if (deps.readOnly) {
      // Only the authors and the people they allow may change this post.
      wrapper.dataset["readonly"] = "true"
      for (const editable of postSurface.element.querySelectorAll<HTMLElement>("[contenteditable]"))
        editable.contentEditable = "false"
      for (const control of metadataForm.element.elements)
        if (
          control instanceof HTMLInputElement ||
          control instanceof HTMLButtonElement ||
          control instanceof HTMLFieldSetElement
        )
          control.disabled = true
      reviewButton.replaceWith(
        h("p", { class: "composer-readonly", role: "status" }, deps.readOnly),
      )
    }
    setLanguage(cursor?.language ?? "ko")
    pairEditor.setRows(rowsOf(initial))
    refreshSurface()
    const current = currentBundle()
    if (current) refreshValidation(current)
    if (cursor) api.setCursor(cursor)
  }

  async function startPost(metadata: PostMetadata, template: PostTemplate): Promise<void> {
    const ids = template.rows.length ? template.rows.map(() => newBlockId()) : [newBlockId()]
    // A writer who starts a post for other authors keeps the right to edit it.
    const login = deps.currentLogin?.toLowerCase()
    const authorHandles = metadata.authors.flatMap(
      (name) => deps.people?.find((person) => person.name === name)?.handle.toLowerCase() ?? [],
    )
    const editors =
      login &&
      authorHandles.length > 0 &&
      !authorHandles.includes(login) &&
      !metadata.editors.some((editor) => editor.toLowerCase() === login)
        ? [...metadata.editors, deps.currentLogin ?? login]
        : metadata.editors
    const created = applyMetadata(await createBundle(newPostFields(metadata), ids, images), {
      ...metadata,
      editors,
    })
    if (disposed) return
    const withRows = (language: Language): PostBundle[Language] => ({
      ...created[language],
      blocks: ids.map((id, index) => ({ id, markdown: template.rows[index]?.[language] ?? "" })),
    })
    renderEditor(
      template.rows.length ? { ...created, ko: withRows("ko"), en: withRows("en") } : created,
      null,
    )
    void emit()
    const first = created.ko.blocks[0]
    // A template starts with the caret at the end of its first heading.
    const heading = template.rows[0]?.ko.replace(/^#+\s*/, "")
    const end = heading === undefined ? undefined : 1 + heading.length
    if (first)
      pairEditor?.focus(first.id, "ko", end === undefined ? undefined : { anchor: end, focus: end })
  }

  /**
   * A small page showing what the post starts as: the title, then each section heading with a
   * couple of text lines under it (a blank post is an empty page with the caret).
   */
  function templatePreview(template: PostTemplate): HTMLElement {
    const lines = (count: number): HTMLElement =>
      h(
        "span",
        { class: "composer-template__lines" },
        ...Array.from({ length: count }, () => h("i", {})),
      )
    const body = template.rows.length
      ? template.rows.flatMap((row) => [h("b", {}, row.ko.replace(/^#+\s*/, "")), lines(2)])
      : [h("span", { class: "composer-template__caret" })]
    return h(
      "span",
      { class: "composer-template__page", "aria-hidden": "true" },
      h("span", { class: "composer-template__title" }),
      ...body,
    )
  }

  /** Naver-style 템플릿: the post starts from one of the blog's recurring structures. */
  function templatePicker(form: MetadataForm): { element: HTMLElement; selected(): PostTemplate } {
    let selected: PostTemplate = POST_TEMPLATES[0] as PostTemplate
    const element = h(
      "fieldset",
      { class: "composer-templates" },
      h("legend", {}, "템플릿"),
      h(
        "div",
        { class: "composer-templates__list" },
        ...POST_TEMPLATES.map((template) => {
          const input = h("input", {
            type: "radio",
            name: "template",
            value: template.id,
            checked: template === selected,
          })
          input.addEventListener("change", () => {
            selected = template
            const category = template.category
            if (!category) return
            const chosen = form.element.querySelector<HTMLInputElement>(
              'input[name="category"]:checked',
            )
            const match = form.element.querySelector<HTMLInputElement>(
              `input[name="category"][value="${CSS.escape(category)}"]`,
            )
            if (!chosen && match) {
              match.checked = true
              match.dispatchEvent(new Event("change", { bubbles: true }))
            }
          })
          return h(
            "label",
            { class: "composer-template" },
            input,
            templatePreview(template),
            h(
              "span",
              { class: "composer-template__text" },
              h("strong", {}, template.label),
              h("span", {}, template.description),
            ),
            h(
              "small",
              { class: "composer-template__meta" },
              template.rows.length ? `섹션 ${template.rows.length}개` : "자유 형식",
            ),
          )
        }),
      ),
    )
    return { element, selected: () => selected }
  }

  function renderForm(): void {
    const initial: PostMetadata = {
      slug: "",
      title: { ko: "", en: "" },
      authors: currentAuthor ? [currentAuthor] : [],
      category: "",
      tags: [],
      series: "",
      seriesIndex: null,
      cover: null,
      date: formatLocalIso(now()),
      draft: false,
      editors: [],
    }
    const createForm = createMetadataForm({
      mode: "create",
      initial,
      authors: knownAuthors,
      ...pickerOptions,
      categories,
      onChange: () => undefined,
      onSubmit: (metadata) => {
        createForm.setErrors([])
        void startPost(metadata, picker.selected()).catch((error: unknown) => {
          createForm.setErrors([error instanceof Error ? error.message : String(error)])
        })
      },
      onCoverFile: coverHandler,
      coverPreviewUrl: previewFor,
    })
    form = createForm
    const picker = templatePicker(createForm)
    // Templates first, then the two-column settings page (create-layout.ts).
    layoutCreateForm(createForm.element, picker.element)
    const titleKo = createForm.element.querySelector<HTMLInputElement>('input[name="titleKo"]')
    const info = h(
      "details",
      { class: "composer-meta", open: true },
      h("summary", { class: "composer-meta__summary" }, "글 정보"),
      createForm.element,
    )
    const createSurface = createPostSurface({
      mode: "create",
      info,
      languages: null,
      onTitle: (title) => {
        if (!titleKo) return
        titleKo.value = title
        titleKo.dispatchEvent(new Event("input", { bubbles: true }))
      },
      onField: (field) => openField(info, createForm, field),
    })
    surface = createSurface
    const sync = (): void => createSurface.update(createForm.read(), "ko")
    createForm.element.addEventListener("input", sync)
    createForm.element.addEventListener("change", sync)
    sync()
    replaceChildren(wrapper, createSurface.element)
    wrapper.dataset["mode"] = "form"
    // The page head is just "새 글"; the title is typed into the form's first field.
    info.before(h("h1", { class: "composer-create__heading" }, "새 글"))
    titleKo?.focus()
  }

  const api: ComposerHandle = {
    dispose() {
      disposed = true
      pairEditor?.dispose()
      pairEditor = null
      repairView?.dispose()
      repairView = null
      releaseImages()
      wrapper.remove()
    },
    getUnpaired() {
      return repairView?.current() ?? null
    },
    getBundle() {
      return currentBundle()
    },
    setBundle(next) {
      renderEditor(next, null)
    },
    getCursor() {
      return pairEditor?.getCursor() ?? null
    },
    setCursor(cursor) {
      if (!cursor || !pairEditor) return
      setLanguage(cursor.language)
      pairEditor.setCursor(cursor)
      window.scrollTo({ top: cursor.scrollTop })
    },
    getIssues() {
      return issues
    },
  }

  if (deps.bundle) renderEditor(deps.bundle, deps.cursor ?? null)
  else if (deps.unpaired) renderRepair(deps.unpaired)
  else renderForm()
  return api
}
