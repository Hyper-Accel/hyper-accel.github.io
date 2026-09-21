# 테크블로그 리디자인 작업 계획

참고 사이트(sionic.ai/blog, velopers.kr)는 **원칙만 참고**하고, 레이아웃·색·폰트·컴포넌트 구성은 가져오지 않는다.

## 현재 상태 (2026-09-21 확인)

- Hugo 0.157 (CI는 0.152.2) + PaperMod, 커스텀 레이아웃은 `layouts/_default/{single,list}.html`, partials 몇 개, `assets/css/extended/custom.css`
- 포스트 32편 × ko/en = 64 파일. 전부 `cover.image` 있음 → 카드형 레이아웃 가능
- **카테고리가 엉망**: 20개 이상, 대소문자 중복(`AI Hardware`/`AI hardware`, `kubernetes`/`Kubernetes`), 포스트당 1~5개, 태그와 역할이 겹침
- `series`는 비교적 깔끔 (지피지기면 백전불태, 메모리, K8s, Crafting Compilers, torch.compile 해부 등)

## 작업 순서

### Phase 0. 준비
1. `main`에서 `feat/blog-redesign` 기준 브랜치 생성 (현재 브랜치는 torch-compile 발행 fix)
2. 현재 사이트 스크린샷(홈 / 목록 / 카테고리 / 글 상세 / 모바일 / 다크모드) 저장 → 비교 기준선
3. 참고 사이트 분석 메모: "무엇을 원칙으로 가져오는가"만 적는다
   - 예: 첫 화면에서 카테고리로 바로 걸러보기, 썸네일 중심 카드, 추천 글 강조, 여백 넉넉한 본문
   - 금지 목록도 같이 적는다 (같은 그리드 비율, 같은 색 조합, 같은 헤더 구성 등)

### Phase 1. 글 분석 & 카테고리 정리 (공통, 먼저 머지)
디자인과 독립적이고, 모든 디자인 시안이 이 데이터를 전제로 하므로 **가장 먼저** 한다.

1. 스크립트로 전 포스트 frontmatter 추출 → 표(제목, 작성자, 날짜, series, categories, tags, 요약 유무, cover 유무)
2. 본문까지 읽고 주제 분류 → 상위 카테고리 5~7개 안 제시. 초안:
   | 카테고리 | 해당 예 |
   |---|---|
   | AI 가속기 & 아키텍처 | TPU, GPU, LPU, Cerebras, Jalapeño, CPU 부활, DPU |
   | 메모리 & 반도체 | HBF, CXL 시리즈 |
   | 컴파일러 & 소프트웨어 스택 | Crafting Compilers, polyhedral, Legato, torch.compile, Pallas, ROCm AITER |
   | LLM & 서빙 | Transformer, SGLang |
   | 인프라 & DevOps | K8s 시리즈, ARC, device plugin |
   | AI 활용 & 개발 문화 | AI 에이전트, 터미널, SDD, 블로그 운영, Glasswing |
   | 컨퍼런스 리포트 | CES, DAN, PyTorchCon |
3. 규칙 확정: **포스트당 대표 카테고리 1개** (`categories`), 세부 키워드는 `tags`, 연재는 `series`
4. 팀 리뷰 → 매핑 확정 → 스크립트로 ko/en frontmatter 일괄 수정, 카테고리 이름 i18n 처리
5. 기존 `/categories/<old>/` URL 깨짐 확인 (필요하면 `aliases` 또는 리다이렉트)
6. STYLEGUIDE.md / archetype / `tech-blog-coauthoring` 스킬에 카테고리 목록 반영
7. **별도 PR로 먼저 머지** → 현 디자인에서도 바로 효과 있음

### Phase 2. 디자인 시안 실험 환경
시안마다 루트 `layouts/`를 건드리므로 브랜치를 분리하는 게 가장 안전하다.

- Phase 1 결과 위에서 `design/a`, `design/b`, `design/c` 브랜치 생성
- `git worktree`로 각각 체크아웃 → 포트를 나눠 동시 실행
  ```
  hugo server -p 1313   # 현재 디자인 (기준선)
  hugo server -p 1314   # design/a
  hugo server -p 1315   # design/b
  hugo server -p 1316   # design/c
  ```
- 필요하면 4개를 iframe으로 나란히 띄우는 로컬 비교 페이지(scratch) 하나 추가

### Phase 3. 시안 제작 (범위를 좁혀서)
1차는 **홈 + 카테고리 목록 페이지만** 만든다. 글 상세는 코드블록·수식·목차·시리즈·giscus 등 얽힌 게 많아 방향 확정 후 진행.

방향 예시 (서로 확실히 다르게):
- **A. 매거진형**: 최신/추천 글 히어로 + 카테고리 탭 + 썸네일 카드 그리드
- **B. 엔지니어링 인덱스형**: 썸네일 작게, 제목·요약·태그 밀도 높은 리스트, 시리즈를 1급 요소로 노출
- **C. 시리즈 중심형**: 연재물을 "트랙"처럼 묶어 보여주고, 단편은 아래 피드로

공통 체크리스트 (각 시안이 모두 통과해야 비교 의미가 있음):
- 다크/라이트, ko/en 전환, 모바일 폭
- 한글 타이포그래피(줄간격, 폰트), 긴 제목 줄바꿈
- 검색, 작성자, 시리즈, 태그 페이지 동선 유지
- HyperAccel 브랜드 색/로고와의 일관성

### Phase 4. 비교 & 선택
1. 4개 포트 나란히 보면서 팀 피드백 (간단한 기준표: 탐색성, 가독성, 브랜드 일치, 유지보수 난이도)
2. 1개 선택 (필요하면 요소 조합)
3. 선택안으로 글 상세 페이지·작성자·검색·404 등 나머지 페이지 확장

### Phase 5. 마무리 & 배포
1. 안 쓰는 CSS/partial 정리, PaperMod 오버라이드 범위 문서화
2. `hugo --minify` 빌드 확인, CI Hugo 버전(0.152.2)에서도 빌드되는지 확인
3. Lighthouse(성능·접근성) 전후 비교
4. PR → 머지 → 배포 확인, 사용 안 한 `design/*` 브랜치·worktree 정리

## 미리 정해야 할 것
- 카테고리 개수와 이름 (한/영), 포스트당 1개 원칙 동의 여부
- 커스텀 폰트 도입 여부 (한글 웹폰트는 용량 이슈)
- 시안을 몇 개까지 만들지 (권장: 3개)
