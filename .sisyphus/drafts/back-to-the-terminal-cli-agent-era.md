# Draft: Back to the Terminal — CLI Agent Era Blog Post

## Requirements (confirmed)
- Author: TaeSeo Um.
- Write the second installment of the AI Agent series.
- Title idea: "Back to the Terminal: Why the Vibe Coding Era is Reviving the CLI".
- Core narrative: move from "Model Wars" to "Harness Wars"; focus on orchestration, lifestyle shift, and developers returning to the black screen because agents live there.
- Include technical pillars: CLI return, harness/orchestration over raw model strength, context engineering beyond prompt engineering, research/benchmark references, IDE vs CLI as use-case choice.
- Writing style: lifestyle over manual, professional yet witty, scannable, avoid "In conclusion", include a small Model Era vs Agentic Era comparison table.
- Produce Korean and English versions intended for `index.md` and `index.en.md`.
- Use TaeSeo Um's voice; tone reference link/text was requested but not provided.

## Technical Decisions
- Planning/drafting only: actual `content/posts/.../index.md` and `index.en.md` must not be edited by Prometheus; draft artifacts stay under `.sisyphus/drafts/`.
- Korean-first workflow from `tech-blog-coauthoring` skill is the default, then English translation after Korean draft stabilizes.
- Need repository exploration before final drafting to identify same-author format, existing series metadata, filename conventions, and voice patterns.

## Research Findings
- Author voice source: `content/posts/how-we-use-ai/index.md` and `index.en.md` are the only explicit TaeSeo Um AI/agent posts found. Voice patterns: first-person/team framing, relatable joke/anecdote openings, contrast structures (`not X, but Y`), pragmatic optimism, metaphors like junior engineer/rocket booster/force multiplier/context master, and future-facing teasers.
- Frontmatter pattern from TaeSeo post: `date`, `draft`, `title`, `cover`, `authors: ['Taeseo Um']`, `tags`, `categories`, `series`, `summary`, `comments: true`.
- Blog convention: preferred page bundle is `content/posts/<slug>/index.md` + `index.en.md`; Korean default file may be `index.md`.
- Style constraints: space after bold text before Korean particles, first-use acronyms as `Full Term(Acronym)`, ordered heading levels, language tags on code blocks, concise readable paragraphs, descriptive alt text.
- Research guardrails: SWE-bench evaluates real GitHub issue patches and SWE-bench Verified is a 500-task human-filtered subset; Andrew Ng’s four patterns are Reflection, Tool use, Planning, Multi-agent collaboration; CodeAct proposes executable Python code as action space and reports benchmark-specific gains over text/JSON action formats.
- Harness source-name guardrails: use `Hermes Agent` (by Nous Research), `Oh My OpenAgent`, `oh-my-claude / Oh My Claude`, `OpenHands`, `SWE-agent`, `Aider`, `Claude Code`, and `OpenCode`. Do not call Hermes Agent a model family; do not call Oh My OpenAgent or Oh My Claude base agents; describe them as opinionated plugins/wrappers around existing agent tools.
- User feedback incorporated: remove the entire `Sprint Retrospective` section; deepen research section with famous harnesses and why each became known.

## Open Questions
- Tone reference was missing; defaulting to repo-discovered TaeSeo post unless author provides the previous-post link/text.
- Desired depth: polished full draft now vs staged co-authoring workflow with section-by-section review.
- Exact post slug/frontmatter values are not yet confirmed; default slug candidate: `back-to-the-terminal-cli-agent-era`.

## Scope Boundaries
- INCLUDE: Korean full draft, English full draft, frontmatter recommendations, citation/source notes, and execution plan for placing them into `index.md` / `index.en.md`.
- EXCLUDE: Directly editing blog post source files, publishing, committing, or creating PR.
