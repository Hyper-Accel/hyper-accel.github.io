---
name: tech-blog-coauthoring
description: Guides collaborative authoring of HyperAccel technical blog posts in this Hugo/PaperMod repo. Use this skill whenever the user wants to write, draft, outline, co-author, translate, or prepare a HyperAccel tech blog post, including casual requests like "블로그 글 쓰자", "초안 잡아줘", "기술 블로그로 만들자", or when source notes need to become a publishable post. Korean is authored first, then English is translated after reader testing; repo conventions, same-author examples, multilingual filenames, frontmatter, images, and the well-writing review loop are part of the workflow.
---

# Tech Blog Co-Authoring

This skill turns rough technical material into a HyperAccel blog post through a collaborative writing loop. The default path is **Korean first**, reader-tested, then translated to English. Use `well-writing` after drafting or translation to sustain the loop: write → review → revise → re-review.

## Operating Principles

- Treat the author as the source of truth. Ask for intent, constraints, trade-offs, and factual details before inventing connective tissue.
- Preserve the author's technical stance and Korean voice. Improve structure and readability without making the post sound generic.
- Ground every post in this repo's conventions before drafting: read `README.md`, `.gemini/styleguide.md`, `archetypes/posts.md`, and same-author posts when available.
- Prefer small, reviewable edits. When a file already exists, patch sections instead of reprinting or rewriting the whole post.

---

## Stage 0: Repo Pattern Check

Do this before creating or editing post files.

1. Read `.gemini/styleguide.md` for the current writing and markdown rules.
2. Read `README.md` and `archetypes/posts.md` for Hugo and multilingual conventions.
3. Identify the intended author from the user, frontmatter, or context.
4. If an author is known, find posts with matching `authors` frontmatter and use those as the primary reference for:
   - frontmatter shape and optional fields
   - section rhythm and ending style
   - tone, title style, series conventions, and image usage
5. If no same-author post exists, sample recent posts in `content/posts/` and prefer page-bundle examples with both Korean and English versions.

Do not create a second format unless the repo already uses it. The preferred new-post layout is:

```text
content/posts/{post-slug}/
├── index.ko.md  (Korean draft; index.md is acceptable only when matching an existing pattern)
├── index.en.md  (English translation after Korean is stable)
└── images/      (post-local images when needed)
```

---

## Stage 1: Context Gathering

**Goal**: Learn enough to draft with the author's intent, not just fill a template.

Ask only what is needed for the next step. Short answers and messy dumps are fine.

### Initial Questions

1. What is the post topic and core message?
2. Who is the target reader? Examples: ML engineers, compiler practitioners, AI hardware readers, internal engineering peers.
3. What should the reader understand or do after reading?
4. Who is the author? Does `content/authors/{author}/` already exist?
5. Is this part of a series? If yes, what are the Korean and English series names, and what is `series_idx`?
6. What source material should be used? Papers, Confluence notes, design docs, meeting notes, code, screenshots, diagrams, benchmark data.
7. Are there claims that need citations, careful wording, or reviewer confirmation?

### Info Dumping

Encourage the author to paste unstructured notes: background, architecture, alternatives rejected, constraints, experiments, anecdotes, diagrams, and reviewer comments.

After the dump, ask 5-10 clarifying questions focused on missing causal links, numbers, trade-offs, and reader assumptions. Accept compact replies such as `1: yes, 2: no because..., 3: use paper X`.

**Exit**: Proceed when you can state the audience, thesis, key sections, factual inputs, metadata needs, and open risks.

---

## Stage 2: Structure and Scaffold

**Goal**: Agree on the shape before drafting prose.

### Metadata Draft

Draft frontmatter early so repo requirements are not forgotten. Match same-author examples when possible.

Recommended fields:

```yaml
---
date: 'YYYY-MM-DDTHH:MM:SS+09:00'
draft: true
title: 'Korean title'
cover:
  image: "images/01-cover.png"
  alt: "Descriptive alt text"
  caption: "Short caption"
  relative: true
authors: ["Author Name"]
tags: ["Tag1", "Tag2"]
categories: ["Category"]
series: ["Korean Series Name"] # only for series posts
series_idx: 1                  # only for ordered series posts
summary: "One-line summary"
description: "SEO-oriented description"
keywords: ["Keyword1", "Keyword2"]
comments: true
---
```

Notes:
- `authors` must match `content/authors/` entries.
- Korean and English files share the same slug, author, tags, categories, and `series_idx` unless there is a deliberate reason not to.
- `series` should be localized: Korean in `index.ko.md` or `index.md`, English in `index.en.md`.
- Keep `draft: true` while co-authoring unless the user explicitly asks to prepare for publishing.

