import { el } from "./dom"
import { type InsertKind, PAIR_MAX, PAIR_NODE, rowsOf, SLIDES_NODE } from "./image-groups"

interface Choice {
  readonly kind: InsertKind
  readonly label: string
  readonly detail: (count: number) => string
  /** Tiles of the little layout picture. */
  readonly tiles: number
}

const CHOICES: readonly Choice[] = [
  { kind: "single", label: "개별 사진", detail: () => "한 장씩 크게", tiles: 1 },
  {
    kind: PAIR_NODE,
    label: "나란히",
    detail: (count) =>
      count <= PAIR_MAX
        ? `한 줄에 ${count}장`
        : `한 줄에 3장까지 (${rowsOf([...Array(count).keys()])
            .map((row) => row.length)
            .join(" + ")})`,
    tiles: 3,
  },
  { kind: SLIDES_NODE, label: "슬라이드", detail: () => "한 장씩 넘겨 보기", tiles: 0 },
]

/**
 * Naver's "사진 첨부 방식": when several pictures go in at once, a small menu beside the caret (or
 * the 사진 button) asks how. Escape or a click elsewhere puts them in one by one.
 */
export function chooseInsertKind(
  anchor: { readonly x: number; readonly y: number },
  count: number,
): Promise<InsertKind> {
  return new Promise((resolve) => {
    const buttons = CHOICES.map((choice) => {
      const picture = el(
        "span",
        { className: `onsite-insert-kind__picture is-${choice.kind}`, "aria-hidden": "true" },
        choice.tiles === 0
          ? [el("span"), el("span", { className: "onsite-insert-kind__arrows" }, ["‹ ›"])]
          : Array.from({ length: choice.tiles }, () => el("span")),
      )
      const button = el(
        "button",
        { type: "button", className: "onsite-insert-kind__option", "data-kind": choice.kind },
        [
          picture,
          el("span", { className: "onsite-insert-kind__label" }, [choice.label]),
          el("span", { className: "onsite-insert-kind__detail" }, [choice.detail(count)]),
        ],
      )
      button.addEventListener("click", () => finish(choice.kind))
      return button
    })
    const menu = el(
      "div",
      {
        className: "onsite-insert-kind",
        role: "dialog",
        "aria-label": `사진 ${count}장 넣는 방식`,
        "data-onsite-ui": true,
      },
      [
        el("p", { className: "onsite-insert-kind__title" }, [`사진 ${count}장을 어떻게 넣을까요?`]),
        el("div", { className: "onsite-insert-kind__options" }, buttons),
      ],
    )
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        finish("single")
        return
      }
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
      if (!step) return
      event.preventDefault()
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
      buttons[(at + step + buttons.length) % buttons.length]?.focus()
    }
    const onOutside = (event: MouseEvent): void => {
      if (!(event.target instanceof Node && menu.contains(event.target))) finish("single")
    }
    function finish(kind: InsertKind): void {
      document.removeEventListener("keydown", onKey, true)
      document.removeEventListener("mousedown", onOutside, true)
      menu.remove()
      resolve(kind)
    }
    document.body.append(menu)
    const rect = menu.getBoundingClientRect()
    const left = Math.max(
      8,
      Math.min(anchor.x - rect.width / 2, window.innerWidth - rect.width - 8),
    )
    const below = anchor.y + 8
    const top =
      below + rect.height <= window.innerHeight - 8
        ? below
        : Math.max(8, anchor.y - rect.height - 8)
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
    document.addEventListener("keydown", onKey, true)
    document.addEventListener("mousedown", onOutside, true)
    buttons[0]?.focus()
  })
}
