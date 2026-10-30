import type { startFakeGitHub } from "./fake-github"

/**
 * Finished demo posts for the local site (dev-site.ts only, not the test harness), written in both
 * Korean and English so they can go straight to review:
 * - onsite-editor-tour: every block and inline tool of the editor, by the demo user;
 * - hbm4-review-demo: someone else's post already waiting for review, so the demo user reviews it
 *   (read-only editor, comments, 승인).
 */

const IMAGES: Record<string, string> = {
  "cover.svg":
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#0b3d91"/><rect x="200" y="120" width="240" height="120" rx="12" fill="#5bc5f6"/><text x="320" y="190" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#0b3d91">HyperAccel</text></svg>',
  "before.svg":
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#1f2933"/><rect x="200" y="120" width="240" height="120" rx="12" fill="#ff6b6b"/><text x="320" y="190" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#1f2933">Before</text></svg>',
  "after.svg":
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#0f5132"/><rect x="200" y="120" width="240" height="120" rx="12" fill="#8ee8e0"/><text x="320" y="190" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#0f5132">After</text></svg>',
}

type Text = { readonly ko: string; readonly en: string }

const BLOCKS: readonly (readonly [string, Text])[] = [
  ["intro-heading", { ko: "## 들어가며", en: "## Introduction" }],
  [
    "inline-marks",
    {
      ko: '이 글은 온사이트 에디터의 도구를 한 번씩 써 본 데모입니다. **굵게**, *기울임*, <u>밑줄</u>, ~~취소선~~, <mark>형광펜</mark>, <span style="color: #ff6b6b">글자색</span>, <span style="background-color: #fff3bf">글자 배경색</span>, [링크](https://hyperaccel.ai), `인라인 코드`, x<sup>2</sup>, H<sub>2</sub>O, <kbd>Ctrl</kbd>+<kbd>K</kbd>, 인라인 수식 $E=mc^2$, 각주[^tour]를 모두 담았습니다.',
      en: 'This post is a demo that uses each tool of the on-site editor once. It holds **bold**, *italic*, <u>underline</u>, ~~strikethrough~~, <mark>highlight</mark>, <span style="color: #ff6b6b">text color</span>, <span style="background-color: #fff3bf">background color</span>, [a link](https://hyperaccel.ai), `inline code`, x<sup>2</sup>, H<sub>2</sub>O, <kbd>Ctrl</kbd>+<kbd>K</kbd>, inline math $E=mc^2$, and a footnote[^tour].',
    },
  ],
  [
    "lead",
    {
      ko: "글자 모양 프리셋으로 강조한 도입 문단입니다.\n{.lead}",
      en: "An opening paragraph emphasized with a text preset.\n{.lead}",
    },
  ],
  [
    "styled",
    {
      ko: "<span style=\"font-family: 'Nanum Myeongjo', serif; font-size: 20px\">나눔명조 20px로 쓴 문장입니다.</span>",
      en: "<span style=\"font-family: 'Nanum Myeongjo', serif; font-size: 20px\">A sentence set in Nanum Myeongjo at 20px.</span>",
    },
  ],
  ["lists-heading", { ko: "### 목록과 인용", en: "### Lists and quotes" }],
  [
    "bullets",
    {
      ko: "- 글머리 목록 첫째\n- 글머리 목록 둘째\n  - 들여 쓴 항목",
      en: "- First bullet\n- Second bullet\n  - An indented item",
    },
  ],
  [
    "numbers",
    {
      ko: "1. 번호 목록 첫째\n2. 번호 목록 둘째\n3. 번호 목록 셋째",
      en: "1. First numbered item\n2. Second numbered item\n3. Third numbered item",
    },
  ],
  [
    "quote",
    {
      ko: "> 좋은 도구는 쓰는 사람이 도구를 잊게 만듭니다.",
      en: "> A good tool lets you forget the tool.",
    },
  ],
  [
    "note",
    {
      ko: "> [!NOTE] 참고\n> 콜아웃은 다섯 종류가 있습니다.",
      en: "> [!NOTE] Note\n> There are five kinds of callouts.",
    },
  ],
  [
    "tip",
    {
      ko: "> [!TIP] 팁\n> 슬래시(/)를 입력하면 블록 메뉴가 열립니다.",
      en: "> [!TIP] Tip\n> Type a slash (/) to open the block menu.",
    },
  ],
  [
    "warning",
    {
      ko: "> [!WARNING] 주의\n> 게시 전에 리뷰 승인이 필요합니다.",
      en: "> [!WARNING] Warning\n> Publishing needs an approved review.",
    },
  ],
  ["data-heading", { ko: "## 표, 코드, 수식", en: "## Tables, code and math" }],
  [
    "table",
    {
      ko: "| 항목 | 값 | 비고 |\n| --- | --- | --- |\n| 처리량 | 1,200 tok/s | 배치 8 |\n| 지연 | 35 ms | 첫 토큰 |",
      en: "| Item | Value | Note |\n| --- | --- | --- |\n| Throughput | 1,200 tok/s | batch 8 |\n| Latency | 35 ms | first token |",
    },
  ],
  [
    "code",
    {
      ko: "```ts\n// 토큰당 시간을 계산합니다.\nconst perToken = (ms: number, tokens: number) => ms / tokens\n```",
      en: "```ts\n// Time per token.\nconst perToken = (ms: number, tokens: number) => ms / tokens\n```",
    },
  ],
  [
    "math",
    {
      ko: "$$\n\\text{throughput} = \\frac{\\text{tokens}}{\\text{seconds}}\n$$",
      en: "$$\n\\text{throughput} = \\frac{\\text{tokens}}{\\text{seconds}}\n$$",
    },
  ],
  ["blocks-heading", { ko: "## 단계와 탭", en: "## Steps and tabs" }],
  [
    "steps",
    {
      ko: "{{< steps >}}\n1. 모델을 불러옵니다.\n2. 배치를 구성합니다.\n3. 결과를 확인합니다.\n{{< /steps >}}",
      en: "{{< steps >}}\n1. Load the model.\n2. Build the batch.\n3. Check the result.\n{{< /steps >}}",
    },
  ],
  [
    "tabs",
    {
      ko: '{{< tabs >}}\n{{< tab name="설명" >}}\n탭마다 다른 내용을 담을 수 있습니다.\n{{< /tab >}}\n{{< tab name="코드" >}}\n```python\nprint("hello")\n```\n{{< /tab >}}\n{{< /tabs >}}',
      en: '{{< tabs >}}\n{{< tab name="About" >}}\nEach tab can hold its own content.\n{{< /tab >}}\n{{< tab name="Code" >}}\n```python\nprint("hello")\n```\n{{< /tab >}}\n{{< /tabs >}}',
    },
  ],
  ["divider", { ko: "---", en: "---" }],
  ["media-heading", { ko: "## 그림과 동영상", en: "## Pictures and video" }],
  [
    "image",
    {
      ko: '![HyperAccel 로고 그림](images/cover.svg "본문 폭 그림과 캡션")',
      en: '![HyperAccel logo picture](images/cover.svg "A body-width picture with a caption")',
    },
  ],
  [
    "wide",
    {
      ko: '![넓게 놓은 그림](images/after.svg#wide "넓게 놓은 그림")',
      en: '![A wide picture](images/after.svg#wide "A wide picture")',
    },
  ],
  [
    "pair",
    {
      ko: "{{< pair >}}\n![이전 그림](images/before.svg)\n![이후 그림](images/after.svg)\n{{< /pair >}}",
      en: "{{< pair >}}\n![Before picture](images/before.svg)\n![After picture](images/after.svg)\n{{< /pair >}}",
    },
  ],
  [
    "slides",
    {
      ko: '{{< slides >}}\n![첫 장](images/before.svg "첫 장")\n![둘째 장](images/after.svg "둘째 장")\n![셋째 장](images/cover.svg "셋째 장")\n{{< /slides >}}',
      en: '{{< slides >}}\n![First slide](images/before.svg "First slide")\n![Second slide](images/after.svg "Second slide")\n![Third slide](images/cover.svg "Third slide")\n{{< /slides >}}',
    },
  ],
  [
    "compare",
    {
      ko: '{{< compare caption="최적화 전후" start="50" >}}\n![최적화 전](images/before.svg)\n![최적화 후](images/after.svg)\n{{< /compare >}}',
      en: '{{< compare caption="Before and after the optimization" start="50" >}}\n![Before the optimization](images/before.svg)\n![After the optimization](images/after.svg)\n{{< /compare >}}',
    },
  ],
  ["video", { ko: "{{< youtube aircAruvnKk >}}", en: "{{< youtube aircAruvnKk >}}" }],
  [
    "footnote",
    {
      ko: "[^tour]: 각주는 글 끝에 모여 표시됩니다.",
      en: "[^tour]: Footnotes are gathered at the end of the post.",
    },
  ],
]

