import type { startFakeGitHub } from "./fake-github"

/**
 * A finished demo post for the local site (dev-site.ts only, not the test harness), in Korean and
 * English: hbm4-review-demo, someone else's post already waiting for review, so the demo user
 * reviews it (read-only editor, comments, 승인). The post using every tool of the editor is the
 * published example, content/posts/editor-showcase.
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
    // A post waiting for review belongs to someone else, so the demo user can approve it.
    if (post.inReview) {
      const { number } = (await response.json()) as { number: number }
      const pull = github.state.pulls.get(number)
      if (pull) github.state.pulls.set(number, { ...pull, author: "hyunjun" })
    }
  }
}
