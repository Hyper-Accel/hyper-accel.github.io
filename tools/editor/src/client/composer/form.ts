import "./metadata-form.css"
import { type NewAuthorProfile, requestAuthorProfile } from "./author-profile"
import { h, replaceChildren } from "./dom"
import { imageChooser } from "./image-chooser"
import {
  fromDateTimeLocal,
  metadataErrors,
  type PostMetadata,
  slugify,
  toDateTimeLocal,
} from "./metadata"
import { createPicker, type PickerCreate } from "./picker"

export interface MetadataFormOptions {
  readonly mode: "create" | "edit"
  readonly initial: PostMetadata
  readonly authors: readonly string[]
  readonly categories: readonly string[]
  readonly onChange: (metadata: PostMetadata) => void
  readonly onSubmit?: (metadata: PostMetadata) => void
  readonly onCoverFile: (file: File) => Promise<string | null>
  readonly coverPreviewUrl: (path: string) => string | undefined
  /** GitHub handles shown beside author names, and used to find the signed-in writer. */
  readonly people?: readonly { readonly name: string; readonly handle: string }[]
  /** Existing tags and series across the blog, offered in their dropdowns. */
  readonly tags?: readonly string[]
  readonly series?: readonly string[]
  /** The signed-in GitHub login; offers "내 프로필 추가" when no author has it yet. */
  readonly currentLogin?: string
  /** A new author was added; the site saves their profile with the post. */
  readonly onNewAuthor?: (profile: NewAuthorProfile) => void
  /** Lets the category dropdown add a category that is not in the list. */
  readonly createCategory?: PickerCreate
  /** Only authors may change who else can edit; others see the list read-only. */
  readonly lockEditors?: boolean
}

export interface MetadataForm {
  readonly element: HTMLFormElement
  /** Lends the tag picker to the post footer; `returnTags` puts it back in the form. */
  lendTags(): HTMLElement
  returnTags(): void
  read(): PostMetadata
  setMetadata(metadata: PostMetadata): void
  setErrors(errors: readonly string[]): void
}

interface FieldOptions {
  readonly wide?: boolean
  readonly title?: boolean
  readonly hint?: string
}

function field(label: string, control: HTMLElement, options: FieldOptions = {}): HTMLLabelElement {
  const classes = ["metadata-field"]
  if (options.wide) classes.push("metadata-field--wide")
  if (options.title) classes.push("metadata-field--title")
  return h(
    "label",
    { class: classes.join(" ") },
    h("span", { class: "composer-field__label" }, label),
    control,
    options.hint ? h("small", { class: "composer-field__hint" }, options.hint) : null,
  )
}

interface GroupSpec {
  readonly id: string
  readonly title: string
  readonly note?: string
}

function group(spec: GroupSpec, ...fields: readonly HTMLElement[]): HTMLDivElement {
  return h(
    "div",
    { class: "metadata-group", role: "group", "aria-labelledby": spec.id },
    h(
      "p",
      { class: "metadata-group__title", id: spec.id },
      spec.title,
      spec.note ? h("span", { class: "metadata-group__note" }, spec.note) : null,
    ),
    h("div", { class: "metadata-group__fields" }, ...fields),
  )
}

let instances = 0