const REVIEW_BLOCKS: readonly (readonly [string, Text])[] = [
  ["why-heading", { ko: "## 왜 HBM4인가", en: "## Why HBM4" }],
  [
    "why",
    {
      ko: "LLM 추론은 연산보다 **메모리 대역폭**에 묶이는 경우가 많습니다. HBM4는 인터페이스 폭을 2048비트로 넓혀 같은 클록에서 대역폭을 크게 늘립니다.",
      en: "LLM inference is often bound by **memory bandwidth** rather than compute. HBM4 widens the interface to 2048 bits, raising bandwidth a lot at the same clock.",
    },
  ],
  [
    "compare-table",
    {
      ko: "| 세대 | 인터페이스 폭 | 스택당 대역폭 |\n| --- | --- | --- |\n| HBM3E | 1024비트 | 약 1.2 TB/s |\n| HBM4 | 2048비트 | 약 2 TB/s |",
      en: "| Generation | Interface width | Bandwidth per stack |\n| --- | --- | --- |\n| HBM3E | 1024-bit | about 1.2 TB/s |\n| HBM4 | 2048-bit | about 2 TB/s |",
    },
  ],
  [
    "picture",
    {
      ko: '![메모리 스택 개념도](images/cover.svg "메모리 스택 개념도")',
      en: '![Memory stack concept](images/cover.svg "Memory stack concept")',
    },
  ],
  [
    "caveat",
    {
      ko: "> [!NOTE] 리뷰 포인트\n> 수치는 공개 자료 기준의 대략값입니다. 출처 표기가 충분한지 봐 주세요.",
      en: "> [!NOTE] Review point\n> The figures are rough values from public sources. Please check that the sources are cited enough.",
    },
  ],
  ["wrap-heading", { ko: "## 정리", en: "## Wrap-up" }],
  [
    "wrap",
    {
      ko: "대역폭이 늘면 같은 칩에서도 더 큰 배치를 감당할 수 있습니다. 다음 글에서는 실제 처리량 변화를 측정해 봅니다.",
      en: "More bandwidth lets the same chip handle larger batches. The next post measures the actual change in throughput.",
    },
  ],
]

