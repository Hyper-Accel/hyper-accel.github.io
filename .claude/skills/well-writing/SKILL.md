---
name: well-writing
description: This skill should be used when reviewing and editing markdown blog posts for the HyperAccel technical blog. It provides style guide compliance checking and readability improvements.
---

# Well-Writing

This skill helps review and edit markdown blog posts for the HyperAccel technical blog by ensuring style guide compliance and improving readability.

**Feedback Loop**: Use with `tech-blog-coauthoring`: write → review (well-writing) → revise (tech-blog-coauthoring) → re-review (well-writing).

## When to Offer This Review

**Triggers**: "review this post", "check style", "edit blog post", "validate frontmatter", "improve readability"

**When offering**: Explain that you'll check Critical Issues → Content Quality → Markdown Formatting → Images. Ask which file(s) to review.

---

## Stage 1: Critical Issues

**Goal**: Fix must-fix items before merging.

### Load Style Guide

- Load `.gemini/styleguide.md` (or `references/styleguide.md`) for detailed rules
- Load `references/checklist.md` for quick reference during review

### Bold Rendering

- Search for pattern: `\*\*[^*]+\*\*[가-힣]` (bold text immediately followed by Korean)
- Ensure space between closing `**` and Korean text
- Example: `**GPU** 는` (correct) vs `**GPU**는` (incorrect)

### Acronym Usage

- Verify all acronyms are introduced with full terms first: `**FullTerm(Acronym)**`
- Check that acronyms in title/summary are introduced in first paragraph
- Common acronyms: GPU, TPU, SM, CUDA, HBM, SMEM, VMEM, MXU, VPU, TCS, XLA, JAX, Pallas, Triton

### Capitalization

- Ensure consistent capitalization throughout
- Acronyms uppercase: GPU, TPU, SM
- Common nouns lowercase: loop, thread, warp, core
- Brand names correct: NVIDIA, Google, TensorFlow, PyTorch

---

## Stage 2: Content Quality

**Goal**: Check readability and technical writing.

### Readability

- Sentences should be within 50 characters (flexible for technical terms)
- Paragraphs should be within 10 sentences or about 300 characters
- Break complex explanations into multiple sentences
- Use blank lines to separate distinct ideas

### Technical Writing

- Technical terms explained when first introduced
- Code examples have comments or explanations
- Images have meaningful alt text
- Content has logical structure with clear sections

---

## Stage 3: Markdown Formatting

**Goal**: Ensure formatting consistency.

- Headings: Proper hierarchy (H2 → H3 → H4, no skipping)
- Code blocks: All have language tags (` ```python`, ` ```bash`, etc.)
- Images: Descriptive alt text, meaningful file names
- Links: Descriptive link text
- Lists: Consistent formatting (`-` for unordered)
- Frontmatter: All required fields present and correct

---

## Stage 4: Images

**Goal**: Ensure images are referenced correctly. **Recommend manual verification** by the author.

- Confluence images: Download manually; save to `images/` with format `{number}-{descriptive-name}.{ext}` (e.g., `01-tpuv1-arch.png`)
- The agent may briefly remind: check references match files, alt text is descriptive, placement is logical
- Full verification (orphaned files, missing refs, naming, placement) → **ask the author to verify manually**

---

## Providing Feedback

When reviewing a post:

1. **Prioritize by severity**:
   - Critical: Must fix (rendering issues, major readability problems)
   - High: Significantly impacts readability or understanding
   - Medium: Formatting or consistency issues

2. **Be specific**:
   - Point to exact locations (line numbers if possible)
   - Provide before/after examples
   - Reference specific rules from style guide

3. **Suggest fixes**:
   - Show correct format
   - Explain why the fix is needed

---

## Style Guide Reference

Refer to `.gemini/styleguide.md` when reviewing. Summary:

| Priority | Item | Summary |
|----------|------|---------|
| Critical | Bold + Korean | `**GPU** 는` (space required) |
| Critical | Acronyms | First use: `**FullTerm(Acronym)**` |
| Critical | Capitalization | Acronyms uppercase, common nouns lowercase |
| High | Readability | ~50 chars/sentence, 5–7 sentences/paragraph |
| High | Technical terms | Explain on first use |
| Medium | Headings | H2→H3→H4, no skipping |
| Medium | Code | Language tag required |
| Medium | Images | `{number}-{descriptive-name}.{ext}`, descriptive alt text |

---

## Tips

**Context matters**: Some rules may be flexible for technical content (e.g., longer sentences for complex explanations).

**Consistency first**: If a pattern is used consistently throughout a post, it may be acceptable even if not ideal.

**Be constructive**: When pointing out issues, suggest specific fixes and explain the reasoning.

**After review**: If changes are needed, return to `tech-blog-coauthoring` to revise those sections, then run this skill again.
