# On-site editor M1: Wave 0 contracts

The authoritative plan is `.omo/plans/onsite-editor.md` in the parent workspace
(revision 2, 2026-10-27). The repository remains public. M1 excludes AI. All writing,
rendered review, approval, and publication stay inside the blog's own editing pages (a post's
`?edit` page, `/editor-new/`, `/editor-login/`); no PR or external
preview links appear in the UI. Chromium is the supported browser.

`E` below means `tools/editor`. Shared contracts live in `E/src/shared/onsite`.
These files define interfaces and boundary schemas, not lane implementations.
Consumers import the specific module; H owns changes to these contracts and package files.

## Contracts

| Module | Contract and implementation owner |
| --- | --- |
| `document.ts` | C implements `DocumentCodec.parse`, `serialize`, and `validate`. `PostBundle` contains slug, `ko`/`en` language documents, images, nullable remote `headSha`, and a SHA-256 `snapshotHash`. Each language document contains metadata, original YAML, and ordered `{id, markdown}` top-level blocks. Unknown front matter is retained. |
| `github.ts` | B implements `GitHubAdapter`, scoped to one repository. Every method returns `GitHubResult<T>`; errors discriminate unauthorized, forbidden, conflict, rateLimited, validation, or network. Draft PRs are internal state. `commitBundle(slug, expectedHeadSha, files)` atomically advances one branch after writing all blobs/tree/commit, never force-pushes. |
| `auth.ts` | A implements `AuthController` and `MemoryTokenProvider`. Session metadata contains no token. Tokens exist only in memory. Expiry is epoch milliseconds; token-exchange `expiresIn` is seconds. `onsite:relogin-required` has no secret payload. Login uses one-use PKCE S256. |
| `drafts.ts` | A implements `DraftStore` using IndexedDB, structured clone, and transaction completion. Each edit persists the whole snapshot, including Blob images and cursor. Scope is repository + user ID + slug. Sequence numbers prevent out-of-order saves. Restore returns missing/restored/conflict, never silently overwrites a changed remote head. |
| `review.ts` | E uses `RangeAnchor`, `ReviewThread`, and comments. B persists them. Anchors support ordered multiple block IDs, text offsets and quote, file line range, and original snapshot hash. Thread storage distinguishes review comments from issue-comment fallback. |
| `render.ts` | R implements synchronous `Renderer.render(bundleLang)`, returning sanitized HTML and ordered `blockSourceMap` entries. Each top-level wrapper carries `data-block-id`. Source entries map text to full-file Markdown line ranges. |
| `blocks.ts` | D, C and R share exact ID, image, shortcode, and alert syntax. Neither renderer silently drops legacy shortcodes. |
| `theme.ts` | D/R/H use site CSS variable names; editor-only variables have an `--editor-` prefix. These are token names, not a second palette. |

### Document and persistence invariants

- Canonical paths are `content/posts/<slug>/index.md` (ko) and `index.en.md` (en).
  Slugs are lowercase ASCII words separated by hyphens.
- Both languages have the same unique IDs in the same order. Empty Markdown is
  permitted while editing/saving, but `validate(..., "review" | "publish")` rejects
  either empty translation, missing title/authors/category, and invalid image references.
- A block's Markdown excludes its ID comment. Nested shortcode contents belong to
  their containing top-level block. IDs survive moves and edits; new blocks receive
  one ID shared across languages. Legacy input is migrated in memory by C; source
  files are not rewritten until an explicit save. Ambiguous legacy pairing reports
  a pairing issue rather than guessing unequal structures.
- `rawFrontMatter` excludes the `---` delimiters and remains the formatting baseline.
  Serialization patches changed fields while preserving unrelated fields/comments.
- `headSha: null` means no branch has been loaded/created. `ensureDraftPR` creates
  `post/<slug>` from the default branch. New posts pass their complete serialized
  files as `initialFiles`, creating the first commit before opening the PR (GitHub
  rejects PRs with no commits between branches). Existing open PRs are returned
  idempotently. The returned head is the baseline for subsequent commits.
