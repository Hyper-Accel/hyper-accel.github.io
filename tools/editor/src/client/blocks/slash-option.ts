import { shortcutHint } from "../composer/shortcuts"
import { el } from "./dom"
import type { SlashMenuItem } from "./slash-items"

/** One accessible result in the slash insert list. */
export function slashOption(
  item: SlashMenuItem,
  selected: boolean,
  choose: () => void,
): HTMLElement {
  const option = el(
    "button",
    {
      type: "button",
      role: "option",
      className: "onsite-slash__item",
      "aria-selected": String(selected),
      "data-item": item.id,
      title: `${item.label}${shortcutHint(item.id) ? ` (${shortcutHint(item.id)})` : ""}`,
    },
    [
      el("span", {
        className: "onsite-slash__icon",
        "aria-hidden": "true",
        textContent: item.icon ?? "+",
      }),
      el("span", { className: "onsite-slash__text" }, [
        el("span", { className: "onsite-slash__label", textContent: item.label }),
        item.description
          ? el("span", { className: "onsite-slash__description", textContent: item.description })
          : null,
      ]),
      el("span", { className: "onsite-slash__hint", textContent: item.hint }),
    ],
  )
  option.addEventListener("click", choose)
  return option
}
