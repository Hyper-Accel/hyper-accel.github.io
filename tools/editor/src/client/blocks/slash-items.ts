import type { Editor, JSONContent } from "@tiptap/core"
import { ALERT_TYPES } from "../../shared/onsite/blocks"
import { ALERT_LABELS, type AlertType } from "../shortcode"
import { ALERT_NODE } from "./alert"
import { EMPTY_IMAGE } from "./attrs"
import { COMPARE_NODE } from "./compare"
import { IMAGE_NODE } from "./image"
import { MATH_BLOCK_NODE } from "./math"
import { slashMenuKey } from "./slash-state"
import { STEPS_NODE } from "./steps"
import { TAB_NODE, TABS_NODE, tabParams } from "./tabs"

export interface SlashMenuItem {
  readonly id: string
  readonly label: string
  /** One line under the label, as in Confluence's insert menu. */
  readonly description?: string
  /** Short glyph shown in the item's icon tile. */
  readonly icon?: string
  /** Asks for a row × column size before inserting (tables). */
  readonly sizeGrid?: boolean
  readonly hint: string
  readonly keywords: readonly string[]
  readonly content: () => JSONContent
  readonly request?: (editor: Editor) => void
  /** Offset into the inserted content for the caret, or `null` to select the inserted node. */
  readonly caret: number | null
}

/** Deferred tools remove the slash query, then insert only after valid input. */
export function requestSlashItem(
  editor: Editor,
  item: SlashMenuItem,
  range: { readonly from: number; readonly to: number },
): boolean {
  if (!item.request) return false
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .command(({ tr }) => {
      tr.setMeta(slashMenuKey, null)
      return true
    })
    .run()
  item.request(editor)
  return true
}

function alertItem(type: AlertType): SlashMenuItem {
  return {
    id: `alert-${type.toLowerCase()}`,
    label: `콜아웃 · ${ALERT_LABELS[type]}`,
    description: "눈에 띄는 안내 상자",
    icon: "!",
    hint: `> [!${type}]`,
    keywords: ["alert", "callout", "콜아웃", "알림", type.toLowerCase(), ALERT_LABELS[type]],
    content: () => ({ type: ALERT_NODE, attrs: { type }, content: [{ type: "paragraph" }] }),
    caret: 2,
  }
}

const paragraph = (): JSONContent => ({ type: "paragraph" })

function headingItem(level: 1 | 2 | 3): SlashMenuItem {
  return {
    id: `heading-${level}`,
    label: `제목 ${level}`,
    description:
      level === 1 ? "가장 큰 제목" : level === 2 ? "목차에 보이는 단락 제목" : "작은 소제목",
    icon: `H${level}`,
    hint: `${"#".repeat(level)} `,
    keywords: ["heading", `h${level}`, "제목", "헤딩"],
    content: () => ({ type: "heading", attrs: { level } }),
    caret: 1,
  }
}

/** A GitHub-flavoured table with a header row, as written in Markdown. */
export function tableContent(rows: number, columns: number): JSONContent {
  const row = (cell: string): JSONContent => ({
    type: "tableRow",
    content: Array.from({ length: columns }, () => ({ type: cell, content: [paragraph()] })),
  })
  return {
    type: "table",
    content: [
      row("tableHeader"),
      ...Array.from({ length: Math.max(1, rows - 1) }, () => row("tableCell")),
    ],
  }
}

