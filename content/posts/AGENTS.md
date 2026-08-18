# content/posts - AUTHORING GUIDE

## OVERVIEW
Each post = one page bundle: `content/posts/<kebab-case-slug>/` with per-language markdown + co-located images. Full field reference: `archetypes/posts.md`.

## FILES PER POST
```
<slug>/
├── index.md        # or index.ko.md - Korean (default lang)
├── index.en.md     # English translation (linked automatically by slug)
└── *.webp|png|jpg  # images in root, or images/ subdir when 15+
```
Bilingual (ko+en) is the norm (~40 posts); some are single-language.

## FRONT MATTER
Required: `date` (ISO 8601 +09:00), `title`, `draft`, `authors`, `comments`, `cover` (`image`, `alt`, `relative: true` for bundled images).
Optional: `tags`, `categories`, `series` + `series_idx` (1-based), `summary`, `description`, `keywords`.

## CONVENTIONS
- `authors: [Full Name]` must exactly match a directory under `content/authors/`.
- Image refs are relative to the bundle (`cover.png`, `images/foo.jpg`); descriptive kebab-case names.
- Prefer webp; every image must stay under 1MB (CI rejects larger).
- mp4 embeds are allowed (see TPU-deep-dive).

## WRITING RULES (full spec: `STYLEGUIDE.md` at repo root)
- **Bold + Korean particle**: `**GPU**는` breaks rendering. Always space after `**`: `**GPU** 는`. Check with regex `\*\*[^*]+\*\*[가-힣]`.
- **Acronyms**: first use = `FullTerm(Acronym)` (e.g. `**Streaming Multiprocessor(SM)**`), acronym-only afterward. Never acronym before full term. CPU/AI/ML/API may skip full form.
- **Capitalization**: pick once, keep consistent. Acronyms uppercase (GPU, HBM, XLA); common nouns lowercase (loop, thread, warp); brands official (NVIDIA, TensorFlow, PyTorch).
- **Headings**: body starts at H2 (`##`); never skip levels (H2→H3→H4); H1 reserved for the title.
- **Code blocks**: always tag language (```python, ```bash, ```cuda...); explain code before/after; mark pseudocode as such.
- **Images**: descriptive alt text (not "image"); place image BEFORE the paragraph explaining it; meaningful kebab-case filenames.
- **Readability**: short sentences (~50 chars), 5-7 sentences per paragraph, one idea each; define technical terms on first appearance.
- **New posts must ship both ko + en versions** (README mandate); same slug so Hugo links translations.

## ANTI-PATTERNS
- No `draft: true` in merged PRs - CI blocks the merge.
- No external hotlinked cover images unless `relative: false` is set deliberately.
- No author names in front matter that lack a profile directory (breaks author_info partial).
- New authors need both `_index.md` and `_index.en.md` under `content/authors/<Name>/`.
