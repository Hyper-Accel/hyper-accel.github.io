---
name: well-writing
description: Review and edit existing markdown blog posts for the HyperAccel technical blog. Use this skill whenever the user wants a post reviewed, polished, checked before publishing, validated for style guide compliance, checked for factual risk, or pressure-tested for ambiguous, contentious, or overly strong claims. This skill is for improving an existing draft, not co-authoring from scratch.
---

# Well-Writing

This skill reviews an existing HyperAccel blog draft like a strong technical editor. Its job is to catch true publishing blockers, improve clarity where it matters, and surface factual or framing risks without turning every stylistic preference into a hard rule.

**Feedback Loop**: Use with `tech-blog-coauthoring`: write → review (`well-writing`) → revise (`tech-blog-coauthoring`) → re-review (`well-writing`).

## Review Posture

- Review the draft as something that should become publishable, not as something to mechanically lint.
- Keep objective violations strict. Keep judgment calls flexible.
- Prefer reviewer language like “this is hard to follow,” “this likely needs evidence,” or “this framing may be too strong” over robotic pass/fail phrasing.
- Do not invent facts. If a statement might be wrong or outdated, flag it and ask for verification.

---

## When to Use This Skill

Use this skill when the user says things like:

- "review this post"
- "check this draft before publishing"
- "polish this blog post"
- "validate the markdown/frontmatter"
- "look for inaccuracies or risky claims"
- "check whether anything here is controversial or overstated"

If the draft does not exist yet and the user needs help creating structure or content, use `tech-blog-coauthoring` first.

---

## Stage 0: Load Context

Before reviewing:

1. Read the target markdown file(s).
2. Read `.gemini/styleguide.md`.
3. Read `README.md` and `archetypes/posts.md` when reviewing publish readiness, frontmatter, multilingual pairing, author metadata, series fields, cover images, or SEO fields.
4. If helpful, sample a few similar posts by the same author or in the same series to understand the intended tone and metadata pattern.

Before giving feedback, establish the review scope:

- target file path(s)
- language pair expectation (`index.md` or `index.ko.md` plus `index.en.md` for new posts)
- whether the post is draft-only or intended to publish now
- author identity and whether the author profile exists
- whether the post belongs to a series

Ask which file(s) to review if the user has not specified them.

---

## Stage 1: Publishing Preflight

Separate true publishing blockers from house-style conformance. This prevents the review from treating every preference as equally urgent.

### Preflight Blockers

These should usually block publication until resolved:

- broken frontmatter or markdown that is likely to fail rendering
- missing required metadata for this repo: `date`, `draft`, `title`, `authors`, `tags`, `categories`, or `summary`
- unknown `authors` values that do not appear to match `content/authors/<author_id>/`
- missing multilingual pair for a new publish-ready post, or paired files that do not share the same slug
- placeholder metadata such as `<text>`, `<image path/url>`, empty `authors`, empty `tags`, empty `categories`, or empty `summary`
- unresolved factual, legal, reputational, or contentious claims that are too risky to publish without verification

### House-Style Conformance

These are important, but severity depends on impact and frequency.

#### Rendering and Markdown Integrity

- Check for bold text immediately followed by Korean text, such as `**GPU**는`.
- Verify that markdown structure is valid enough to render cleanly.
- Check heading hierarchy for obvious structural breaks.
- Check that code blocks have language tags.

#### Terminology and Consistency

- Check whether important acronyms are introduced before shorthand use.
- Check whether capitalization is internally consistent for product names, acronyms, and key technical terms.
- Flag obviously inconsistent naming such as `Tensorflow` vs `TensorFlow`, `gpu` vs `GPU`, or mixed names for the same component.

#### Frontmatter and Basic Metadata

- Verify that required frontmatter fields are present for this repo’s conventions.
- At minimum, check `date`, `draft`, `title`, `authors`, `tags`, `categories`, and `summary`.
- In most publish-ready posts, also check whether `description` is present and useful.
- For SEO-sensitive posts, check whether `keywords`, `lastmod`, `canonicalURL`, `locale`, or `robotsNoIndex` are intentionally present or absent. Do not require them for every post.
- Check that `authors` aligns with known author entries.
- Check whether `summary`, `description`, series fields, comments, and cover metadata look incomplete or inconsistent with the post’s purpose.
- For series posts, check whether `series` and `series_idx` are present and coherent.
- For multilingual posts, check whether the paired file appears to preserve the same slug, author identity, `draft` intent, taxonomy intent, and series ordering.
- For localized series, allow language-specific `series` names, but require coherent `series_idx` ordering across languages.
- For page-bundle cover images, warn when a local cover file appears to use `relative: false`; this can affect social image URLs. Treat it as a warning unless rendering or social metadata is known to be broken.

