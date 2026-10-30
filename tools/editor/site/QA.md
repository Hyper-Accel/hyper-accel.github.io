# M1 verification ledger

## Reading-page authoring surface (2026-10-28)

The editing page is now rendered by Hugo with the real site header, footer and stylesheet, and the
composer draws the post page itself (breadcrumbs, category kicker, `h1.post-title`, post meta
with date/reading time/words/authors/translation, `post-content`, tags, live TOC). Title and
body are edited in place; category/authors/date/tags open the post-information panel under
the meta line; the header language pill switches the editing language; save and review sit in
a bottom bar. New posts start on the same page.

Verified: `bun run check` (Biome, tsc, 392 tests, 0 failures); composer Chromium suite at
1440/390; `bun run e2e:site` (integrated save/re-login/review/publish and tab-close/conflict
recovery at 390/1440, standalone review); `site-entry.e2e.ts` against a production
`hugo --minify` build. Side-by-side captures against `/posts/crafting-compilers/` are in the
outer workspace's `.omo/evidence/post-surface/compare-{1440,390}.png`.

### Naver-style toolbox, library, mobile preview and templates (2026-10-29)

From the Naver SmartEditor ONE observation (`.omo/evidence/post-surface/rea-naver/`). A sticky 도구상자
under the site header inserts the "/" menu blocks at the caret (사진 opens the file picker; 콜아웃 and
표 open a type menu and a size grid); formatting stays in the selection toolbar. 라이브러리 lists this
post's pictures (committed and pending) with 대표 이미지 / 본문에 있음 / 본문에 없음, inserts at the
caret or by dragging onto the article. 모바일 renders the current language through the site renderer
into a 390px iframe (scripts disabled, same-origin so edits update in place and keep the scroll);
both open as a side panel at desktop widths and as a sheet under the toolbox on phones. New posts
pick 빈 글, 컨퍼런스 리포트 (sets Conference Reports when no category is chosen), 기술 딥다이브 or
논문·오픈소스 리뷰, built from the headings of existing posts. Verified: `bun run e2e:site` with
template, toolbox, library and preview steps at 390/1440, and the demo from the blog home at 1440/390.

### Writing beside a picture (2026-10-29)

Observed Naver SmartEditor ONE with REA (`.omo/evidence/post-surface/rea-naver/`, owner's permission,
test content removed, nothing published or left in drafts): its "텍스트 배치 → 내부 좌/우측 정렬" merges
the picture and the next paragraph into one wrapping block and puts the caret beside the picture.
Implemented on the existing `side-left`/`side-right` figure presets (the published page already
floats them): choosing a side layout from the picture menu or by resizing guarantees a paragraph
after the picture and moves the caret into it; an empty one shows "그림 옆에 글을 쓰세요". Alt+←/→
keep the picture selected and Escape lands beside it. At 640px and below the site stacks side pictures,
so the text sits under the picture. Verified: blocks Chromium suite with a new menu → type beside →
Markdown step at 390/1440, and the demo at 1440/390.

### Confluence live-doc editing (2026-10-29)

Observed on hyperaccel.atlassian.net with REA 6.8.0 (`inspect-web-page`, `inspect-web-event-listeners`)
and a CDP-driven test page, with the owner's permission; the page was restored afterwards
(`.omo/evidence/post-surface/rea/`). Implemented: a one-row selection toolbar over selected text
(style, bold, italic, strike, code, lists, link, comment) replacing the fixed format bar; block
"+" (opens "/") and drag/menu handles (move, duplicate, delete); an icon + description "/" menu
with headings, lists, quote, code, divider and a row × column table grid; a one-row picture toolbar
(layout, caption, alt text, more, close) with a caption slot and side resize handles snapping to
presets; inline comments on selected text stored as the draft PR's range comments (same threads as
the review screen), with @mention autocomplete from `content/authors` GitHub handles
(`people.json`), replies, resolve and a comment list in the save bar. Verified: `bun run check`
(394 tests), composer and blocks Chromium suites, `bun run e2e:site` including a new
select → comment → @mention → PR comment step at 390/1440.

### Body fidelity and picture popovers (2026-10-28)