export function createMetadataForm(options: MetadataFormOptions): MetadataForm {
  const create = options.mode === "create"
  instances += 1
  const prefix = `metadata-form-${instances}`
  let cover = options.initial.cover
  let slugTouched = !create || options.initial.slug !== ""

  const titleKo = h("input", { name: "titleKo", lang: "ko", autocomplete: "off" })
  const titleEn = h("input", { name: "titleEn", lang: "en", autocomplete: "off" })
  const slug = h("input", {
    name: "slug",
    lang: "en",
    autocomplete: "off",
    spellcheck: "false",
    readonly: !create,
  })
  const date = h("input", { name: "date", type: "datetime-local" })
  const knownAuthors = new Set(options.authors)
  const handleOf = (name: string): string | undefined =>
    options.people?.find((person) => person.name === name)?.handle
  const addAuthor = async (text: string, github?: string): Promise<string | null> => {
    const profile = await requestAuthorProfile({
      name: text,
      ...(github ? { github } : {}),
      taken: [...knownAuthors],
      host: form.closest<HTMLElement>(".composer") ?? document.body,
    })
    if (!profile) return null
    knownAuthors.add(profile.name)
    options.onNewAuthor?.(profile)
    return profile.name
  }
  const login = options.currentLogin
  const ownProfile =
    login && !options.people?.some((person) => person.handle.toLowerCase() === login.toLowerCase())
      ? h(
          "button",
          { type: "button", class: "composer-link metadata-picker__self" },
          `내 프로필 추가 (@${login})`,
        )
      : null
  const authorPicker = createPicker({
    onChange: () => emit(),
    id: `${prefix}-authors`,
    legend: "작성자",
    name: "authors",
    queryName: "authorQuery",
    multiple: true,
    placeholder: "이름 또는 @아이디로 찾기",
    options: options.authors.map((value) => {
      const handle = handleOf(value)
      return handle ? { value, detail: `@${handle}` } : { value }
    }),
    selected: options.initial.authors,
    create: { label: (text) => `‘${text}’ 새 작성자로 추가`, run: (text) => addAuthor(text) },
    ...(ownProfile ? { footer: ownProfile } : {}),
  })
  ownProfile?.addEventListener("click", () => {
    void addAuthor("", login).then((name) => {
      if (!name) return
      authorPicker.add({ value: name, detail: `@${login}` })
      ownProfile.remove()
    })
  })
  const categoryPicker = createPicker({
    onChange: () => emit(),
    id: `${prefix}-category`,
    legend: "카테고리",
    name: "category",
    queryName: "categoryQuery",
    multiple: false,
    placeholder: "카테고리 선택",
    options: options.categories.map((value) => ({ value })),
    selected: options.initial.category ? [options.initial.category] : [],
    ...(options.createCategory ? { create: options.createCategory } : {}),
  })
  const tagPicker = createPicker({
    onChange: () => emit(),
    id: `${prefix}-tags`,
    legend: "태그",
    name: "tags",
    queryName: "tagQuery",
    multiple: true,
    placeholder: "태그 찾기 또는 입력",
    options: (options.tags ?? []).map((value) => ({ value })),
    selected: options.initial.tags,
    create: { label: (text) => `‘${text}’ 태그 추가`, run: (text) => text },
    splitOnComma: true,
  })
  const editorPicker = createPicker({
    onChange: () => emit(),
    id: `${prefix}-editors`,
    legend: "편집 허용",
    name: "editors",
    queryName: "editorQuery",
    multiple: true,
    placeholder: "이름 또는 @아이디로 찾기",
    // People, as in 작성자: the name shown with the handle; the stored value is the handle.
    options: (options.people ?? []).map((person) => ({
      value: person.handle,
      label: person.name,
      detail: `@${person.handle}`,
    })),
    selected: options.initial.editors,
    create: {
      label: (text) => `@${text.replace(/^@/, "")} 추가`,
      run: (text) => {
        const handle = text.trim().replace(/^@/, "")
        return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(handle) ? handle : null
      },
    },
  })
  if (options.lockEditors) {
    editorPicker.element.disabled = true
    editorPicker.element.title = "편집 허용은 작성자만 바꿀 수 있습니다."
  }
  const seriesPicker = createPicker({
    onChange: () => emit(),
    id: `${prefix}-series`,
    legend: "시리즈",
    name: "series",
    queryName: "seriesQuery",
    multiple: false,
    placeholder: "시리즈 찾기 또는 입력",
    options: (options.series ?? []).map((value) => ({ value })),
    selected: options.initial.series ? [options.initial.series] : [],
    create: { label: (text) => `‘${text}’ 새 시리즈로 추가`, run: (text) => text },
  })
  const seriesIndex = h("input", {
    name: "seriesIndex",
    type: "number",
    step: "0.5",
    min: "0",
    inputmode: "decimal",
  })
  const coverPreview = h("img", { class: "composer-cover__preview", alt: "", hidden: true })
  const coverFile = h("input", {
    name: "coverFile",
    type: "file",
    accept: "image/*",
    class: "composer-sr-only",
  })
  const coverRemove = h(
    "button",
    { type: "button", name: "removeCover", class: "composer-button", hidden: true },
    "커버 제거",
  )
  const coverAlt = h("input", { name: "coverAlt", autocomplete: "off" })
  const coverStatus = h("span", { class: "composer-cover__status", "aria-live": "polite" })
  const draft = h("input", { name: "draft", type: "checkbox" })
  const errors = h("ul", { class: "composer-form__errors", role: "alert", hidden: true })

  const form = h(
    "form",
    { class: "composer-form", novalidate: true, "data-mode": options.mode },
    h(
      "div",
      { class: "metadata-groups" },
      group(
        { id: `${prefix}-titles`, title: "제목" },
        field("한국어 제목", titleKo, { wide: true, title: true }),
        field("English title", titleEn, { wide: true, title: true }),
        h(
          "label",
          { class: "metadata-field metadata-field--wide" },
          h("span", { class: "composer-field__label" }, "슬러그"),
          h(
            "span",
            { class: "metadata-slug" },
            h("span", { class: "metadata-slug__affix", "aria-hidden": "true" }, "/posts/"),
            slug,
            h("span", { class: "metadata-slug__affix", "aria-hidden": "true" }, "/"),
          ),
          create
            ? h(
                "small",
                { class: "composer-field__hint" },
                "English title로 만들어집니다 (영문 소문자·숫자·하이픈).",
              )
            : null,
        ),
      ),
      group(
        { id: `${prefix}-people`, title: "작성자와 분류" },
        authorPicker.element,
        categoryPicker.element,
        tagPicker.element,
        editorPicker.element,
      ),
      group(
        { id: `${prefix}-publish`, title: "게시" },
        field("작성일", date),
        h("label", { class: "metadata-check" }, draft, h("span", {}, "사이트에 숨김 (Hugo draft)")),
      ),
      group(
        { id: `${prefix}-extras`, title: "시리즈와 커버", note: "선택" },
        seriesPicker.element,
        field("시리즈 순서", seriesIndex),
        h(
          "div",
          { class: "metadata-cover" },
          h("span", { class: "composer-field__label" }, "커버 이미지"),
          h(
            "div",
            { class: "metadata-cover__media" },
            coverPreview,
            h(
              "div",
              { class: "metadata-cover__controls" },
              h("label", { class: "composer-button" }, "이미지 선택", coverFile),
              coverRemove,
              coverStatus,
            ),
          ),
          field("커버 대체 텍스트", coverAlt, { wide: true }),
        ),
      ),
    ),
    errors,
    create
      ? h(
          "div",
          { class: "composer-form__actions" },
          h(
            "button",
            { type: "submit", class: "composer-button composer-button--primary" },
            "작성 시작",
          ),
        )
      : null,
  )

  const read = (): PostMetadata => ({
    slug: slug.value.trim(),
    title: { ko: titleKo.value.trim(), en: titleEn.value.trim() },
    authors: authorPicker.values(),
    category: categoryPicker.values()[0] ?? "",
    tags: tagPicker.values(),
    series: seriesPicker.values()[0] ?? "",
    editors: editorPicker.values(),
    seriesIndex: seriesIndex.value === "" ? null : Number(seriesIndex.value),
    cover: cover ? { image: cover.image, alt: coverAlt.value.trim() } : null,
    date: fromDateTimeLocal(date.value, options.initial.date),
    draft: draft.checked,
  })

  const renderCover = (): void => {
    const url = cover ? options.coverPreviewUrl(cover.image) : undefined
    coverPreview.hidden = !url
    if (url) coverPreview.src = url
    coverRemove.hidden = !cover
    coverStatus.textContent = cover ? cover.image : "선택된 이미지 없음"
  }

  const setMetadata = (metadata: PostMetadata): void => {
    titleKo.value = metadata.title.ko
    titleEn.value = metadata.title.en
    slug.value = metadata.slug
    date.value = toDateTimeLocal(metadata.date)
    authorPicker.set(metadata.authors)
    categoryPicker.set(metadata.category ? [metadata.category] : [])
    tagPicker.set(metadata.tags)
    seriesPicker.set(metadata.series ? [metadata.series] : [])
    editorPicker.set(metadata.editors)
    seriesIndex.value = metadata.seriesIndex === null ? "" : String(metadata.seriesIndex)
    cover = metadata.cover
    coverAlt.value = metadata.cover?.alt ?? ""
    draft.checked = metadata.draft
    renderCover()
  }

  const setErrors = (messages: readonly string[]): void => {
    errors.hidden = messages.length === 0
    replaceChildren(errors, ...messages.map((message) => h("li", {}, message)))
  }

  const emit = (event?: Event): void => {
    const target = event?.target
    // Pickers report their own changes, even while the tag picker sits under the post.
    if (create || (target instanceof Element && target.closest(".metadata-picker"))) return
    options.onChange(read())
  }

  titleEn.addEventListener("input", () => {
    if (!slugTouched) slug.value = slugify(titleEn.value)
  })
  slug.addEventListener("input", () => {
    slugTouched = slug.value !== ""
  })
  // 이미지 선택 opens the 라이브러리 like every picture button (pick there, or add/paste a picture
  // into it first); without a library it is the file picker.
  coverFile.closest("label")?.addEventListener("click", (event) => {
    const choose = imageChooser.current
    if (!choose || coverFile.disabled) return
    event.preventDefault()
    void choose(false).then(([choice]) => {
      if (!choice) return
      cover = { image: choice.src, alt: coverAlt.value.trim() }
      renderCover()
      emit()
    })
  })
  coverFile.addEventListener("change", () => {
    const file = coverFile.files?.[0]
    coverFile.value = ""
    if (!file) return
    coverStatus.textContent = "이미지를 WebP로 변환하는 중…"
    void options
      .onCoverFile(file)
      .then((path) => {
        if (path) cover = { image: path, alt: coverAlt.value.trim() }
        renderCover()
        if (!path) coverStatus.textContent = "이미지를 변환하지 못했습니다."
        emit()
      })
      .catch((error: unknown) => {
        coverStatus.textContent = error instanceof Error ? error.message : "이미지 변환 실패"
      })
  })
  coverRemove.addEventListener("click", () => {
    cover = null
    renderCover()
    emit()
  })
  form.addEventListener("input", emit)
  form.addEventListener("change", emit)
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const metadata = read()
    const problems = metadataErrors(metadata, [...knownAuthors])
    setErrors(problems)
    if (problems.length === 0) options.onSubmit?.(metadata)
  })

  setMetadata(options.initial)
  const tagSlot = document.createComment("tags")
  return {
    element: form,
    read,
    setMetadata,
    setErrors,
    lendTags() {
      if (!tagSlot.parentNode) tagPicker.element.before(tagSlot)
      return tagPicker.element
    },
    returnTags() {
      if (tagSlot.parentNode) tagSlot.replaceWith(tagPicker.element)
    },
  }
}
