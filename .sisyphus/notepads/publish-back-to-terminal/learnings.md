# Learnings

## 2026-05-07 Task: initial-context
- Source draft files exist at `.sisyphus/drafts/back-to-the-terminal/index.md` and `.sisyphus/drafts/back-to-the-terminal/index.en.md`.
- Target source files were corrected to existing bundle `content/posts/moving-back-to-terminals/index.md` and `content/posts/moving-back-to-terminals/index.en.md`.
- Drafts currently contain placeholder cover image metadata; source-ready files must not contain `[TODO: cover image]`.
- Sprint Retrospective section has already been removed from the drafts.

## 2026-05-07 Task: target-correction
- User clarified that `content/posts/moving-back-to-terminals/` already exists.
- Existing files are placeholder multilingual guide content and should be replaced with the actual bilingual post draft.


## 2026-05-07 Task: replace-moving-back-to-terminals-placeholders
- Replaced `content/posts/moving-back-to-terminals/index.md` exactly from `.sisyphus/drafts/back-to-the-terminal/index.md`.
- Replaced `content/posts/moving-back-to-terminals/index.en.md` exactly from `.sisyphus/drafts/back-to-the-terminal/index.en.md`.
- `hugo -D` builds successfully with both draft post files in the target bundle.


## 2026-05-07 Task: resolve-source-frontmatter
- Removed the placeholder `cover` frontmatter block from both `content/posts/moving-back-to-terminals/index.md` and `content/posts/moving-back-to-terminals/index.en.md`.
- `draft: true`, `authors: ['Taeseo Um']`, `series_idx: 2`, titles, summaries, tags, and categories remained intact after the frontmatter cleanup.
- `hugo -D` builds successfully after removing the placeholder cover metadata.


## 2026-05-07 Task: writing-style-cleanup
- Cleaned the target bundle source files in `content/posts/moving-back-to-terminals/` without changing `draft: true` or adding cover metadata.
- Confirmed acronym first mentions now include readable full forms for CLI, MCP, LSP, and SWE-bench in both language versions where practical.
- Verified both Markdown tables have consistent column counts and `hugo -D` builds successfully with the draft post included.


## 2026-05-07 Task: F2 Style QA
- VERDICT: APPROVE.
- Reviewed `content/posts/moving-back-to-terminals/index.md` and `content/posts/moving-back-to-terminals/index.en.md` against `.gemini/styleguide.md`.
- Korean bold-spacing grep `\*\*[^*]+\*\*[가-힣]` returned no matches.
- Placeholder checks for `Sprint Retrospective`, `[TODO: cover image]`, and `^cover:` returned no matches.
- Acronym first mentions are readable where practical: CLI is introduced as `Command Line Interface(CLI)`, MCP as `Model Context Protocol(MCP)`, LSP as `Language Server Protocol(LSP)`, and SWE-bench through `Software Engineering Benchmark(SWE-bench)` in both language files.
- Heading hierarchy uses H2 body sections only in both files, with no skipped nested levels.
- Both markdown tables in both files have consistent three-column pipe counts.
- Aligned frontmatter fields confirmed across Korean and English: `draft`, `authors`, `tags`, `categories`, `series`, `series_idx`, and `comments`.
- Markdown LSP diagnostics remain unavailable because no `.md` language server is configured in this workspace.


## 2026-05-07 Task: F1 Content QA
- VERDICT: APPROVE. Reviewed both `content/posts/moving-back-to-terminals/index.md` and `content/posts/moving-back-to-terminals/index.en.md` completely.
- Both versions include the terminal/CLI lifestyle shift, Harness Wars framing, Prompt Engineering to Context Engineering transition, research/benchmark references, and famous harness discussion.
- Research references include SWE-bench/SWE-bench Verified, Andrew Ng agentic workflow patterns, and CodeAct with careful claim boundaries.
- Famous harness discussion covers Claude Code, OpenCode, OpenHands, Aider, SWE-agent, Hermes Agent, Oh My OpenAgent, and Oh My Claude in both languages.
- `Sprint Retrospective` remains absent from both source files.


## 2026-05-07 Task: F3-build-qa
- VERDICT: APPROVE. `hugo --config hugo.yaml --buildDrafts --destination /var/folders/t7/zpqbfs5126jbfv8kw297_f_80000gn/T/opencode/hugo-draft-build-f3-20260507150428` exited 0.
- Generated pages confirmed at `posts/moving-back-to-terminals/index.html` and `en/posts/moving-back-to-terminals/index.html`.
- Verified Korean title `터미널로 돌아가자: 바이브 코딩 시대가 CLI를 되살리는 이유` and English title `Back to the Terminal: Why the Vibe Coding Era is Reviving the CLI` in generated output.
- Hugo build output contained no missing-cover-image error.


## F4 Scope QA - 2026-05-07
VERDICT: APPROVE
Evidence: `git status --short --untracked-files=all` shows only `.sisyphus/` orchestration state plus `content/posts/moving-back-to-terminals/index.md` and `content/posts/moving-back-to-terminals/index.en.md`. `git diff --stat -- ':!node_modules'` and staged diff stat were empty because all visible changes are untracked. No unrelated source directories, config files, dependency files, or other content posts were modified.

## 2026-05-07 Task: boulder-completion-cleanup
- Re-read `.sisyphus/plans/publish-back-to-terminal.md`; all top-level TODOs and Final Verification Wave gates are checked.
- Removed `.sisyphus/boulder.json` because the active plan is complete and no worktree cleanup is required.

## 2026-05-07 Task: harness-section-deepening
- Revised the bilingual harness section in `content/posts/moving-back-to-terminals/index.md` and `content/posts/moving-back-to-terminals/index.en.md`.
- Removed standalone coverage and table rows for `SWE-agent`, `Aider`, and `OpenHands`; also removed `Oh My Claude` from the focused comparison.
- Deepened discussion of `Hermes Agent`, `Claude Code`, `OpenCode`, and `Oh My OpenAgent`, emphasizing memory placement, project rules, skills, hooks, MCP, compaction, and harness-specific prompts.
- Verification passed: removed-harness grep found no `SWE-agent`, `Aider`, `OpenHands`, or `Oh My Claude`; Korean bold-spacing and placeholder-cover greps found no matches; Hugo draft build succeeded.

## 2026-05-07 Task: sensory-system-section
- Added a new bilingual section after the CLI-return section: `CLI는 에이전트의 감각기관이다` / `The CLI Is the Agent's Sensory System`.
- The section frames `stdout`, `stderr`, exit codes, logs, tests, and `git diff` as the agent's sensory loop, then connects harness performance to perception, action, feedback, state, and verification.
- Included cautious research framing: Andrew Ng's HumanEval comparison, CodeAct's tool-use benchmark results, and Self-Refine's feedback-and-rewrite loop evidence, with explicit caveats against generalizing to all coding tasks.
- Verification passed: new headings exist in both files; removed-harness grep found no `SWE-agent`, `Aider`, `OpenHands`, or `Oh My Claude`; Korean bold-spacing and placeholder-cover greps found no matches; Hugo draft build succeeded.
