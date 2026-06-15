# Publish Back to the Terminal Draft

Plan created: 2026-05-07
Owner: TaeSeo Um
Target slug: `moving-back-to-terminals`

## Context

The bilingual draft already exists under:

- Korean draft: `.sisyphus/drafts/back-to-the-terminal/index.md`
- English draft: `.sisyphus/drafts/back-to-the-terminal/index.en.md`
- Planning/research notes: `.sisyphus/drafts/back-to-the-terminal-cli-agent-era.md`

Target source bundle:

- Korean post: `content/posts/moving-back-to-terminals/index.md`
- English post: `content/posts/moving-back-to-terminals/index.en.md`

Important constraints:

- Keep the post as `draft: true` until TaeSeo explicitly approves publishing.
- Do not leave `[TODO: cover image]` in source content. If no cover image exists, remove the `cover` block from both source files.
- Preserve the latest draft edits: the `Sprint Retrospective` section must remain removed.
- Preserve the deeper harness section covering Claude Code, OpenCode, OpenHands, Aider, SWE-agent, Hermes Agent, Oh My OpenAgent, and Oh My Claude.
- Follow HyperAccel blog conventions from README and `.gemini/styleguide.md`.

## TODOs

- [x] Replace the existing `content/posts/moving-back-to-terminals/` placeholder files with the Korean and English draft files as `index.md` and `index.en.md`.

  Acceptance Criteria:
  - [ ] `content/posts/moving-back-to-terminals/index.md` exists.
  - [ ] `content/posts/moving-back-to-terminals/index.en.md` exists.
  - [ ] Both files preserve bilingual titles, body content, series metadata, tags, categories, and summaries.
  - [ ] No unrelated files are modified.

- [x] Resolve source-ready frontmatter for both post files.

  Acceptance Criteria:
  - [ ] `draft: true` remains in both files.
  - [ ] `[TODO: cover image]` is not present anywhere in source files.
  - [ ] If no actual image is provided, the entire `cover` block is removed cleanly from both files.
  - [ ] `authors: ['Taeseo Um']`, `series_idx: 2`, and matching tags/categories remain consistent across languages.

- [x] Run a writing/style cleanup pass on both source files.

  Acceptance Criteria:
  - [ ] No `## Sprint Retrospective` heading exists.
  - [ ] Korean bold spacing follows styleguide rules, e.g. `**Context Engineering** 입니다`.
  - [ ] Acronyms are introduced in readable form where practical: CLI, MCP, LSP, SWE-bench.
  - [ ] Markdown tables render correctly in both files.
  - [ ] Links are descriptive and point to official or stable references.

- [x] Verify Hugo renders the new draft post locally.

  Acceptance Criteria:
  - [ ] `hugo --config hugo.yaml --buildDrafts` exits successfully.
  - [ ] No missing image error is caused by the removed/updated cover metadata.
  - [ ] Korean and English post paths are generated as a translation pair.

## Final Verification Wave

- [x] F1 Content QA: Review both source files against the user request and confirm the narrative includes CLI return, Harness Wars, Context Engineering, research/benchmark references, and famous harness discussion.

- [x] F2 Style QA: Check both source files against `.gemini/styleguide.md`, including Korean bold spacing, acronym readability, heading hierarchy, table formatting, and frontmatter consistency.

- [x] F3 Build QA: Run Hugo draft build and confirm exit code 0.

- [x] F4 Scope QA: Inspect `git diff --stat` and confirm only intended post files and Sisyphus state files changed.