export function slashMenuItems(): SlashMenuItem[] {
  return [
    {
      id: "youtube",
      label: "동영상",
      description: "YouTube 주소로 동영상 넣기",
      icon: "▷",
      hint: "{{< youtube >}}",
      keywords: ["youtube", "video", "동영상", "영상"],
      content: () => ({ type: "youtube", attrs: { videoId: "" } }),
      caret: null,
    },
    headingItem(2),
    headingItem(3),
    headingItem(1),
    {
      id: "bullet-list",
      label: "글머리 기호 목록",
      description: "순서 없는 목록",
      icon: "•",
      hint: "- ",
      keywords: ["list", "bullet", "ul", "목록", "글머리"],
      content: () => ({
        type: "bulletList",
        content: [{ type: "listItem", content: [paragraph()] }],
      }),
      caret: 3,
    },
    {
      id: "ordered-list",
      label: "번호 목록",
      description: "순서 있는 목록",
      icon: "1.",
      hint: "1. ",
      keywords: ["list", "ordered", "number", "ol", "번호", "목록"],
      content: () => ({
        type: "orderedList",
        attrs: { start: 1 },
        content: [{ type: "listItem", content: [paragraph()] }],
      }),
      caret: 3,
    },
    {
      id: "table",
      label: "표",
      description: "행과 열 수를 골라 표 넣기",
      icon: "▦",
      hint: "| |",
      keywords: ["table", "grid", "표", "테이블"],
      sizeGrid: true,
      content: () => tableContent(3, 3),
      caret: 4,
    },
    {
      id: "quote",
      label: "인용",
      description: "인용문 블록",
      icon: "❝",
      hint: "> ",
      keywords: ["quote", "blockquote", "인용"],
      content: () => ({ type: "blockquote", content: [paragraph()] }),
      caret: 2,
    },
    {
      id: "code",
      label: "코드 블록",
      description: "코드를 그대로 보여 주기",
      icon: "{ }",
      hint: "```",
      keywords: ["code", "codeblock", "코드"],
      content: () => ({ type: "codeBlock" }),
      caret: 1,
    },
    {
      id: "divider",
      label: "구분선",
      description: "단락 사이 가로선",
      icon: "—",
      hint: "---",
      keywords: ["divider", "hr", "rule", "구분선", "선"],
      content: () => ({ type: "horizontalRule" }),
      caret: null,
    },
    {
      id: "image",
      label: "이미지",
      description: "본문에 그림 넣기",
      icon: "▣",
      hint: "![alt](images/…)",
      keywords: ["image", "img", "picture", "photo", "이미지", "사진", "그림"],
      content: () => ({ type: IMAGE_NODE, attrs: { ...EMPTY_IMAGE } }),
      caret: null,
    },
    {
      id: "steps",
      label: "단계",
      description: "번호가 매겨진 절차",
      icon: "≡",
      hint: "{{< steps >}}",
      keywords: ["steps", "step", "단계", "순서", "절차"],
      content: () => ({
        type: STEPS_NODE,
        content: [
          {
            type: "orderedList",
            attrs: { start: 1 },
            content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
          },
        ],
      }),
      caret: 4,
    },
    {
      id: "compare",
      label: "전후 비교",
      description: "슬라이더로 전후 그림 비교",
      icon: "⇆",
      hint: "{{< compare >}}",
      keywords: ["compare", "before", "after", "slider", "비교", "전후", "슬라이더"],
      content: () => ({ type: COMPARE_NODE }),
      caret: null,
    },
    {
      id: "tabs",
      label: "탭",
      description: "내용을 탭으로 나누기",
      icon: "⊟",
      hint: "{{< tabs >}}",
      keywords: ["tabs", "tab", "탭"],
      content: () => ({
        type: TABS_NODE,
        content: [1, 2].map((index) => ({
          type: TAB_NODE,
          attrs: { params: tabParams(`탭 ${index}`) },
          content: [{ type: "paragraph" }],
        })),
      }),
      caret: 3,
    },
    {
      id: "math",
      label: "수식",
      description: "LaTeX 수식 블록",
      icon: "∑",
      hint: "$$ … $$",
      keywords: ["math", "latex", "katex", "equation", "수식", "수학"],
      content: () => ({ type: MATH_BLOCK_NODE, attrs: { source: "" } }),
      caret: null,
    },
    ...ALERT_TYPES.map(alertItem),
  ]
}