### Section Scaffold

If the user already has a structure, refine it. Otherwise propose 3-5 sections with a short purpose for each.

Create or update `content/posts/{post-slug}/index.ko.md` with frontmatter, headings, and placeholders such as `[작성 예정: explain why this section exists]`.

Present the scaffold for author review before drafting full sections. The author should be able to approve, reorder, merge, or cut sections quickly.

**Exit**: Proceed when the scaffold and metadata are accepted or when the user asks to continue with a clearly stated assumption.

---

## Stage 3: Section Co-Writing Loop

**Goal**: Write one section at a time through brainstorm → curate → draft → refine.

For each section:

1. **Clarify**: Ask 3-7 targeted questions about facts, examples, and intended emphasis.
2. **Brainstorm**: Generate 5-15 numbered content options. Make options concrete, not abstract.
3. **Curate**: Ask what to keep, remove, combine, or soften. Accept answers like `Keep 1,4,7; remove 3; combine 8+9`.
4. **Gap Check**: Ask whether a skeptical reader would still be missing context, evidence, or motivation.
5. **Draft**: Replace only that section's placeholder with Korean prose.
6. **Refine**: Apply feedback with small patches and carry direct author edits into later sections.

### Drafting Rules

Apply `.gemini/styleguide.md` while writing, especially:

- Korean text after bold text needs a space: `**GPU** 는`, `**Cerebras** 의`.
- First use of important acronyms should introduce the full term: `**Tensor Processing Unit(TPU)**`.
- Body sections normally start at H2. Avoid H1 unless matching an existing same-author pattern.
- Use language tags on code blocks.
- Put images before the content they illustrate when practical.
- Use descriptive alt text and meaningful image names.
- Keep sentences and paragraphs short enough for technical readers to follow.

### Near Completion

At roughly 80% completion, read the full Korean draft and check:

- whether the thesis is clear in the opening
- whether sections flow from motivation → mechanism → evidence → takeaway
- whether facts, numbers, and citations are supported by the source material
- whether any paragraph repeats an earlier point
- whether every image, code block, and list earns its place

Ask what can be removed before adding more.

---

## Stage 4: Reader Testing

**Goal**: Verify the post works for readers who do not share the author's context.

Use a fresh review perspective when possible.

1. Predict 5-10 realistic reader questions.
2. Answer them using only the draft.
3. Mark where the draft is ambiguous, assumes hidden knowledge, overclaims, or contradicts itself.
4. Patch the Korean draft before translation.

If using a sub-agent is available, ask it to read only the draft and the predicted questions. If not, guide the user to paste the draft into a fresh Claude conversation and ask:

- "What's ambiguous in this doc?"
- "What knowledge does it assume?"
- "Which claims need evidence?"
- "What questions would a target reader still have?"

**Exit**: Continue when the draft answers the predicted reader questions without new major gaps.

---

## Stage 5: English Translation

**When**: Only after `index.ko.md` or `index.md` is stable and has passed reader testing.

1. Create `content/posts/{post-slug}/index.en.md`.
2. Translate frontmatter and body, preserving the same slug and technical meaning.
3. Localize title, `summary`, `description`, and `series`; keep author, tags, categories, `series_idx`, images, and technical identifiers consistent unless the repo pattern says otherwise.
4. Preserve code blocks, shortcodes, image paths, and links exactly unless a localized URL is required.
5. Run the reader-testing questions again against the English version or ask the author to review the translation.

Translation should read like an English technical post, not a sentence-by-sentence literal rendering.

---

## Stage 6: Review and Final Checks

Use `well-writing` after Korean drafting and again after English translation.

Checklist before handing off:

- Korean and English files share the same slug/folder.
- Author names match `content/authors/`.
- `draft` state is intentional.
- Frontmatter includes useful `summary` and `description`.
- Series posts include localized `series` names and consistent `series_idx`.
- Images are present, referenced with relative paths, and have descriptive alt text.
- Code blocks have language tags.
- No bold-Korean rendering pattern like `**text**한글` remains.
- Acronyms and technical terms are introduced before shorthand use.
- Run a local Hugo build or preview command when appropriate, and report the result.

---

## Collaboration Shortcuts

- If the user wants to skip a stage, allow it, but state the quality risk briefly and preserve the missing item as a TODO in the draft or handoff.
- If source material is thin, produce an outline and question list rather than fabricating detail.
- If the author directly edits the markdown, treat those edits as canonical and adapt future sections to match.
- If the task is only translation of an already approved Korean post, start at Stage 5 but still check frontmatter and multilingual consistency.
