# Editor CI

Run from the repository root:

```sh
bun test tools/editor/ci
bun tools/editor/ci/validate-posts.ts --all
bun tools/editor/node_modules/typescript/bin/tsc --noEmit -p tools/editor/ci/tsconfig.json
```

Without `--all`, only changed bundles are inspected. Changes are determined by
`git diff --no-renames BASE...HEAD`, including deleted translations and changed
images. `--base` / `--head` override `BASE_SHA` / `HEAD_SHA`; defaults are
`origin/main` / `HEAD`. Missing history fails closed. Entirely deleted bundles
are ignored. Uncommitted edits are not part of the PR diff.

`--all` also inspects untouched bundles, with report-only GitHub warnings.
Changed bundles emit errors and fail. `--all --strict` deliberately enforces
every bundle, useful for fixtures and content migrations.

`--check ko-en` covers translations, titles, bodies, block sequences, drafts,
and referenced images. `--check authors` and `--check category` select the
other gates. The seven English category terms follow README and the authoring
guide; Korean category page titles are localized display labels, not terms.
Author names are compared against directory entries, including exact case.

Images include Markdown inline/reference images, HTML `img`, Hugo `figure`,
cover images, and the front matter `images` array. References must resolve
inside the bundle, including after resolving symlinks. URL fragments and
queries are stripped; percent escapes are decoded. Images may be at most
1,048,576 bytes. External images are rejected for changed posts.

`fixtures/passing/` is a complete bundle. `fixtures/failing.json` describes
independent mutations to it, including an oversized image allocated only in a
temporary sandbox. Tests run the real CLI and verify failure codes and exit
status. No large fixture files or test commits are created.

Required ruleset checks:

- `editor/ko-en`
- `editor/authors`
- `editor/category`
- `editor/hugo`

Workflows use read-only repository permissions, recursive submodules for
Hugo, and Hugo 0.152.2 extended. The hosted build currently produces
`tools/editor/dist-site/editor/`; both build workflows copy its contents to
`public/editor/` after Hugo, before uploading the Pages artifact.

Lane H owns `package.json`. To include these checks in its existing script
without removing its checks/build, use this exact entry:

```json
"ci:dry-run": "bun run check && bun run build:site && bun test ci && bun ci/validate-posts.ts --root ../.. --all"
```