- `BundleFile.path` is repository-relative. The adapter validates that every path
  belongs to this slug's Markdown files or `images/` directory. Delete entries remove
  tree entries; base64 encodes binary blobs, UTF-8 encodes Markdown.
- Serialization emits both Markdown files and pending image bytes; unchanged images
  remain in the Git base tree. `snapshotHash` is SHA-256 over UTF-8 JSON of tuples
  sorted by repository path using code-point order. Markdown tuples are
  `[path, "utf-8", serializedSource]`; image tuples are
  `[path, "git-blob-sha", blobSha]`. A pending image's blob SHA is SHA-1 of
  `blob <byteLength>\0` followed by its bytes, the same hash Git returns on upload.
  This permits offline hashing without re-fetching committed images and keeps the
  hash stable when pending images become committed. Omit deleted images. No token,
  cursor, timestamp, branch head SHA, or object URL participates. C computes it;
  editing callers refresh it through serialization.
- Pending images hold actual `Blob` values, not object URLs or JSON surrogates.
  IndexedDB stores those Blobs with the document and cursor in the same transaction.
  Logging out never deletes drafts. Flush queued writes before login navigation.

### Range anchors and GitHub behavior

Offsets are zero-based UTF-16 offsets into the rendered block's `textContent`.
`startOffset` is inclusive in the first block and `endOffset` exclusive in the last.
`quotedText` joins selected portions of successive blocks with `\n`; R and E must
use that same normalization. Lines are one-based, inclusive, and refer to the full
serialized Markdown file including front matter and ID comments. Source entry
`startLine` points to the block's first Markdown line after the marker, not the marker.

Use the first and last source lines as GitHub `start_line`/`line`, side `RIGHT`.
For a single-line REST comment, omit `start_line` and `start_side` on the wire.
The shared anchor always keeps both. If the range is not in the diff, use a PR issue
comment with identical anchor metadata. Append JSON between
`<!-- onsite-range:v1 ` and ` -->`; escape `<` as `\u003c` in JSON strings so quotes
cannot terminate the HTML comment. Replies and resolved state for issue-backed
threads use the same versioned metadata because issue comments have no native thread
resolution. For native threads, use GitHub GraphQL resolution.

On edit, E relocates quotes within the identified blocks; non-unique or absent matches
become outdated rather than attaching to unrelated text. Approval must apply to the
current head. Ready/publish gates also require complete translations. Squash merge
passes the expected SHA. A network error with `outcomeUnknown: true` requires read-back
reconciliation before retry; this avoids duplicate commits, PRs, or comments.

`Renderer` emits no credentials. Review runs in a same-page `srcdoc` iframe with
`sandbox="allow-scripts"` and without `allow-same-origin`. The parent validates the
message source and shape; the iframe never receives auth/session data. Sanitization
must remove active content from Markdown/rawhtml before adding trusted interaction code.

## Markdown syntax (plan section 2)

| 블록 | Markdown |
| --- | --- |
| 본문 폭 / 넓게 | `![alt](images/a.webp "캡션")` / `#wide` |
| 옆 배치 | `#side-right`(기존 `#side` 별칭), `#side-left` |
| 2장 나란히 | `{{< pair >}}` 이미지 2개 `{{< /pair >}}` |
| 콜아웃 | `> [!NOTE\|TIP\|IMPORTANT\|WARNING\|CAUTION] 제목` |
| 단계별 | `{{< steps >}}` 번호 목록 `{{< /steps >}}` |
| 비교 슬라이더 | `{{< compare caption="…" start="50" >}}` 이미지 2개 `{{< /compare >}}` |
| 탭 | `{{< tabs >}}{{< tab name="…" >}}…{{< /tab >}}{{< /tabs >}}` |
| 블록 짝 ID | 최상위 블록 앞 `<!-- b:ID -->` (ko/en 동일 ID·순서) |

