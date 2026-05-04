# HBF 시리즈 이미지: 저장 경로·사양·프롬프트 모음

HBF 시리즈 두 글에 들어갈 이미지 7개 (Group A 5개 + Group B 2개) 의 저장 경로·사양·프롬프트.

대상 글:
- `content/posts/hbf-workload/index.md` (Part 2)
- `content/posts/hbf-challenge-for-commercialize/index.md` (Part 3, draft)

> - **Group A** (#1, #2, #3, #6, #7), Claude Design 자유 생성 대상.
> - **Group B** (#4, #5), IEEE CAL 2026 H³ 논문 figure를 **그대로 사용**합니다.
>   caption 또는 인접 문장에 *"Source: Ha et al., IEEE CAL 2026"* 명시 필수.
>   원본 PDF는 번들에 있음: `content/posts/hbf-workload/[IEEE CAL 2026] H3 Hybrid Architecture Using High Bandwidth Memory and High Bandwidth Flash for Cost-Efficient LLM Inference.pdf`

## 공통 사양 (README 기반)

- **파일 형식**: JPG / PNG / WebP
- **파일 크기**: **1MB 이하** (pre-commit이 1MB 초과 시 커밋 차단)
- **커버 권장 사이즈**: 1200×630px (Open Graph 표준), 최소 600×315
- **저장 위치**: `content/posts/{slug}/images/` 또는 번들 루트
- **alt 텍스트 필수**
- **권장 형식**: WebP (가장 작은 용량) 또는 PNG (다이어그램)

> 커버는 frontmatter가 `01-cover.jpg`로 잡혀 있으니 export 시 `.jpg`로 맞추거나 frontmatter 확장자 같이 변경.

---

## #1. Part 2 커버 이미지 [Group A]

- **저장**: `content/posts/hbf-workload/01-cover.jpg`
- **사양**: 1200×630px, JPG/WebP, ≤500KB
- **alt**: HBF 워크로드 커버 이미지

```
A clean, modern hero image for a technical blog post titled "Memory in the AI Era, Part 2: Where Does HBF Actually Fit?"

Style: minimalist tech editorial illustration, dark navy or deep charcoal background, accent colors in teal and orange. Flat-vector aesthetic, similar to a stripped-down semiconductor whitepaper cover.

Composition (left-to-right):
- A stylized GPU package on the left (small dark square chip with golden bond pads)
- Three HBM stacks rising next to it (cylindrical/tower silhouettes)
- Behind them, a longer, taller stack labeled "HBF", visually larger to suggest "more capacity"
- A subtle dotted/dashed line connecting them (daisy-chain hint)
- Light glow behind the HBF stack to imply "where does this fit?"

Top-right corner: thin sans-serif text reading "Memory in the AI Era · Part 2"

No photorealism. No people. Output: 1200×630, JPG, under 500KB.
```

---

## #2. 학습 vs 추론 메모리 접근 패턴 [Group A]

- **저장**: `content/posts/hbf-workload/images/02-training-vs-inference.png`
- **사양**: 1600×900px, PNG/WebP, ≤400KB
- **alt**: LLM 학습과 추론의 메모리 접근 패턴 비교, 학습은 weight write 빈번, 추론은 read-only weight + 공유 KV cache 중심

```
A two-panel technical diagram comparing memory access patterns between LLM training and inference.

Layout: Two horizontal panels side-by-side, equal size, separated by a thin vertical divider.

Left panel header: "Training (write-heavy)"
- Show a stack of "Layer 1 → Layer 2 → Layer 3" blocks with two flow arrows: a forward pass (left-to-right, blue) and a backward pass (right-to-left, red)
- Memory tags below the layer stack:
  - A large RED block labeled "Weights, written every step"
  - A medium RED block labeled "Optimizer state, written every step"
  - A small GRAY block labeled "Activations, temporary"
- Bottom caption in red: "✗ Fails HBF's write-endurance constraint"

Right panel header: "Inference (read-only weights)"
- Show only forward passes through the layer stack (left-to-right arrows only)
- Memory tags below the layer stack:
  - A large GREEN block labeled "Weights, frozen, read every batch"
  - A GREEN block labeled "Shared KV cache (CAG), read-only" with a small note "huge in long context"
  - A small RED block labeled "Generated KV cache + activations, write per token"
- Bottom caption in green: "✓ Huge + read-only data dominates"

Shared legend at the very bottom (small, centered):
- Green = read-only
- Red = read-write

Style: clean, schematic, white background, sans-serif labels in dark gray. Teal/orange accent palette consistent with the HBF cover. No photorealism, vector-illustration look.

Output: 1600×900, PNG, under 400KB.
```

---

## #3. RAG vs CAG 흐름 비교 [Group A]

- **저장**: `content/posts/hbf-workload/images/03-rag-vs-cag.png`
- **사양**: 1600×900px, PNG/WebP, ≤400KB
- **alt**: RAG와 CAG의 추론 흐름 비교, RAG는 매 요청마다 retrieve+compute, CAG는 사전 KV cache 1회 생성 후 재사용

```
A two-row flow comparison diagram showing RAG vs CAG inference patterns.

Row 1 (top): "RAG, retrieve + recompute every time"
Pipeline left-to-right (3 separate request lanes shown stacked):
[User Query] → [Vector DB Retrieve] → [Build KV cache from fetched chunks] → [Generate]
Show 3 parallel rows of this pipeline, each independent. Highlight that "Build KV cache" repeats every request (use a redo/refresh icon or red highlight on that step).

Row 2 (bottom): "CAG, compute once, read many times"
Top sub-row, gray, one-time setup:
[Massive shared corpus] → [Run through model once] → [Pre-built KV cache] (highlight as a large green cylinder labeled "huge, read-only, shared")
Below: 3 parallel request lanes, each: [User Query] → [Reuse pre-built KV cache as prefix] → [Generate]
Show all 3 request lanes converging into the same green KV-cache cylinder (arrows pointing up/in).

Style: clean schematic, white background, teal for compute/model blocks, orange for cache/memory blocks, gray for one-time setup. Sans-serif labels, dark gray text. Vector aesthetic.

Output: 1600×900, PNG, under 400KB.
```

---

## #4. H³ 구조도 [Group B: 논문 figure]

- **저장**: `content/posts/hbf-workload/images/04-h3-architecture.png`
- **출처**: IEEE CAL 2026 H³ 논문의 architecture figure를 캡처/추출하여 사용
  - 번들 PDF: `content/posts/hbf-workload/[IEEE CAL 2026] H3 Hybrid Architecture Using High Bandwidth Memory and High Bandwidth Flash for Cost-Efficient LLM Inference.pdf`
- **사양**: 1MB 이하 (PNG 권장, 캡처 후 압축)
- **alt**: H³ 하이브리드 아키텍처 구조도, GPU shoreline에 HBM 직결, HBM base die 뒤로 D2D 인터페이스를 통해 HBF stack을 daisy-chain으로 연결, HBM base die 내부에 LHB SRAM 통합
- **caption (필수)**: `Source: Ha et al., IEEE CAL 2026 ([DOI: 10.1109/LCA.2026.3660969](https://doi.org/10.1109/LCA.2026.3660969))`

> Claude Design 자유 생성 비권장, D2D 위치, LHB가 HBM base die 안 vs 밖, daisy-chain 방향, GPU shoreline 점유 여부 등 미세 토폴로지가 본문 주장의 근거. 논문 figure 그대로 사용.

---

## #5. H³ 시뮬레이션 결과 차트 [Group B: 논문 figure]

- **저장**: `content/posts/hbf-workload/images/05-h3-simulation-results.png`
- **출처**: IEEE CAL 2026 H³ 논문의 결과 차트 (Llama 3.1 405B + B200 GPU 시뮬레이션) 를 캡처/추출하여 사용
- **사양**: 1MB 이하 (PNG 권장)
- **alt**: HBM-only 대비 H³의 batch size, throughput, throughput-per-power 이득을 1M / 10M context에서 비교한 막대 차트, Llama 3.1 405B FP8 + NVIDIA B200 시뮬레이션
- **caption (필수)**: `Source: Ha et al., IEEE CAL 2026`
- **본문 명시 수치 (참고용)**:
  - Max batch size, 1M: 2.6×, 10M: 18.8×
  - Throughput (TPS/request), 1M: 1.25×, 10M: 6.14×
  - Throughput per power, 최대 2.69×, 보수적 BW 가정 시 2.09× (10M)

> Claude Design 자유 생성 비권장, 막대 높이가 곧 인용 데이터(특히 18.8× 같은 큰 ratio)이므로 생성 모델은 시각적 비율을 정확히 재현하지 못함. 논문 figure 그대로 사용.

---

## #6. MoE expert weight HBF placement + channel-level parallel prefetch [Group A: 선택사항]

- **저장**: `content/posts/hbf-workload/images/06-moe-hbf-placement.png`
- **사양**: 1400×800px, PNG/WebP, ≤300KB
- **alt**: MoE의 모든 expert weight를 HBF에 배치하고 channel-level 병렬 prefetch로 stochastic routing의 latency를 가리는 다이어그램
- **본문 표기**: "(선택)", 본문이 prose만으로도 충분히 전달되므로 필수는 아님

```
A schematic diagram showing MoE expert placement on HBF with channel-level parallel prefetch.

Layout (left-to-right):
1. Left: a token entering an "MoE Router" block. The router emits stochastic arrows to a few selected experts (show 3 of ~16 experts highlighted with a dashed glow, indicating unpredictable selection).
2. Center: a 4×4 grid of "Expert FFN" boxes (16 total). All experts are uniformly colored in light orange (no hot/cold distinction). Above the grid label: "All experts live on HBF (read-only, single-chip serving)".
3. Right side: an HBF stack split into multiple memory channels (4–8 vertical lanes). Expert weights are distributed across channels, show small icons or colored bands grouping experts to each channel.
4. When the router selects experts, multiple HBF channels fetch in parallel, show simultaneous arrows from several channels feeding the active experts. Caption near these arrows: "Channels fetch in parallel → single-channel latency hidden by channel-level parallelism".

Floating callout near the top: "Single-chip trillion-parameter serving, no hot/cold split needed".

Style: clean schematic, white background, vector aesthetic. Orange for HBF/expert weights, teal for highlighted (selected) experts and active fetch arrows, gray for token + router. Sans-serif labels.

Output: 1400×800, PNG, under 300KB.
```

---

## #7. Part 3 커버 이미지 [Group A]

- **저장**: `content/posts/hbf-challenge-for-commercialize/01-cover.jpg`
- **사양**: 1200×630px, JPG/WebP, ≤500KB
- **alt**: HBF 상용화 도전 과제 커버 이미지

```
A hero image for a technical blog post titled "Memory in the AI Era, Part 3: The Homework HBF Has to Clear Before Commercialization."

Style: matching the Part 2 cover, minimalist tech editorial illustration, dark navy/charcoal background, teal and orange accents. Flat-vector aesthetic.

Composition: contrasting the Part 2 cover's "fitting in" tone with a "fork in the road" or "obstacle course" feel.

Suggested visual: a single HBF stack (orange tower, slightly bigger than HBM stacks beside it) facing three glowing barrier/lock icons in front of it. Each barrier carries a tiny label:
- "(a) HBM catching up"
- "(b) sparse-aware"
- "(c) power"
Behind the barriers, a faint horizon line with an "Universal" label fading into the distance.

Top-right corner: thin sans-serif text reading "Memory in the AI Era · Part 3"

No photorealism. No people. Output: 1200×630, JPG, under 500KB.
```

---

## 사용 후 체크리스트

- [ ] 모든 이미지 1MB 이하 (`ls -lh content/posts/hbf-workload/01-cover.* content/posts/hbf-workload/images/* content/posts/hbf-challenge-for-commercialize/01-cover.*`)
- [ ] frontmatter `cover.image` 확장자가 실제 파일 확장자와 일치
- [ ] 모든 이미지에 의미 있는 alt 텍스트
- [ ] **Group B (#4, #5) caption에 "Source: Ha et al., IEEE CAL 2026" 명시**
- [ ] 본문 placeholder `<!-- 그림 #N: ... -->` 모두 실제 마크다운 이미지 태그로 교체 (`grep '그림 #'`)
- [ ] `hugo --gc --minify --buildDrafts` 빌드 통과
- [ ] 로컬 프리뷰 (`hugo server -D`) 에서 양 글의 이미지 정상 렌더링 확인
