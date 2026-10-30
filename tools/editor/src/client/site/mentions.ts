import { h } from "../composer/dom"

export interface Person {
  readonly name: string
  readonly handle: string
  readonly avatar?: string
}

/**
 * "@" autocomplete for comment boxes. Picking a person inserts their GitHub handle; GitHub then
 * notifies them when the pull request comment is posted.
 */
export function attachMentions(
  field: HTMLTextAreaElement,
  people: () => readonly Person[],
): () => void {
  const list = h("ul", {
    class: "composer-mention-list",
    role: "listbox",
    "aria-label": "멘션할 사람",
    hidden: true,
  })
  field.insertAdjacentElement("afterend", list)
  field.setAttribute("aria-autocomplete", "list")
  let matches: Person[] = []
  let index = 0
  const query = (): { readonly start: number; readonly text: string } | null => {
    const before = field.value.slice(0, field.selectionStart ?? field.value.length)
    const match = /(^|\s)@([A-Za-z0-9가-힣-]*)$/.exec(before)
    if (!match) return null
    return {
      start: before.length - (match[2] ?? "").length - 1,
      text: (match[2] ?? "").toLowerCase(),
    }
  }
  const render = (): void => {
    list.replaceChildren(
      ...matches.map((person, position) => {
        const option = h(
          "li",
          {
            role: "option",
            "aria-selected": String(position === index),
            "data-handle": person.handle,
          },
          person.avatar
            ? h("img", { src: person.avatar, alt: "", width: "20", height: "20" })
            : h("span", { class: "composer-mention-list__blank" }),
          h("strong", {}, person.name),
          h("span", {}, `@${person.handle}`),
        )
        option.addEventListener("mousedown", (event) => {
          event.preventDefault()
          choose(person)
        })
        return option
      }),
    )
    list.hidden = matches.length === 0
  }
  const update = (): void => {
    const current = query()
    if (!current) {
      matches = []
      render()
      return
    }
    matches = people()
      .filter(
        (person) =>
          person.handle.toLowerCase().includes(current.text) ||
          person.name.toLowerCase().replace(/\s+/g, "").includes(current.text),
      )
      .slice(0, 6)
    index = 0
    render()
  }
  const choose = (person: Person): void => {
    const current = query()
    if (!current) return
    const caret = field.selectionStart ?? field.value.length
    const text = `@${person.handle} `
    field.value = `${field.value.slice(0, current.start)}${text}${field.value.slice(caret)}`
    const next = current.start + text.length
    field.setSelectionRange(next, next)
    matches = []
    render()
    field.focus()
  }
  const onKey = (event: KeyboardEvent): void => {
    if (list.hidden || event.isComposing) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      index = (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length
      render()
    } else if (event.key === "Enter" || event.key === "Tab") {
      const person = matches[index]
      if (!person) return
      event.preventDefault()
      choose(person)
    } else if (event.key === "Escape") {
      event.preventDefault()
      matches = []
      render()
    }
  }
  field.addEventListener("input", update)
  field.addEventListener("click", update)
  field.addEventListener("keydown", onKey)
  return () => {
    field.removeEventListener("input", update)
    field.removeEventListener("click", update)
    field.removeEventListener("keydown", onKey)
    list.remove()
  }
}