Image presets are URL fragments: `![alt](images/a.webp#wide "caption")`.
No fragment means body width; `#side` aliases `#side-right`. Compare start is a
percentage from 0 to 100, default 50. Pair and compare each contain exactly two images.
Alerts use one uppercase type, not the literal pipe-separated list.
KaTeX uses `$...$` and `$$...$$`; fenced code keeps its language.
Existing `ref`, `figure`, and `rawhtml` source is preserved and individually rendered.
Hugo uses `wrapStandAloneImageWithinParagraph: false`. D/R must run fixture parity.

## Lane ownership (plan section 4)

The supplied plan has a damaged section heading/table opening after section 3.
The rows below reproduce its ownership and acceptance content with that formatting repaired.

| 레인 | 책임 | 소유 파일 | 검증 |
| --- | --- | --- | --- |
| **A 인증·복구** | 로그인, 권한 확인, 만료 재로그인, **IndexedDB 자동 저장·복원** | `E/src/client/auth/**`, `E/src/client/drafts/**`, `E/workers/token-exchange/**` | 편집 중 토큰 만료 → 재로그인 → 본문·이미지·커서 위치까지 동일 복원 e2e. 토큰이 storage·URL·로그에 없음 |
| **B GitHub 어댑터** | 원자 저장, PR 생성(내부), 충돌 감지, 댓글·승인·squash merge | `E/src/client/github/**` | 가짜 GitHub 서버로 동시 저장·중간 실패·응답 유실·중복 PR 방지 |
| **C 작성기** | 새 글 폼, ko/en 블록 1:1 편집, 번역 상태 표시 | `E/src/document/**`, `E/src/client/composer/**`, `E/src/client/{editor,markdown,commands}.ts` | 기존 글 전체 parse→serialize 골든 테스트, 블록 짝 이동·빈 번역 차단 |
| **D 사이트 레이아웃·블록** | 목차 접힘 핸들, 폭별 와이드 레이아웃, 이미지 preset, 블록 4종 + pair의 Hugo 구현 | `assets/css/extended/{reading,figures}.css`, `layouts/_default/_markup/render-{image,blockquote}.html`, `layouts/shortcodes/**`, `layouts/partials/reading_toc.html`, `assets/js/{reading-toc,feature-blocks}.js`, `hugo.yaml` | 6개 폭 캡처에서 겹침·넘침 없음, 목차 핸들 키보드·Esc 동작, JS 켬/끔 렌더 |
| **R JS 렌더러** | 리뷰·편집 화면용 렌더러(사이트와 동일 출력), sandbox iframe | `E/src/render/**` | D의 Hugo 출력과 fixture별 parity 테스트 |
| **E 리뷰** | 사이트 내 리뷰 화면, 문단 댓글, 승인, 게시 버튼, 진행 상태 | `E/src/client/review/**`, `E/src/client/merge*.ts`, `merge.css`, `apply-merge.ts` | 드래그 선택→댓글→새로고침 후 같은 범위 하이라이트, 여러 문단 선택, 답글·해결, 수정 후 재탐색/이전 버전 분리, 승인 전 게시 차단 (390/1440 e2e) |
| **G CI** | `/editor/` 빌드를 Pages 배포에 결합, ko/en·authors·category·Hugo 검사 | `.github/workflows/**`, `E/ci/**` | actionlint, ci dry-run, 실패 fixture가 각 검사를 실제로 실패시킴 |
| **H 통합** | Wave 0 계약, `/editor/` 빌드·라우팅, 입구 연필, 가짜 서버, 공통 e2e | Wave 0 파일, `E/{package.json,bun.lock,vite.config.ts,tsconfig.json,index.html}`, `E/src/client/{app,main,view,api}.ts`, `E/src/{testing,e2e}/**`, `layouts/partials/{header,extend_footer}.html` | 390/1440 Chromium에서 로그인→새 글→저장→재로그인 복원→리뷰→게시 전체 통과 |

H's additional Wave 0 entry files are `E/site/index.html` and
`E/src/client/site.{ts,css}`. No other lane edits them. `build:site` writes
`E/dist-site/editor/`; G copies that editor directory into the Hugo output.
`e2e:site` currently verifies the shell/hash routing in Chromium, not the future M1 flow.
`ci:dry-run` is a working baseline check + hosted build; G extends its checks in `E/ci`.
