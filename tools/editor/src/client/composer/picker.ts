import { h, replaceChildren } from "./dom"

/**
 * Dropdown picker for metadata such as authors, category, tags and series: chips for the
 * chosen values, a search box that opens the list, and "새로 추가" when nothing matches.
 * Each option keeps a real checkbox/radio named after the field, so the form reads it as before.
 */
export interface PickerOption {
  readonly value: string
  /** What the writer sees when it differs from the stored value (a person's name for a handle). */
  readonly label?: string
  /** Secondary text such as a GitHub handle. */
  readonly detail?: string
}

export interface PickerCreate {
  readonly label: (text: string) => string
  /** Returns the value to add (it may differ from the typed text), or null to cancel. */
  readonly run: (text: string) => Promise<string | null> | string | null
}

export interface PickerSpec {
  readonly id: string
  readonly legend: string
  readonly name: string
  readonly queryName: string
  readonly multiple: boolean
  readonly placeholder: string
  readonly options: readonly PickerOption[]
  readonly selected: readonly string[]
  readonly create?: PickerCreate
  /** Comma-separated typing adds several values at once (tags). */
  readonly splitOnComma?: boolean
  /** Extra controls shown under the box, e.g. "내 프로필 추가". */
  readonly footer?: HTMLElement
  /** Called after the chosen values change, wherever the picker is placed. */
  readonly onChange?: () => void
}

export interface Picker {
  readonly element: HTMLFieldSetElement
  readonly query: HTMLInputElement
  values(): string[]
  set(values: readonly string[]): void
  /** Adds (or re-checks) an option and announces the change. */
  add(option: PickerOption): void
}

interface Entry {
  readonly option: PickerOption
  readonly key: string
  /** The shown name's search key (the same as key when there is no separate label). */
  readonly labelKey: string
  readonly input: HTMLInputElement
  readonly item: HTMLLIElement
}

export function searchKey(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, "")
}