If an issue in this section is objective, present it as a must-fix item.

---

## Stage 2: Editorial Quality Review

These are important, but they require judgment. Do not reduce them to rigid numeric quotas.

### Clarity and Readability

Flag sentences or paragraphs when they are:

- carrying too many ideas at once
- overloaded with clauses or parentheticals
- harder to follow than the underlying idea requires
- repetitive, especially when the same point is explained twice with little added value

Recommend cleaner structure, but do not treat every long sentence as an error.

### Structure and Flow

Check whether the post:

- establishes context early enough
- moves in a logical order
- provides enough transitions between sections
- lands its conclusion or takeaway clearly

Flag places where the reader has to do too much inferential work to connect sections.

### Technical Communication

Check whether:

- technical terms are explained enough for the target audience
- code examples are understandable and relevant
- diagrams, images, and links actually support comprehension
- the draft assumes knowledge the intended reader may not have

Prefer comments like “this may need one sentence of context” over blanket rewrite mandates.

---

## Stage 3: Accuracy and Claim Review

This section is mandatory for technical blog review.

### What to Look For

Flag statements that appear to be:

- unsupported by the surrounding evidence or examples
- technically suspicious or likely inaccurate
- too broad for what the draft has actually established
- sensitive to time, version, benchmark setup, market conditions, or vendor announcements
- contentious because they imply strong comparisons, dismiss alternatives, or make strategic claims without qualification

### How to Comment Safely

When uncertain, do not “fix” the claim by inventing a safer fact. Instead, use wording like:

- “This claim may need a source or example.”
- “This sounds broader than the evidence shown here.”
- “This may be outdated as of publication time; please verify.”
- “This framing could be contentious; consider adding scope, attribution, or caveats.”
- “This sentence reads as confident fact, but I’m not sure the draft has established it.”

### Confidence Levels for Review Comments

Distinguish your level of concern:

- **Needs evidence**: plausible, but unsupported in the draft as written
- **May be outdated**: version-, vendor-, benchmark-, or time-sensitive
- **Likely wrong or misleading**: technically suspicious, overgeneralized, or materially stronger than the evidence shown

Absence of an obvious problem is not proof that a claim is correct. If you cannot verify it from the draft or supplied context, say so.

### Verification Queue

For every unresolved factual or contentious claim, create a verification item with:

- location
- claim text or short paraphrase
- risk type: factual, benchmark, vendor/product, legal, reputational, historical, security, or market claim
- confidence level: **Needs evidence**, **May be outdated**, or **Likely wrong or misleading**
- required next action: add source, qualify wording, ask a subject-matter expert, remove claim, or hold for human/legal review

### Typical Risk Areas

- benchmark or performance claims without setup details
- product or market comparisons stated as settled fact
- causal claims (“X caused Y”) without support
- historical narratives that compress nuance
- security, standards, or vendor-behavior claims that may be disputed

The reviewer’s role is to **surface factual risk**, not to pretend certainty where none exists.

---

## Stage 4: Images, Links, and Supporting Material

Review whether supporting material helps the post rather than merely existing.

- Are images referenced correctly?
- Does alt text describe what matters?
- Is image placement helpful for comprehension?
- Are links descriptive and pointed at credible sources?
- If a diagram or screenshot is doing critical explanatory work, does the prose explain what the reader should notice?

Do not enforce a single image-placement doctrine. Flag only when placement or labeling hurts understanding.

---

## Stage 5: Rendered Output Smoke Check

Raw markdown review is not enough for publish-ready posts. If the post is intended to publish, verify the rendered page when the local environment supports it.

Keep responsibilities separate:

- Review content, factual claims, controversial framing, frontmatter, taxonomy, links, image references, and multilingual consistency from the codebase files.
- Use Playwright only for rendered-page failures that are hard to prove from source alone: markdown artifacts, broken generated pages, missing rendered images/assets, console errors, failed network requests, layout evidence, and social metadata output.
- Do not use Playwright screenshots or DOM snapshots as the primary way to review prose quality or claim accuracy; that wastes tokens and loses source-level precision.

### Local Build Check

Run a Hugo build before browser review when practical:

```bash
hugo --gc --minify
```

If the post is still a draft, use draft-aware preview:

```bash
hugo server -D --disableFastRender
```

Treat build failures, missing templates, or render errors as **Critical**.

### Playwright CLI Smoke Check

Prefer Playwright CLI over Playwright/browser MCP for rendered article checks. MCP browser snapshots can dump large page structures into the conversation and waste tokens; CLI scripts can keep evidence compact by returning only pass/fail summaries and writing screenshots or reports to files.

Do not assume the project has Playwright installed as a local dependency. First check CLI availability:

```bash
npx --no-install playwright --version
```

