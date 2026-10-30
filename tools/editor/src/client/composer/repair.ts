import { LANGUAGES } from "../../document/codec"
import {
  applyRepair,
  type RepairOperation,
  repairStatus,
  type UnpairedBundle,
} from "../../document/repair"
import type { Language } from "../../shared/onsite/document"
import { h, replaceChildren } from "./dom"
import { LANGUAGE_NAME } from "./pair-editor"

export interface RepairViewOptions {
  readonly unpaired: UnpairedBundle
  readonly onChange: (unpaired: UnpairedBundle) => void
}

export interface RepairView {
  readonly element: HTMLElement
  current(): UnpairedBundle
  dispose(): void
}

const OPERATION_LABEL = {
  insert: "위에 빈 블록",
  append: "여기에 빈 블록",
  merge: "다음과 합치기",
  up: "위로",
  down: "아래로",
  remove: "빈 블록 삭제",
} as const

function cellView(
  language: Language,
  index: number,
  blocks: readonly string[],
  counterpart: readonly string[],
): HTMLElement {
  const markdown = blocks[index]
  const missing = markdown === undefined
  const empty = !missing && markdown.trim() === ""
  const preview = h(
    "div",
    { class: "composer-cell__preview", "data-empty": String(missing || empty) },
    missing ? "블록 없음" : empty ? "빈 블록" : markdown,
  )
  const button = (
    label: string,
    operation: RepairOperation["type"],
    attributes: Readonly<Record<string, string | boolean>> = {},
  ): HTMLButtonElement =>
    h(
      "button",
      {
        type: "button",
        class: "composer-button composer-button--small",
        "data-op": operation,
        "data-lang": language,
        "data-index": String(Math.min(index, blocks.length)),
        ...attributes,
      },
      label,
    )
  const tools = h(
    "div",
    { class: "composer-cell__tools" },
    button(missing ? OPERATION_LABEL.append : OPERATION_LABEL.insert, "insert"),
    missing
      ? null
      : button(OPERATION_LABEL.merge, "merge", { disabled: index >= blocks.length - 1 }),
    missing
      ? null
      : button("↑", "move", {
          "data-direction": "-1",
          "aria-label": `${OPERATION_LABEL.up} (${LANGUAGE_NAME[language]})`,
          disabled: index === 0,
        }),
    missing
      ? null
      : button("↓", "move", {
          "data-direction": "1",
          "aria-label": `${OPERATION_LABEL.down} (${LANGUAGE_NAME[language]})`,
          disabled: index >= blocks.length - 1,
        }),
    empty ? button(OPERATION_LABEL.remove, "remove") : null,
  )
  return h(
    "div",
    {
      class: "composer-cell composer-cell--repair",
      "data-lang": language,
      lang: language,
      "data-missing": String(missing),
      "data-empty": String(empty),
      "aria-label": `${index + 1}번째 ${LANGUAGE_NAME[language]} 블록${
        missing ? " 없음" : counterpart[index] === undefined ? " (상대 언어 없음)" : ""
      }`,
    },
    preview,
    tools,
  )
}

export function createRepairView(options: RepairViewOptions): RepairView {
  let unpaired = options.unpaired
  const list = h("ol", {
    class: "composer-rows composer-rows--repair",
    "aria-label": "짝 맞춤 블록",
  })
  const element = h(
    "div",
    { class: "composer-repair" },
    h(
      "p",
      { class: "composer-repair__lead" },
      "두 언어의 블록 수가 달라 자동으로 짝을 맞출 수 없습니다. 한 언어에만 빈 블록을 끼워 넣거나, 블록을 다음 블록과 합치거나, 한쪽 순서만 바꿔 같은 행에 같은 내용이 오도록 맞춘 뒤 '짝 맞춤 완료'를 누르세요.",
    ),
    h(
      "div",
      { class: "composer-columns", "aria-hidden": "true" },
      h("span", {}, LANGUAGE_NAME.ko),
      h("span", {}, LANGUAGE_NAME.en),
    ),
    list,
  )

  function render(): void {
    const status = repairStatus(unpaired)
    const rows: HTMLElement[] = []
    for (let index = 0; index < status.rows; index += 1) {
      const koMissing = unpaired.ko.blocks[index] === undefined
      const enMissing = unpaired.en.blocks[index] === undefined
      const chipStatus = koMissing ? "missing-ko" : enMissing ? "missing-en" : "both"
      rows.push(
        h(
          "li",
          {
            class: "composer-row composer-row--repair",
            "data-row": String(index),
            "data-mismatch": String(koMissing || enMissing),
          },
          h(
            "div",
            { class: "composer-row__head" },
            h("span", { class: "composer-row__index" }, String(index + 1)),
            h(
              "span",
              { class: "composer-chip", "data-status": chipStatus },
              koMissing ? "한국어 없음" : enMissing ? "영어 없음" : "양쪽 있음",
            ),
          ),
          ...LANGUAGES.map((language) =>
            cellView(
              language,
              index,
              unpaired[language].blocks,
              unpaired[language === "ko" ? "en" : "ko"].blocks,
            ),
          ),
        ),
      )
    }
    replaceChildren(list, ...rows)
  }

  const onClick = (event: Event): void => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button[data-op]")
    if (!button || button.disabled) return
    const language: Language = button.dataset["lang"] === "en" ? "en" : "ko"
    const index = Number(button.dataset["index"])
    const type = button.dataset["op"]
    let operation: RepairOperation | null = null
    if (type === "insert" || type === "remove" || type === "merge") {
      operation = { type, language, index }
    } else if (type === "move") {
      operation = {
        type,
        language,
        index,
        direction: button.dataset["direction"] === "-1" ? -1 : 1,
      }
    }
    if (!operation) return
    const next = applyRepair(unpaired, operation)
    if (next === unpaired) return
    unpaired = next
    render()
    const focusIndex =
      operation.type === "move"
        ? operation.index + operation.direction
        : operation.type === "remove"
          ? Math.max(0, operation.index - 1)
          : operation.index
    const focusTarget =
      list.querySelector<HTMLButtonElement>(
        `button[data-op="${operation.type === "remove" ? "insert" : operation.type}"][data-lang="${language}"][data-index="${focusIndex}"]:not(:disabled)`,
      ) ?? list.querySelector<HTMLButtonElement>(`button[data-lang="${language}"]:not(:disabled)`)
    focusTarget?.focus({ preventScroll: true })
    options.onChange(unpaired)
  }
  list.addEventListener("click", onClick)
  render()

  return {
    element,
    current: () => unpaired,
    dispose() {
      list.removeEventListener("click", onClick)
      element.remove()
    },
  }
}