Compared on the real `what-is-hbf` post (opened in the editor as one paired block) against
`/posts/what-is-hbf/`. Fixed: GFM tables were dropped by the editor (now `@tiptap/extension-table`,
round-tripped as Markdown tables), soft line breaks showed as hard breaks, the shell's
`keep-all` wrapping, the missing description line, TOC depth (h2 only, same offset script) and
Hugo-style word count/reading time. All 139 body blocks then matched the published heights at
1440 (390 differs only where Hugo's typographic quotes change a line wrap). Picture settings
(image, pair, compare) open as a titled popover with a close button and Escape: below or above
the picture when it fits, centred otherwise, and as a bottom sheet under 700px. Formatting floats
under the site header only while the body has focus; post information opens from the meta line.
`bun run check` (394 tests), composer and blocks Chromium suites and `bun run e2e:site` pass.
Captures: `.omo/evidence/post-surface/compare-hbf-*.png`, `image-popup-*.png`.

## Continuous authoring revision (2026-10-28)

The on-site authoring surface now has one native rendered Tiptap document per language.
Numbered paragraph cards and add/move/delete assembly controls are absent. Metadata
retains all existing fields, grouped by title, authors/classification, publishing and
optional series/cover settings. Author filtering preserves selected contributors.

The current verification includes 392 passing tests with zero failures, TypeScript and
Biome, the native composer Chromium suite, integrated save/re-login/review/publication
at 390/1440, actual tab-close/conflict recovery at both widths, and standalone review.
Browser regressions additionally cover synchronous cursor focus, deletion in both
translations without invisible empty-pair blockers, undo after language switching,
stale metadata events after bundle replacement, canonical pre-save draft URLs, and
remote-saving/saved state surviving local cursor persistence.

Current native-composer evidence:
`/var/folders/5w/5w_p1ly142nfqqt8xh18z_b40000gn/T/hyperaccel-composer-e2e-Tb7Uav/`.
Current integrated evidence:
`/var/folders/5w/5w_p1ly142nfqqt8xh18z_b40000gn/T/hyperaccel-site-flow-LXxL3K/`.
Current recovery evidence:
`/var/folders/5w/5w_p1ly142nfqqt8xh18z_b40000gn/T/onsite-recovery-EuH518/`.

Visual evidence is kept in the outer workspace's
`.omo/evidence/rendered-composer/`. The first independent review confirmed the
continuous-writing direction and metadata coverage, but rejected control state/contrast,
mobile hierarchy, and device-contaminated desktop captures. The `verified-*` captures
replace the invalid desktop-labelled `final-*` set; acceptance checks CSS width, DPR,
article bounds and native PNG width together. The repository's existing dark-only
default remains intentional; light captures exercise theme-token robustness.

The final browser pass also captured a held commit request and its successful
completion in `verified-save-{pending,success}-390-dark-touch.png`. Local cursor
persistence did not replace the remote-saving state. A fresh login navigation
measured first paint at 16 ms, first contentful paint at 40 ms and layout shift at
zero. These are local development measurements, not production performance claims.
The homepage footer entrance, bilingual writing, metadata entry and fake remote
save were exercised using the `rendered-demo-20261028` draft.

Independent A-F review passed layout, hierarchy, typography, targets and consistency.
Its disabled-save contrast finding was fixed by excluding disabled buttons from
hover/active styles; a fresh reviewer accepted the pending/success captures at
approximately 7.27:1 pending contrast. Independent G-J review passed all applicable
items except expanded toolbar order. Removing the disclosure's flex order override
aligns its visual and keyboard order. The refreshed expanded-menu/link captures
show the corrected arrangement. The final CSS build, native composer suite and
whitespace check passed; the preceding save-contrast build also passed the full
integrated save/recovery/review browser suite.
Fresh independent G-J closure review accepted the corrected expanded-toolbar
sequence. No unresolved findings remain from either final review.

The remainder of this ledger records the preceding M1 integration baseline.

Local verification uses a stateful fake GitHub, not live repository writes.
No project commits, deployments or repository settings changes were made.
The hosted editor excludes AI; the pre-existing local editor remains separate.

| Requirement | Evidence |
| --- | --- |
| Login and repository write permission | `src/client/auth/controller.test.ts`, fake GitHub permission tests, integrated Chromium flow |
| Atomic bilingual/image save and conflict handling | `src/client/github/__tests__/adapter.test.ts`, stateful fake GitHub tests |
| One-to-one ko/en blocks and legacy repair | `src/document/{codec,repair,golden}.test.ts`; every existing Markdown file round-trips |
| Expiry, 401, reload, cursor/language/image recovery | `src/e2e/site-flow.e2e.ts` passed at 390 and 1440 after block registration |
| In-site selection comments and persisted approval | Integrated range-comment and approval-after-reload flow; standalone review Chromium suite |
| Squash publication | Integrated fake GitHub merge state asserted at both widths |
| Renderer matches Hugo | `src/render/renderer.test.ts`: normalized output parity for all shared bilingual fixtures |
| Hidden editor entrance and noindex | `layouts/partials/extend_footer.html`, `assets/js/editor-entry.js`, `site/index.html` |
| Responsive TOC, keyboard, print, no JavaScript | `tests/article_reading.cjs` passed on three Korean/English routes, six widths, and short landscape viewports |
| CI rejects invalid posts | 31 CI validator tests passed; full corpus scan completed with zero errors and 42 pre-existing legacy warnings |
| Local and hosted builds | `bun run build` and `bun run build:site` passed |
| Typed blocks, image presets, native drag snapping, slash menu and math edits | `src/client/blocks/e2e/blocks.e2e.ts` passed at 390/1440 |
| Whole editor check | Final `bun run check`: 376 tests passed, zero failures; Biome and TypeScript passed |
| Pre-save tab closure and remote-head conflict recovery | `src/e2e/site-recovery.e2e.ts` passed at 390/1440: pending image, range cursor and active language survive real tab closure; comparison preserves the local snapshot until explicit choice; keep-local rebases and saves, use-remote continues after re-login |
| Deployment completion proof | `src/client/site/publication.test.ts` and review Chromium tests reject stale markers, accept the merged SHA or a proven descendant, and restore merged review after reload |

## Inspected browser artifacts

Integrated flow:
`/var/folders/5w/5w_p1ly142nfqqt8xh18z_b40000gn/T/hyperaccel-site-flow-B8zXo1/`

The lead inspected `390-approved-reload.png` and
`1440-approved-reload.png`: mobile comment sheet and desktop review column are
visible without horizontal overflow or overlapping controls.

Standalone review:
`/var/folders/5w/5w_p1ly142nfqqt8xh18z_b40000gn/T/onsite-review-e2e-zpsoRq/`

TOC regression:
`/tmp/onsite-final-reading/` (screenshots and measurements).

Manual math edit:
`/tmp/onsite-math-fixed-390.png`. The lead clicked a real display-math node,
edited its LaTeX, verified canonical Markdown output and inspected the mobile
capture. Selection uses synchronous editor focus to avoid an animation-frame
focus race; hidden math controls obey the hidden attribute.

Block browser evidence:
`/var/folders/5w/5w_p1ly142nfqqt8xh18z_b40000gn/T/onsite-blocks-e2e-GdbPMF/`.
The lead inspected `390-interactive-blocks.png` and
`1440-image-layouts.png`. Steps, compare, tabs and all five alert types fit the
mobile column; image presets and paired images remain inside the desktop page.
Native drag scenarios cover side-right, wide-left and pair, with actual mouse
events. Each final movement is followed by another movement so Chromium emits
dragover for the destination rather than the preceding coordinate.

## Remaining verification

Whole-tree check, hosted build, integrated Chromium flow and standalone
review suite passed with exit code 0 after the recovery changes.
`git diff --check` also passed. The independent gate initially rejected two
uncovered recovery paths: discovering a never-committed draft after actual tab
closure and comparing/continuing after remote-head conflicts. Both are fixed.
The added regression reproduced the missing local draft list on the old build,
then passed both widths on the final build. A separate codec regression exposed
and fixed trailing blank paragraphs causing a false post-save hash conflict.

Recovery browser artifacts:
`/var/folders/5w/5w_p1ly142nfqqt8xh18z_b40000gn/T/onsite-recovery-8RYqXc/`.
The lead inspected both conflict captures: side-by-side versions on desktop,
stacked versions on mobile, both languages and image inventories visible, and
explicit local/remote continuation controls. The fresh independent gate recheck
returned APPROVE with no blockers. It independently reran both-width recovery,
save-conflict continuation, account isolation and hostile-markup display, plus
140 codec/corpus-golden/Hugo-parity tests with zero failures.

Gate reports in the outer workspace:
`.omo/evidence/onsite-editor-gate-review.md` records the original findings;
`.omo/evidence/onsite-editor-gate-recheck.md` closes both findings and records
the final approval. Live integration remains unverified as described below.

## Human setup and unverified external actions

See `INTEGRATION.md` for GitHub App installation, the Worker client secret,
Actions build variables and required branch checks. Live OAuth and live
publication have not been exercised because those resources are not configured.
The repository remains public as requested; draft Git branches and comments are
therefore discoverable outside the login-gated site interface.