interface DemoPost {
  readonly slug: string
  readonly title: Text
  readonly description: Text
  readonly authors: readonly string[]
  readonly editors: readonly string[]
  readonly tags: readonly string[]
  readonly blocks: readonly (readonly [string, Text])[]
  /** Open its pull request already ready for review (not a draft). */
  readonly inReview: boolean
}

const POSTS: readonly DemoPost[] = [
  {
    slug: "onsite-editor-tour",
    title: { ko: "온사이트 에디터 기능 둘러보기", en: "A tour of the on-site editor" },
    description: {
      ko: "에디터의 모든 블록과 서식을 한 번씩 써 본 데모 글",
      en: "A demo post using every block and format of the editor once",
    },
    authors: ["Donghyeon Choi"],
    editors: ["author"],
    tags: ["editor", "demo"],
    blocks: BLOCKS,
    inReview: false,
  },
  {
    slug: "hbm4-review-demo",
    title: { ko: "HBM4가 바꾸는 메모리 계층", en: "How HBM4 changes the memory hierarchy" },
    description: {
      ko: "리뷰어 입장에서 보는 데모 글(리뷰 요청됨)",
      en: "A demo post to see as a reviewer (review requested)",
    },
    authors: ["Hyunjun Park"],
    editors: [],
    tags: ["memory", "demo"],
    blocks: REVIEW_BLOCKS,
    inReview: true,
  },
]

function markdown(post: DemoPost, language: "ko" | "en"): string {
  const alt = language === "ko" ? "HyperAccel 커버" : "HyperAccel cover"
  const list = (values: readonly string[]): string =>
    `[${values.map((value) => `"${value}"`).join(", ")}]`
  const front = [
    "---",
    `title: "${post.title[language]}"`,
    `description: "${post.description[language]}"`,
    'date: "2026-10-30"',
    `authors: ${list(post.authors)}`,
    `editors: ${list(post.editors)}`,
    'categories: ["AI Hardware"]',
    `tags: ${list(post.tags)}`,
    "cover:",
    '  image: "images/cover.svg"',
    `  alt: "${alt}"`,
    "draft: false",
    "---",
  ].join("\n")
  const body = post.blocks.map(([id, text]) => `<!-- b:${id} -->\n${text[language]}`).join("\n\n")
  return `${front}\n${body}\n`
}

/** Seeds the demo posts' branches and opens their pull requests on the fake GitHub. */
export async function seedDemoPost(github: ReturnType<typeof startFakeGitHub>): Promise<void> {
  for (const post of POSTS) {
    const files: Record<string, string> = {
      [`content/posts/${post.slug}/index.md`]: markdown(post, "ko"),
      [`content/posts/${post.slug}/index.en.md`]: markdown(post, "en"),
    }
    for (const [name, source] of Object.entries(IMAGES))
      files[`content/posts/${post.slug}/images/${name}`] = source
    github.seed(`post/${post.slug}`, files)
    const response = await fetch(`${github.url}/repos/Hyper-Accel/hyper-accel.github.io/pulls`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${github.defaultToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: post.title.ko,
        head: `post/${post.slug}`,
        base: "main",
        draft: !post.inReview,
      }),
    })
    if (!response.ok)
      throw new Error(`Failed to seed the demo post ${post.slug} (${response.status})`)
  }
}