If that command fails and a final pre-publish rendered check is needed, install Playwright as project-local dev tooling rather than falling back to MCP:

```bash
npm install --save-dev playwright
npx playwright install chromium
```

If the repo did not previously have `package.json` or a lockfile, note that this creates Node tooling files and include them in the review/PR context. Do not install Playwright globally. Do not use MCP as the default fallback; use MCP only for an emergency one-off visual check when CLI installation is impossible and the user accepts the token cost.

Keep CLI output concise. Prefer a small script or `npx playwright test` run that prints a compact summary and stores artifacts on disk instead of streaming full DOM snapshots into chat.

Recommended execution sequence:

1. Start a local preview server from the repo root:

   ```bash
   hugo server -D --disableFastRender --bind 127.0.0.1 --port 1313
   ```

2. Use a Playwright CLI script or test to open the expected post URL, for example `http://127.0.0.1:1313/posts/<slug>/` or the language-specific URL used by the repo.
3. In the script, assert only enough title/headings/text to confirm the correct page loaded, then check rendering-specific conditions without printing the full DOM.
4. Collect console errors and failed network requests in the script, then print only concise failures.
5. Save a full-page screenshot to an artifact file when layout, image placement, typography, or markdown rendering is visually uncertain.
6. Record the exact rendered URL, command used, artifact paths, and whether the check passed, failed, or was not run.

Minimum checks:

- the page loads with the expected title and language URL
- no visible literal markdown artifacts such as stray `**`, broken code fences, or raw shortcode text
- Korean text immediately after bold text renders cleanly without visible asterisks
- images render without 404s, including cover images and body images
- heading hierarchy produces a sensible visible outline and table of contents
- code blocks are rendered as code blocks with language styling where expected
- KaTeX/math content renders if the post uses math
- browser console has no relevant errors
- network panel has no failed page assets that affect the article
- Open Graph/Twitter metadata has the expected title, description, locale, and image when the post is publish-ready

Useful Playwright CLI operations:

- locate headings and article text with role/text locators rather than dumping snapshots
- listen for `console` events and report only errors
- listen for failed requests or non-2xx image responses and report only failing URLs
- save screenshots, traces, or HTML reports as files and summarize their paths

Do not require Playwright for every early draft. For early editorial review, note that rendered preview was not run. For final pre-publish review, missing rendered verification should appear in the handoff as a remaining check.

---

## Delivering Feedback

Organize review comments by severity.

Start with a publish-readiness decision:

- **Blocked**: do not publish until must-fix items or verification items are resolved
- **Publishable with revisions**: no hard blocker, but high-value revisions should be made before merge
- **Polish only**: only medium or lower issues remain

### Severity Model

- **Critical**: likely publishing blocker; rendering bug, missing required metadata, a claim that is likely false or materially misleading as written, or a statement too risky to publish without verification
- **High**: significantly hurts comprehension, accuracy, or reader trust
- **Medium**: worthwhile polish, consistency, or structure improvement

### Feedback Style

For each issue:

1. Point to the exact location if possible.
2. State what the problem is in plain language.
3. Explain why it matters for the reader or for correctness.
4. Suggest a concrete revision direction.

Prefer this style:

- “This paragraph is doing two jobs at once; consider splitting background from the main claim.”
- “The comparison is interesting, but it currently reads stronger than the evidence shown.”
- “This term is technically correct, but the reader may need one sentence of explanation here.”

Avoid this style:

- “Sentence too long.”
- “Paragraph exceeds guideline.”
- “Move image above paragraph” unless placement is actually hurting comprehension.

---

## Reviewer Guardrails

- Do not over-enforce stylistic preferences when the draft is already clear.
- Do not convert flexible guidance from `.gemini/styleguide.md` into hard blockers unless the issue is truly objective.
- Do not silently normalize a claim you suspect is wrong; flag it.
- Do not rewrite highly technical claims beyond your confidence. Ask for validation when needed.
- Do not confuse “I would write this differently” with “this will confuse or mislead the reader.”

---

## Final Handoff

After review, use this structure:

1. **Publish-readiness verdict**: blocked, publishable with revisions, or polish only.
2. **Must fix before publish**: blockers with exact locations and concrete revision direction.
3. **Claims requiring verification**: unresolved verification queue from Stage 3.
4. **Rendered preview status**: build/browser check passed, failed, or not run, with reason.
5. **High-value revisions**: structural, clarity, or trust improvements that are not strict blockers.
6. **Optional polish**: low-risk style or consistency suggestions.
7. **Suggested next pass**: return to `tech-blog-coauthoring` for structural rewrites, or re-run `well-writing` after substantial edits. If only small line edits were made, a spot-check is enough.

Keep the handoff short enough for an author to act on. A publisher-style review should route decisions clearly, not bury the author in every possible preference.
