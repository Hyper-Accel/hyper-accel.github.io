# HyperAccel Blog Style Guide

This document defines style rules for writing markdown posts in the HyperAccel technical blog. Follow these rules to ensure consistency, readability, and proper rendering across all blog posts.

---

## Table of Contents

1. [Critical Issues (Must Fix)](#1-critical-issues-must-fix)
   - [Markdown Bold Rendering](#11-markdown-bold-rendering)
   - [Acronym Usage](#12-acronym-usage)
   - [Term Capitalization Consistency](#13-term-capitalization-consistency)
2. [Content Quality (High Priority)](#2-content-quality-high-priority)
   - [Readability](#21-readability)
   - [Technical Writing](#22-technical-writing)
3. [Markdown Formatting (Medium Priority)](#3-markdown-formatting-medium-priority)
   - [Headings](#31-headings)
   - [Code Blocks](#32-code-blocks)
   - [Images and Links](#33-images-and-links)
   - [Lists and Quotes](#34-lists-and-quotes)
4. [Frontmatter and Metadata](#4-frontmatter-and-metadata)
5. [Complete Examples](#5-complete-examples)
6. [Review Checklist](#6-review-checklist)

---

## 1. Critical Issues (Must Fix)

These issues cause rendering problems or significantly impact readability. They must be fixed before merging.

### 1.1 Markdown Bold Rendering

**Problem**: When Korean text immediately follows bold text, markdown rendering may break, causing asterisks to appear as literal characters in the rendered output.

**Rules**:
- Always add a space when Korean particles (은, 는, 이, 가, 을, 를, 으로, 로, 의, 에, 에서, 와, 과, 등) immediately follow bold markers `**`
- Pay special attention when Korean text follows bold text ending with parentheses
- This applies to all bold text, not just acronyms
- The space should be between the closing `**` and the Korean text

**Incorrect Examples**:
```markdown
**SM(Streaming Multiprocessor)**으로 구성되어 있습니다.
**TPU(Tensor Processing Unit)**는 이와 대조적입니다.
**대기 시간을 다른 작업으로 메워 효율을 극대화(Latency Hiding)**하는 방식입니다.
**GPU**는 병렬 연산에 최적화되어 있습니다.
```

**Correct Examples**:
```markdown
**Streaming Multiprocessor(SM)** 으로 구성되어 있습니다.
**Tensor Processing Unit(TPU)** 는 이와 대조적입니다.
**대기 시간을 다른 작업으로 메워 효율을 극대화(Latency Hiding)** 하는 방식입니다.
**GPU** 는 병렬 연산에 최적화되어 있습니다.
```

**How to Check**:
- Search for pattern: `\*\*[^*]+\*\*[가-힣]` (bold text immediately followed by Korean)
- Visual inspection: Render the markdown and check if asterisks appear as literal characters

**Checkpoints**:
- [ ] No pattern like `**text(acronym)**한글` exists
- [ ] No pattern like `**text**한글` exists
- [ ] All bold markers followed by Korean text have a space
- [ ] Rendered output shows no literal asterisks

---

### 1.2 Acronym Usage

**Problem**: Using acronyms before introducing the full term confuses readers. Incorrect formatting makes terms hard to understand and breaks the reading flow.

**Rules**:
- **First use**: Always write `FullTerm(Acronym)` format
- **Subsequent use**: Only the acronym can be used
- **Bold formatting**: Bold the full term and the acronym together: `**FullTerm(Acronym)**`
- If an acronym appears in the title or summary, introduce it in the first paragraph
- For well-known acronyms (e.g., CPU, GPU, AI), you may skip the full form if it's extremely common

**Incorrect Examples**:
```markdown
SM은 GPU의 핵심 구성 요소입니다. (Acronym used before full term)
**SM(Streaming Multiprocessor)**으로 구성되어 있습니다. (Acronym is bolded)
이 글에서는 TPU에 대해 설명합니다. (TPU not introduced)
```

**Correct Examples**:
```markdown
**Streaming Multiprocessor(SM)**은 GPU의 핵심 구성 요소입니다.
이후 문장에서는 SM으로 지칭할 수 있습니다.

이 글에서는 **Tensor Processing Unit(TPU)**에 대해 설명합니다.
TPU는 구글이 개발한 AI 가속기입니다.
```

**Common Acronyms in This Blog** (must follow the rule):
- GPU, TPU, SM, CUDA, HBM, SMEM, VMEM, MXU, VPU, TCS, XLA, JAX, Pallas, Triton, VLIW, DMA, ALU, SIMD, SPMD

**Well-Known Acronyms** (may skip full form):
- CPU, AI, ML, API, URL, HTTP, HTTPS

**How to Check**:
- Search for acronyms in the document
- Verify that each acronym appears with its full term before standalone use
- Check that acronyms in title/summary are introduced in the first paragraph

**Checkpoints**:
- [ ] Acronym is presented with full term when it first appears
- [ ] Acronym does not appear before the full term
- [ ] Only the full term is bolded, not the acronym
- [ ] Acronyms in title/summary are introduced in first paragraph

---

### 1.3 Term Capitalization Consistency

**Problem**: Inconsistent capitalization of the same term throughout a document confuses readers and looks unprofessional.

**Rules**:
- Decide capitalization when a technical term first appears, then maintain it consistently throughout the document
- Acronyms should be all uppercase (e.g., GPU, TPU, SM, CUDA, HBM, SMEM)
- Common nouns should be lowercase (e.g., loop, thread, warp, core, unit, array)
- Proper nouns and brand names follow their official capitalization (e.g., NVIDIA, Google, TensorFlow, PyTorch)
- When in doubt, check official documentation or websites

**Incorrect Examples**:
```markdown
이 문서에서는 Loop와 loop를 혼용하고 있습니다.
GPU와 gpu가 섞여 있습니다.
Tensorflow와 TensorFlow가 혼용됩니다.
```

**Correct Examples**:
```markdown
이 문서에서는 loop를 사용합니다.
GPU는 Graphics Processing Unit의 약자입니다.
TensorFlow는 구글이 개발한 프레임워크입니다.
```

**Common Terms and Their Correct Capitalization**:
- **Lowercase**: loop, thread, warp, core, unit, array, buffer, memory, register
- **Uppercase (Acronyms)**: GPU, TPU, SM, CUDA, HBM, SMEM, VMEM, MXU, VPU, TCS, XLA, JAX
- **Brand Names**: NVIDIA, Google, TensorFlow, PyTorch, JAX, Pallas, Triton

**How to Check**:
- Search for variations of the same term (e.g., "Loop", "loop", "LOOP")
- Verify consistency throughout the document
- Check brand names against official sources

**Checkpoints**:
- [ ] Same term uses consistent capitalization within the document
- [ ] All acronyms are unified in uppercase
- [ ] Brand names use correct capitalization
- [ ] Common nouns are lowercase

---

## 2. Content Quality (High Priority)

These rules ensure blog posts are readable, well-structured, and technically accurate.

### 2.1 Readability

**Problem**: Long sentences and paragraphs make technical content hard to follow. Readers lose focus and miss important information.

**Rules**:

**Sentence Length**:
- A sentence should be **within 50 characters** (recommended, flexible for technical terms)
- Break complex explanations into multiple sentences
- Split long sentences connected with commas (`,`) or conjunctions (`그리고`, `또한`, `또한`)
- Use periods (`.`) more liberally to create shorter, clearer sentences
- One idea per sentence when possible

**Paragraph Length**:
- A paragraph should be approximately **5-7 sentences**
- Consider splitting if a paragraph has **10 or more sentences**
- Consider splitting if a paragraph exceeds **200 characters**
- Use blank lines to separate distinct ideas
- Each paragraph should focus on one main idea

**Incorrect Example**:
```markdown
TPU는 AI 연산에 특화된 하드웨어로, 구글이 2016년부터 개발해온 것으로, 행렬 곱셈 연산에 최적화되어 있으며, Systolic Array라는 특별한 연산 유닛을 사용하며, 이는 일반적인 CPU나 GPU와는 다른 접근 방식을 취하고 있습니다.
```

**Correct Example**:
```markdown
TPU는 AI 연산에 특화된 하드웨어입니다. 구글이 2016년부터 개발해온 TPU는 행렬 곱셈 연산에 최적화되어 있습니다.

TPU는 Systolic Array라는 특별한 연산 유닛을 사용합니다. 이는 일반적인 CPU나 GPU와는 다른 접근 방식을 취하고 있습니다.
```

**How to Check**:
- Count characters in each sentence (approximate)
- Count sentences in each paragraph
- Look for sentences with multiple commas or conjunctions
- Check for paragraphs that span multiple screen heights

**Checkpoints**:
- [ ] No sentence exceeds 50 characters (flexible for technical terms)
- [ ] No paragraph has 10 or more sentences
- [ ] No paragraph exceeds 200 characters
- [ ] Complex explanations are broken into multiple sentences
- [ ] Blank lines separate distinct ideas

---

### 2.2 Technical Writing

**Problem**: Technical content without proper explanations, context, or structure is hard to understand.

**Rules**:

**Term Definitions**:
- Briefly explain technical terms when they first appear
- Provide context: why is this term important? How does it relate to the topic?
- Follow the "Acronym Usage Rules" above for acronyms
- Use examples or analogies when helpful

**Code Examples**:
- Use code examples that actually work (test them if possible)
- Add explanations through comments in the code
- Explain complex code step by step before or after the code block
- Use appropriate language tags for syntax highlighting
- If code is pseudocode or conceptual, mention it in the text

**Diagrams and Images**:
- Use diagrams to explain complex concepts (architecture, flow, relationships)
- Add meaningful alt text that describes the content, not just "image" or "diagram"
- Use captions when helpful for context
- Name image files meaningfully (e.g., `tpu-architecture.png`, not `image1.png`)

**Structure**:
- Start with an introduction that sets context
- Use headings to organize content logically
- End with a summary or conclusion
- Use transitions between sections
- Guide readers from general to specific concepts

**Incorrect Examples**:
```markdown
SM은 GPU의 구성 요소입니다. (No explanation of what SM does or why it matters)

```python
def compute(x, y):
    return x * y
``` (No explanation of what this code does or why it's relevant)
```

**Correct Examples**:
```markdown
**Streaming Multiprocessor(SM)**은 GPU의 핵심 연산 단위입니다. 각 SM은 수백 개의 CUDA 코어를 포함하며, 독립적으로 스레드 블록을 실행합니다. 이는 GPU의 병렬 처리 능력의 기반이 됩니다.

다음 코드는 행렬 곱셈을 수행합니다:

```python
def matrix_multiply(A, B):
    """두 행렬 A와 B를 곱합니다."""
    return A @ B  # NumPy의 행렬 곱셈 연산자 사용
```

이 함수는 NumPy의 최적화된 행렬 곱셈을 사용하여 효율적으로 연산을 수행합니다.
```

**Checkpoints**:
- [ ] Technical terms are explained when first introduced
- [ ] Code examples have comments or explanations
- [ ] Images have meaningful alt text
- [ ] Content has logical structure with clear sections
- [ ] Transitions connect sections smoothly

---

## 3. Markdown Formatting (Medium Priority)

These rules ensure proper markdown rendering and consistent formatting.

### 3.1 Headings

**Rules**:
- Use H1(`#`) only for the page title (usually in frontmatter, not in body)
- Start body sections with H2(`##`)
- Use H3(`###`) for subsections
- Use H4(`####`) for sub-subsections if needed
- Do not skip heading hierarchy (e.g., do not use H4 after H2)
- Use descriptive headings that summarize the section content
- Headings should form a logical outline of the content

**Incorrect Examples**:
```markdown
# Main Title
## Section 1
#### Subsection (Skipped H3)
```

**Correct Examples**:
```markdown
## TPU Architecture
### Systolic Array
#### Data Flow
```

**Checkpoints**:
- [ ] H1 is only used for page title
- [ ] Heading hierarchy is not skipped
- [ ] Headings are descriptive
- [ ] Headings form a logical outline

---

### 3.2 Code Blocks

**Rules**:
- Code blocks must specify language tags: ` ```python`, ` ```bash`, ` ```cuda`, etc.
- Use single backticks for inline code: `` `variable_name` ``
- For file paths or commands, use inline code: `` `hugo server` ``
- Add comments in code to explain complex logic
- If code is pseudocode or conceptual, mention it in the text
- Format code properly (indentation, spacing)

**Incorrect Examples**:
```markdown
```
def hello():
    print("world")
```
(No language tag)
```

**Correct Examples**:
```python
def hello():
    """Print hello world."""
    print("world")
```

**Common Languages in This Blog**:
- `python`, `cuda`, `bash`, `c`, `go`, `fsharp`, `javascript`, `yaml`, `toml`

**Checkpoints**:
- [ ] All code blocks have language tags
- [ ] Inline code uses single backticks
- [ ] Complex code has comments or explanations
- [ ] Code is properly formatted

---

### 3.3 Images and Links

**Rules**:

**Images**:
- Always include alt text: `![descriptive alt text](path/to/image.png)`
- Alt text should describe the content, not just say "image" or "diagram"
- Use relative paths for images in the same post directory
- Use meaningful file names (e.g., `tpu-architecture.png`, not `img1.png`)
- Prefer `.webp` format for better compression

**Links**:
- Use descriptive link text: `[descriptive text](URL)`
- Avoid generic text like "click here" or "link"
- For external links, consider adding `{:target="_blank"}` if needed (Hugo-specific)
- Link to authoritative sources when possible

**Incorrect Examples**:
```markdown
![image](tpu.png)  (No descriptive alt text)
[여기](https://example.com)를 클릭하세요.  (Generic link text)
```

**Correct Examples**:
```markdown
![TPU architecture diagram showing Systolic Array](tpu-architecture.png)
[TPU 논문](https://arxiv.org/pdf/1704.04760)을 참고하세요.
```

**Checkpoints**:
- [ ] All images have descriptive alt text
- [ ] Link text is descriptive
- [ ] Image file names are meaningful
- [ ] Images use appropriate formats

---

### 3.4 Lists and Quotes

**Rules**:

**Lists**:
- Use `-` for unordered lists (consistent throughout)
- Use `1.` for ordered lists when order matters
- Maintain consistency between list items (same structure, same level of detail)
- Nested lists are recommended up to 2 levels
- Add blank lines before and after lists for readability
- Use parallel structure in list items

**Block Quotes**:
- Use `>` for block quotes
- Use quotes for important statements, definitions, or callouts
- Keep quotes concise
- Use quotes to highlight key concepts or definitions

**Incorrect Examples**:
```markdown
- Item 1
* Item 2  (Inconsistent list markers)
```

**Correct Examples**:
```markdown
- Item 1
- Item 2
  - Sub-item 2.1
  - Sub-item 2.2
```

**Checkpoints**:
- [ ] List markers are consistent
- [ ] List items have consistent structure
- [ ] Quotes are used appropriately
- [ ] Lists have proper spacing

---

## 4. Frontmatter and Metadata

**Rules**:
- All posts must have frontmatter with required fields
- `date` should be in ISO 8601 format: `'2026-01-03T17:20:16+09:00'`
- `draft: false` for published posts
- `title` should be descriptive and match the H1 heading
- `tags` should be relevant and consistent (use existing tags when possible)
- `authors` must match entries in `content/authors/`
- `summary` should be a concise one-line description
- `description` can be longer (used for SEO)
- For series posts, include `series: ["시리즈 이름"]`
- `cover` image is optional but recommended

**Required Fields**:
```yaml
---
date: '2026-01-03T17:20:16+09:00'
draft: false
title: 'Post Title'
authors: ["Author Name"]
tags: ["Tag1", "Tag2"]
categories: ["Category"]
summary: "One-line summary"
description: "Longer description for SEO"
---
```

**Optional Fields**:
```yaml
series: ["Series Name"]
cover:
  image: "path/to/image.png"
  alt: "Image description"
  caption: "Image caption"
  relative: true
comments: true
```

**Checkpoints**:
- [ ] All required frontmatter fields are present
- [ ] Date format is correct
- [ ] Authors match existing author entries
- [ ] Tags are relevant and consistent
- [ ] Summary is concise and descriptive

---

## 5. Complete Examples

### 5.1 Before and After: Acronym and Bold Rendering

**Before (Incorrect)**:
```markdown
SM은 GPU의 핵심 구성 요소입니다. **SM(Streaming Multiprocessor)**으로 구성되어 있으며, 각 SM은 수백 개의 CUDA 코어를 포함합니다.
```

**After (Correct)**:
```markdown
**Streaming Multiprocessor(SM)**은 GPU의 핵심 구성 요소입니다. GPU는 수백 개의 SM 으로 구성되어 있으며, 각 SM은 수백 개의 CUDA 코어를 포함합니다.
```

### 5.2 Before and After: Readability

**Before (Incorrect)**:
```markdown
TPU는 AI 연산에 특화된 하드웨어로, 구글이 2016년부터 개발해온 것으로, 행렬 곱셈 연산에 최적화되어 있으며, Systolic Array라는 특별한 연산 유닛을 사용하며, 이는 일반적인 CPU나 GPU와는 다른 접근 방식을 취하고 있습니다.
```

**After (Correct)**:
```markdown
TPU는 AI 연산에 특화된 하드웨어입니다. 구글이 2016년부터 개발해온 TPU는 행렬 곱셈 연산에 최적화되어 있습니다.

TPU는 Systolic Array라는 특별한 연산 유닛을 사용합니다. 이는 일반적인 CPU나 GPU와는 다른 접근 방식을 취하고 있습니다.
```

---

## 6. Review Checklist

When reviewing a blog post, check the following items in order of priority:

### Critical (Must Fix)
- [ ] **Bold rendering**: No `**text**한글` patterns without spaces
- [ ] **Acronyms**: All acronyms introduced with full terms first
- [ ] **Capitalization**: Consistent capitalization throughout

### High Priority
- [ ] **Readability**: Sentences within 50 characters, paragraphs within 10 sentences
- [ ] **Technical terms**: All technical terms explained when first introduced
- [ ] **Code examples**: All code blocks have language tags and explanations
- [ ] **Images**: All images have descriptive alt text

### Medium Priority
- [ ] **Headings**: Proper hierarchy (H2 → H3 → H4, no skipping)
- [ ] **Links**: Descriptive link text
- [ ] **Lists**: Consistent formatting
- [ ] **Frontmatter**: All required fields present and correct

### Additional Checks
- [ ] Content flows logically with clear transitions
- [ ] No typos or grammatical errors
- [ ] Examples are accurate and tested (if applicable)
- [ ] Images are properly placed and referenced

---

## Notes for Reviewers

- **Severity Levels**: 
  - **Critical**: Causes rendering issues or major readability problems
  - **High**: Significantly impacts readability or understanding
  - **Medium**: Formatting or consistency issues

- **Be Constructive**: When pointing out issues, suggest specific fixes
- **Context Matters**: Some rules may be flexible for technical content (e.g., longer sentences for complex explanations)
- **Consistency First**: If a pattern is used consistently throughout a post, it may be acceptable even if not ideal

---

## Common Patterns in This Blog

Based on existing posts, here are common patterns to follow:

- **Series Posts**: Use series tag for series like `series: ["지피지기면 백전불태"]`
- **Code Languages**: Python, CUDA, Bash, C, Go, F# are commonly used
- **Image Formats**: `.webp`, `.png`, `.jpg` are used
- **Technical Terms**: GPU, TPU, SM, CUDA, HBM, Systolic Array, Tensor Core, etc.
