---
name: tech-blog-coauthoring
description: Guides users through collaborative writing of HyperAccel technical blog posts. Use when writing new blog posts, drafting tech content, or creating posts. Follows a 3-stage workflow (Context → Refinement → Reader Testing), then English translation. Author writes in Korean first.
---

# Tech Blog Co-Authoring

This skill guides collaborative writing of HyperAccel technical blog posts: **Korean first**, then English translation after completion. Use the `well-writing` skill for review to sustain the feedback loop (write → review → revise).

## When to Offer This Workflow

**Triggers**: "write a blog post", "draft a post", "create a tech blog post"

**When offering**: Explain the 3-stage workflow and ask if the user wants to try it.
1. **Context Gathering**: Audience, purpose, series info, reference materials
2. **Refinement & Structure**: Section-wise brainstorming → curation → drafting
3. **Reader Testing**: Validate the doc with reader-perspective questions

If declined, proceed freeform. If accepted, start with Stage 1.

---

## Stage 1: Context Gathering

**Goal**: Clarify audience, purpose, and structure.

### Initial Questions

1. Post topic / core message?
2. Target audience? (e.g., ML engineers, compiler practitioners)
3. What should readers gain after reading?
4. Is this part of a series? Series name?
5. Reference materials (papers, Confluence, docs)?

Short answers are fine. Ask for templates or existing posts to reference if applicable.

**Format reference**: Before drafting, identify posts by the **same author** (`authors` in frontmatter) and use them as the primary reference for document format—frontmatter structure, section flow, tone, and styling. If none exist, refer to other posts in `content/posts/`.

### Info Dumping

Encourage dumping background, architecture, related discussions, why alternatives weren't used, and constraints. No need to organize.

### Clarifying Questions

After the dump, ask 5–10 clarifying questions on unclear areas. Accept shorthand replies (e.g., "1: yes, 2: see #channel, 3: no because…").

**Exit**: Proceed to Stage 2 when basics are clear and you can ask about trade-offs and edge cases.

---

## Stage 2: Refinement & Structure

**Goal**: For each section: brainstorm → curate → draft → refine. Apply `.gemini/styleguide.md` while drafting.

### Section Order

If structure is clear, ask which section to start with. Otherwise propose 3–5 sections and confirm with the user.

### Document Scaffold

Create `content/posts/{post-slug}/index.ko.md` with headers and placeholders (`[To be written]`). Match frontmatter and structure to **same-author** existing posts when available.

**Plan review**: Before drafting section content, present the scaffold (section structure and headers) to the author for review. Proceed to per-section drafting only after confirmation.

### Per-Section Process

#### 1. Clarifying Questions

Ask 5–10 questions about what belongs in this section.

#### 2. Brainstorming

Generate 5–20 numbered options for section content.

#### 3. Curation

Ask which to keep / remove / combine. Example: "Keep 1,4,7,9", "Remove 3 (duplicates 1)".

#### 4. Gap Check

Ask if anything important is missing given the selections.

#### 5. Drafting

Replace placeholders with drafted content. **Always** apply `.gemini/styleguide.md`:
- Space after bold when followed by Korean: `**GPU** 는`
- First use of acronym: `**FullTerm(Acronym)**`
- Sentence/paragraph length, heading hierarchy (max H3), code block language tags

#### 6. Iterative Refinement

Edit with `str_replace` based on feedback. Reflect direct edits in future sections.

**Section done**: After 3 iterations with no substantial changes, ask if anything can be removed, then confirm completion.

### Near Completion

At ~80% done, read the full document and check:
- Flow and consistency
- Redundancy or contradictions
- Unnecessary content
- Whether each sentence carries weight

---

## Stage 3: Reader Testing

**Goal**: Verify the doc works for readers.

### With Sub-agent

1. Predict 5–10 realistic reader questions
2. Test with a fresh Claude instance using only the doc and questions
3. Check for ambiguity, false assumptions, contradictions
4. Loop back to refine sections if issues exist

### Without Sub-agent

Guide the user:
1. Open a fresh Claude conversation (https://claude.ai)
2. Paste the document
3. Ask the predicted questions
4. Also ask: "What's ambiguous in this doc?", "What knowledge does it assume?"
5. Apply fixes based on the results

**Exit**: When questions are answered correctly and no new gaps or ambiguities remain.

---

## Stage 4: English Translation

**When**: After the Korean post (`index.ko.md`) passes Reader Testing.

### Translation Workflow

1. Create `content/posts/{post-slug}/index.en.md`
2. Translate frontmatter and body from `index.ko.md`
3. Apply style guide rules for English (bold spacing, acronym format, sentence/paragraph length, code blocks, images, links)
4. Recommend Reader Testing on the English version too

### Multilingual Structure

- Korean: `content/posts/{post-slug}/index.ko.md`
- English: `content/posts/{post-slug}/index.en.md`
- Same slug/folder for both

---

## Feedback Loop: Review and Revise

After writing/translation, use the **well-writing** skill for review.

1. Suggest: "Run the `well-writing` skill to review?"
2. For issues (Critical / High / Medium), apply fixes using this workflow
3. Re-run well-writing as needed

Sustain the loop: write (tech-blog-coauthoring) ↔ review (well-writing).

---

## Style Guide Reference

Refer to `.gemini/styleguide.md` when drafting. Summary:

| Priority | Item | Summary |
|----------|------|---------|
| Critical | Bold + Korean | `**GPU** 는` (space required) |
| Critical | Acronyms | First use: `**FullTerm(Acronym)**` |
| Critical | Capitalization | Acronyms uppercase, common nouns lowercase |
| High | Readability | ~50 chars/sentence, 5–7 sentences/paragraph |
| High | Technical terms | Explain on first use |
| Medium | Headings | H2→H3, no H4+ |
| Medium | Code | Language tag required |

Image rules: see well-writing skill "Stage 4: Images".

---

## Tips

**Tone**: Direct and procedural. Explain rationale only when it affects behavior.

**Deviations**: If the user wants to skip a stage, ask and allow freeform flow.

**Editing**: Use `str_replace`. Avoid reprinting the whole doc.

**Quality**: Prefer meaningful edits over speed.
