import { h } from "./dom"

/**
 * A category colour made readable on the dark editor: very dark brand colours (LLM & 모델's navy)
 * keep their hue at a readable lightness; light ones are kept as they are.
 */
function readable(color: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color)
  if (!match?.[1]) return color
  const value = Number.parseInt(match[1], 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  const linear = channels.map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const luminance =
    0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
  if (luminance >= 0.2) return color
  // Same hue, raised to a readable lightness (mixing in white would grey it out).
  return `oklch(from ${color} 0.72 max(c, 0.13) h)`
}

/** The blog's own name and colour for a category, read from the site header's category menu. */
function siteCategory(value: string): { readonly name: string; readonly color: string } {
  const slug = value.toLowerCase().replace(/\s+/g, "-")
  const link = document.querySelector<HTMLAnchorElement>(`header a[href$="/categories/${slug}/"]`)
  return {
    name: link?.textContent?.trim() || value,
    color: readable(link?.style.getPropertyValue("--c").trim() || ""),
  }
}

/**
 * Shared by the new-post screen and 글 정보 수정: the seven categories as coloured chips picked in one
 * click (the picker's radios, all shown), named as on the site.
 */
export function categoryChips(form: HTMLElement): void {
  const picker = form.querySelector<HTMLElement>('[data-picker="category"]')
  if (!picker) return
  picker.classList.add("metadata-picker--chips")
  for (const input of picker.querySelectorAll<HTMLInputElement>('input[name="category"]')) {
    const label = input.closest<HTMLElement>("label")
    if (!label) continue
    const { name, color } = siteCategory(input.value)
    if (color) label.style.setProperty("--chip", color)
    const text = label.querySelector<HTMLElement>(".metadata-choice__name")
    if (text) text.textContent = name
  }
}

/** The field holding a control, by a name every state has (pickers by their search box). */
function field(form: HTMLElement, name: string): HTMLElement | null {
  return (
    form
      .querySelector(`[name="${name}"]`)
      ?.closest<HTMLElement>(
        ".metadata-choices, .metadata-cover, .metadata-check, .metadata-field",
      ) ?? null
  )
}

function section(title: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return h(
    "section",
    { class: "composer-create__section" },
    h("h3", {}, title),
    h("div", { class: "composer-create__fields" }, ...children.filter((child) => child !== null)),
  )
}

/** The post's card as it will sit on the home page, redrawn as the form changes. */
function cardPreview(form: HTMLElement): { element: HTMLElement; update(): void } {
  const cover = h("span", { class: "composer-card__cover" })
  const category = h("span", { class: "composer-card__category" })
  const title = h("strong", { class: "composer-card__title" })
  const byline = h("span", { class: "composer-card__byline" })
  const element = h(
    "div",
    { class: "composer-card", "aria-label": "홈 화면 카드 미리보기" },
    cover,
    h("span", { class: "composer-card__body" }, category, title, byline),
  )
  const update = (): void => {
    const value =
      form.querySelector<HTMLInputElement>('input[name="category"]:checked')?.value ?? ""
    const site = value ? siteCategory(value) : null
    element.style.setProperty("--chip", site?.color || "var(--editor-accent, #009ee2)")
    category.textContent = site?.name ?? "카테고리"
    category.classList.toggle("is-empty", !site)
    const text = form.querySelector<HTMLInputElement>('input[name="titleKo"]')?.value.trim() ?? ""
    title.textContent = text || "제목"
    title.classList.toggle("is-empty", !text)
    const authors = [
      ...form.querySelectorAll<HTMLInputElement>('input[name="authors"]:checked'),
    ].map(
      (input) =>
        input.closest("label")?.querySelector(".metadata-choice__name")?.textContent?.trim() ||
        input.value,
    )
    const date =
      form.querySelector<HTMLInputElement>('input[name="date"]')?.value.slice(0, 10) ?? ""
    byline.textContent = [authors.join(", ") || "작성자", date.replaceAll("-", ".")]
      .filter(Boolean)
      .join(" · ")
    const image = form.querySelector<HTMLImageElement>(".composer-cover__preview")
    const src = image && !image.hidden ? image.src : ""
    cover.style.backgroundImage = src ? `url("${src}")` : ""
    cover.classList.toggle("is-empty", !src)
  }
  return { element, update }
}

/**
 * The new post is a settings page on the wide layout: templates across the top, then the post's own
 * details on the left (titles, category and tags, cover) and, pinned on the right, how its card will
 * look on the home page with who, when, series and 작성 시작.
 */
export function layoutCreateForm(form: HTMLElement, templates: HTMLElement): void {
  categoryChips(form)
  const card = cardPreview(form)
  const groups = form.querySelector<HTMLElement>(".metadata-groups")
  const main = h(
    "div",
    { class: "composer-create__main" },
    section("기본 정보", field(form, "titleKo"), field(form, "titleEn"), field(form, "slug")),
    section("분류", field(form, "categoryQuery"), field(form, "tagQuery")),
    section("커버", field(form, "coverFile")),
  )
  const side = h(
    "aside",
    { class: "composer-create__side" },
    card.element,
    section(
      "발행",
      field(form, "authorQuery"),
      field(form, "editorQuery"),
      field(form, "date"),
      field(form, "seriesQuery"),
      field(form, "seriesIndex"),
      field(form, "draft"),
    ),
    form.querySelector<HTMLElement>(".composer-form__errors"),
    form.querySelector<HTMLElement>(".composer-form__actions"),
  )
  groups?.replaceWith(h("div", { class: "composer-create" }, main, side))
  form.prepend(templates)
  form.classList.add("composer-form--create-layout")
  form.addEventListener("input", card.update)
  form.addEventListener("change", card.update)
  // The cover preview changes after its file is read, without a form event.
  const preview = form.querySelector(".composer-cover__preview")
  if (preview)
    new MutationObserver(card.update).observe(preview, {
      attributes: true,
      attributeFilter: ["src", "hidden"],
    })
  card.update()
}