export function createPicker(spec: PickerSpec): Picker {
  const entries: Entry[] = []
  const chips = h("span", { class: "metadata-picker__chips" })
  const query = h("input", {
    type: "text",
    name: spec.queryName,
    class: "metadata-picker__query metadata-choices__query",
    autocomplete: "off",
    placeholder: spec.placeholder,
    role: "combobox",
    "aria-expanded": "false",
    "aria-controls": `${spec.id}-menu`,
    "aria-label": `${spec.legend} 찾기`,
  })
  const list = h("ul", {
    class: "metadata-picker__list",
    role: "listbox",
    "aria-multiselectable": String(spec.multiple),
  })
  const createButton = h("button", {
    type: "button",
    class: "metadata-picker__create",
    hidden: true,
  })
  const empty = h(
    "p",
    { class: "metadata-picker__empty", hidden: true },
    "일치하는 항목이 없습니다.",
  )
  const menu = h(
    "div",
    { class: "metadata-picker__menu", id: `${spec.id}-menu`, hidden: true },
    list,
    empty,
    createButton,
  )
  const box = h("div", { class: "metadata-picker__box" }, chips, query)
  const element = h(
    "fieldset",
    { class: "metadata-choices metadata-picker", "data-picker": spec.name },
    h("legend", { class: "composer-field__label" }, spec.legend),
    // The dropdown hangs directly under the search box.
    h("div", { class: "metadata-picker__anchor" }, box, menu),
    spec.footer ?? null,
  )
  let active = -1

  const visible = (): HTMLElement[] => [
    ...entries.filter((entry) => !entry.item.hidden).map((entry) => entry.item),
    ...(createButton.hidden ? [] : [createButton]),
  ]

  const renderChips = (): void => {
    replaceChildren(
      chips,
      ...entries
        .filter((entry) => entry.input.checked)
        .map((entry) =>
          h(
            "span",
            { class: "metadata-chip", "data-value": entry.option.value },
            entry.option.label ?? entry.option.value,
            h(
              "button",
              {
                type: "button",
                class: "metadata-chip__remove",
                "aria-label": `${entry.option.label ?? entry.option.value} 빼기`,
                onclick: () => {
                  entry.input.checked = false
                  entry.input.dispatchEvent(new Event("change", { bubbles: true }))
                  query.focus()
                },
              },
              "×",
            ),
          ),
        ),
    )
  }

  const highlight = (index: number): void => {
    const items = visible()
    active = items.length === 0 ? -1 : (index + items.length) % items.length
    for (const [position, item] of items.entries())
      item.classList.toggle("is-active", position === active)
    items[active]?.scrollIntoView({ block: "nearest" })
  }

  const filter = (): void => {
    const text = query.value.trim()
    const needle = searchKey(text)
    let shown = 0
    for (const entry of entries) {
      entry.item.hidden =
        needle !== "" &&
        !entry.key.includes(needle) &&
        !entry.labelKey.includes(needle) &&
        !searchKey(entry.option.detail ?? "").includes(needle)
      if (!entry.item.hidden) shown += 1
    }
    const exact = entries.some((entry) => entry.key === needle || entry.labelKey === needle)
    createButton.hidden = !spec.create || text === "" || exact
    if (spec.create && !createButton.hidden) createButton.textContent = spec.create.label(text)
    empty.hidden = shown > 0 || !createButton.hidden
    highlight(0)
  }

  const open = (): void => {
    if (!menu.hidden) return
    menu.hidden = false
    query.setAttribute("aria-expanded", "true")
    filter()
  }
  const close = (): void => {
    menu.hidden = true
    query.setAttribute("aria-expanded", "false")
    active = -1
  }

  const choose = (entry: Entry): void => {
    entry.input.checked = spec.multiple ? !entry.input.checked : true
    entry.input.dispatchEvent(new Event("change", { bubbles: true }))
    // Picking closes the list so it never covers the next field; typing opens it again.
    query.value = ""
    close()
  }

  const entryFor = (option: PickerOption): Entry => {
    const input = h("input", {
      type: spec.multiple ? "checkbox" : "radio",
      name: spec.name,
      value: option.value,
      tabindex: "-1",
    })
    const item = h(
      "li",
      { role: "option" },
      h(
        "label",
        { class: "metadata-choice" },
        input,
        h("span", { class: "metadata-choice__name" }, option.label ?? option.value),
        option.detail ? h("span", { class: "metadata-choice__detail" }, option.detail) : null,
      ),
    )
    const entry = {
      option,
      key: searchKey(option.value),
      labelKey: searchKey(option.label ?? option.value),
      input,
      item,
    }
    // The option label toggles the input; a click on the radio itself closes the list.
    input.addEventListener("click", () => {
      query.value = ""
      close()
      query.focus()
    })
    return entry
  }

  const append = (option: PickerOption): Entry => {
    const entry = entryFor(option)
    entries.push(entry)
    list.append(entry.item)
    return entry
  }
  for (const option of spec.options) append(option)

  const add = (option: PickerOption): void => {
    const entry =
      entries.find((candidate) => candidate.option.value === option.value) ?? append(option)
    entry.input.checked = true
    entry.input.dispatchEvent(new Event("change", { bubbles: true }))
  }

  const createFrom = async (text: string): Promise<void> => {
    if (!spec.create) return
    const value = await spec.create.run(text)
    if (!value) return
    add({ value })
    query.value = ""
    close()
    query.focus()
  }

  createButton.addEventListener("click", () => void createFrom(query.value.trim()))
  query.addEventListener("click", open)
  query.addEventListener("input", () => {
    if (spec.splitOnComma && query.value.includes(",")) {
      const parts = query.value.split(",")
      query.value = parts.pop() ?? ""
      for (const part of parts) {
        const text = part.trim()
        if (!text) continue
        const existing = entries.find((entry) => entry.key === searchKey(text))
        if (existing) {
          existing.input.checked = true
          existing.input.dispatchEvent(new Event("change", { bubbles: true }))
        } else void createFrom(text)
      }
    }
    open()
    filter()
  })
  query.addEventListener("keydown", (event) => {
    if (event.isComposing) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      open()
      highlight(active + (event.key === "ArrowDown" ? 1 : -1))
    } else if (event.key === "Enter") {
      event.preventDefault()
      const target = visible()[active]
      if (target === createButton) void createFrom(query.value.trim())
      else {
        const entry = entries.find((candidate) => candidate.item === target)
        if (entry && !menu.hidden) choose(entry)
      }
    } else if (event.key === "Escape" && !menu.hidden) {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === "Backspace" && query.value === "" && spec.multiple) {
      const last = [...entries].reverse().find((entry) => entry.input.checked)
      if (last) {
        last.input.checked = false
        last.input.dispatchEvent(new Event("change", { bubbles: true }))
      }
    }
  })
  element.addEventListener("focusout", (event) => {
    if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return
    close()
  })
  // Pointer presses inside the menu must not blur the search box first.
  menu.addEventListener("mousedown", (event) => {
    if (!(event.target instanceof HTMLInputElement)) event.preventDefault()
  })
  element.addEventListener("change", () => {
    renderChips()
    spec.onChange?.()
  })

  return {
    element,
    query,
    values: () => entries.filter((entry) => entry.input.checked).map((entry) => entry.option.value),
    set(values) {
      for (const value of values)
        if (!entries.some((entry) => entry.option.value === value)) append({ value })
      for (const entry of entries) entry.input.checked = values.includes(entry.option.value)
      renderChips()
    },
    add,
  }
}
