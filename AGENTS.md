# PROJECT KNOWLEDGE BASE

**Generated:** 2026-08-18
**Commit:** 3400aa3
**Branch:** main

## OVERVIEW
HyperAccel tech blog. Hugo 0.152.2 extended + PaperMod theme (git submodule). Bilingual: Korean (default, root URLs) + English (`/en/` prefix). Deployed to GitHub Pages on push to `main`.

## STRUCTURE
```
./
├── hugo.yaml                  # Single config file (no config/ dir)
├── content/
│   ├── posts/                 # Page bundles; see content/posts/AGENTS.md
│   ├── authors/               # 10 author profiles: authors/<Full Name>/_index.md
│   └── about/                 # index.md + index.en.md
├── layouts/                   # PaperMod overrides ONLY (7 custom files)
│   ├── _default/{list,single}.html
│   ├── partials/{author_info,post_meta,extend_head,comments}.html
│   └── posts/giscus.html
├── assets/css/extended/custom.css   # Custom CSS (author boxes, post grid)
├── archetypes/posts.md        # Post template = authoring guide (read it)
├── i18n/{ko,en}.yaml          # UI translation strings
└── themes/PaperMod/           # SUBMODULE - never edit directly
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Write/edit post | `content/posts/<slug>/` | See content/posts/AGENTS.md |
| New author | `content/authors/<Full Name>/_index.md` | Name must match `authors:` field in posts exactly |
| Template change | `layouts/` | Copy from themes/PaperMod first, then modify the copy |
| Styling | `assets/css/extended/custom.css` | Never touch theme CSS |
| Site config, Giscus, analytics | `hugo.yaml` | Taxonomies: tags, categories, authors, series |
| UI strings | `i18n/ko.yaml`, `i18n/en.yaml` | |
| Writing style rules | `STYLEGUIDE.md` | Summary in content/posts/AGENTS.md; enforced by reviewers/agents, no bot |
| Draft/co-author a post | `.claude/skills/tech-blog-coauthoring/SKILL.md` | Korean-first authoring loop; read and follow it |
| Review a post locally | `.claude/skills/well-writing/SKILL.md` | Editor-style review vs STYLEGUIDE.md; quick list in references/checklist.md |

## CONVENTIONS
- Custom taxonomies beyond stock PaperMod: `authors` (profile pages) and `series` (+ `series_idx`).
- `layouts/` holds only intentional overrides; everything else falls through to the submodule.
- Math via MathJax and Naver site verification are wired in `layouts/partials/extend_head.html`.
- Comments: Giscus (GitHub Discussions), toggled per post with `comments:` front matter.

## ANTI-PATTERNS (THIS PROJECT)
- NEVER edit `themes/PaperMod/` (submodule) - override in `layouts/` instead.
- NEVER commit or edit `/public/` or `/resources/_gen/` (generated; git-ignored).
- NEVER commit files >1MB - CI (`check-large-files.yml`) and pre-commit reject them. Compress images (webp preferred).
- NEVER merge a PR containing `draft: true` posts - CI (`check-post-drafts.yml`) blocks it.

## COMMANDS
```bash
hugo server                    # dev at http://localhost:1313
hugo --minify                  # production build to ./public/
git submodule update --init    # after fresh clone (theme is a submodule)
```

## NOTES
- Deploy: `.github/workflows/hugo.yml` builds (Hugo 0.152.2 + Dart Sass, recursive checkout) and publishes to GitHub Pages on `main`. No manual deploy step.
- No package.json/Makefile; pure Hugo. `npm ci` in CI is a dormant fallback.
