# Quick Reference Checklist

This is a quick reference checklist for reviewing blog posts. For detailed explanations, see `styleguide.md`.

---

## Critical Issues (Must Fix)

### Bold Rendering
- [ ] No `**text**한글` patterns without spaces
- [ ] Search pattern: `\*\*[^*]+\*\*[가-힣]`
- [ ] All bold markers followed by Korean text have a space

### Acronym Usage
- [ ] All acronyms introduced with full terms first: `**FullTerm(Acronym)**`
- [ ] Acronyms in title/summary are introduced in first paragraph
- [ ] Common acronyms: GPU, TPU, SM, CUDA, HBM, SMEM, VMEM, MXU, VPU, TCS, XLA, JAX, Pallas, Triton

### Capitalization
- [ ] Consistent capitalization throughout document
- [ ] Acronyms are uppercase: GPU, TPU, SM, CUDA
- [ ] Common nouns are lowercase: loop, thread, warp, core
- [ ] Brand names correct: NVIDIA, Google, TensorFlow, PyTorch

---

## High Priority

### Readability
- [ ] Sentences within 50 characters (flexible for technical terms)
- [ ] Paragraphs within 10 sentences
- [ ] Paragraphs within 200 characters
- [ ] Complex explanations broken into multiple sentences
- [ ] Blank lines separate distinct ideas

### Technical Writing
- [ ] Technical terms explained when first introduced
- [ ] Code examples have comments or explanations
- [ ] Images have meaningful alt text
- [ ] Content has logical structure with clear sections
- [ ] Transitions connect sections smoothly

---

## Medium Priority

### Markdown Formatting
- [ ] H1 only for page title
- [ ] Heading hierarchy not skipped (H2 → H3 → H4)
- [ ] All code blocks have language tags
- [ ] Inline code uses single backticks
- [ ] List markers are consistent (`-` for unordered)
- [ ] Images have descriptive alt text
- [ ] Link text is descriptive

### Frontmatter
- [ ] All required fields present
- [ ] Date format: `'2026-01-03T17:20:16+09:00'`
- [ ] Authors match entries in `content/authors/`
- [ ] Tags are relevant and consistent
- [ ] Summary is concise and descriptive

---

## Quick Search Patterns

Use these patterns to find common issues:

- **Bold + Korean**: `\*\*[^*]+\*\*[가-힣]`
- **Acronyms**: Search for common acronyms (GPU, TPU, SM, etc.) and verify first use
- **Capitalization**: Search for variations (Loop/loop, GPU/gpu)
- **Long sentences**: Look for sentences with multiple commas or conjunctions
- **Code blocks**: Search for ` ``` ` without language tags

---

## Common Acronyms Reference

**Must follow FullTerm(Acronym) rule**:
- GPU, TPU, SM, CUDA, HBM, SMEM, VMEM, MXU, VPU, TCS, XLA, JAX, Pallas, Triton, VLIW, DMA, ALU, SIMD, SPMD

**May skip full form**:
- CPU, AI, ML, API, URL, HTTP, HTTPS
