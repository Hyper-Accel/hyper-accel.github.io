import type { AllowedCategory } from "../../document/categories"

export interface TemplateRow {
  readonly ko: string
  readonly en: string
}

export interface PostTemplate {
  readonly id: string
  readonly label: string
  readonly description: string
  /** Picked for the post when no category was chosen yet. */
  readonly category?: AllowedCategory
  readonly rows: readonly TemplateRow[]
}

const HIRING: TemplateRow = {
  ko: "## 추신: HyperAccel은 채용 중입니다!",
  en: "## P.S. HyperAccel is hiring!",
}

/**
 * Recurring structures of this blog, taken from its posts (Naver's 템플릿): conference reports
 * follow pytorchcon2025-report / naverdan2025-report, deep dives follow cerebras-wse / cpu-revival.
 */
export const POST_TEMPLATES: readonly PostTemplate[] = [
  { id: "blank", label: "빈 글", description: "처음부터 자유롭게 씁니다.", rows: [] },
  {
    id: "conference",
    label: "컨퍼런스 리포트",
    description: "행사 소개, 주요 세션, 참관 후기",
    category: "Conference Reports",
    rows: [
      { ko: "## Introduction", en: "## Introduction" },
      { ko: "## 주요 사항", en: "## Highlights" },
      { ko: "## 참관 후기", en: "## Takeaways" },
      { ko: "## 추신", en: "## P.S." },
    ],
  },
  {
    id: "deep-dive",
    label: "기술 딥다이브",
    description: "왜 주목받는지부터 구조, 강점과 한계까지",
    rows: [
      { ko: "## 들어가며", en: "## Introduction" },
      { ko: "## 왜 주목받는가", en: "## Why it matters" },
      { ko: "## 구조 살펴보기", en: "## Architecture" },
      { ko: "## 강점과 한계", en: "## Strengths and limits" },
      { ko: "## 정리", en: "## Wrap-up" },
      { ko: "## Reference", en: "## Reference" },
      HIRING,
    ],
  },
  {
    id: "review",
    label: "논문·오픈소스 리뷰",
    description: "배경, 핵심 아이디어, 결과와 우리 관점",
    rows: [
      { ko: "## 들어가며", en: "## Introduction" },
      { ko: "## 배경", en: "## Background" },
      { ko: "## 핵심 아이디어", en: "## Key ideas" },
      { ko: "## 결과", en: "## Results" },
      { ko: "## HyperAccel의 관점", en: "## Our take" },
      { ko: "## Reference", en: "## Reference" },
    ],
  },
]
