# Shared bilingual fixtures

Import `fixtureBundles` from `./index` for boundary-validated `PostBundle` objects.
Each bundle also has real `index.md`, `index.en.md`, and local SVG image files so
Hugo and the JS renderer can consume identical input without network image fetches.

| Fixture | Coverage |
| --- | --- |
| `image-layouts` | body/wide/side-right/side alias/side-left images, captions, pair |
| `interactive-blocks` | steps, compare, tabs with code, all five GitHub alert types |
| `math-and-legacy` | inline/display math, fenced code, ref, figure, rawhtml |
| `legacy-no-ids` | paired raw Markdown without markers, custom YAML and comment |

The first three contain `bundle.json` with expected block boundaries, common IDs and
snapshot hashes. The fourth deliberately has no parsed bundle: C must migrate IDs
without discarding metadata or shortcode source. None of these posts are deployed.

Pending images use `Blob` and cannot live in JSON; `contracts.test.ts` constructs one
and verifies that structured clone preserves its bytes with the cursor. A should
reuse these bundles in actual IndexedDB restore tests with `fake-indexeddb`.
The fixtures use synthetic author/category names; G's publication fixtures must
substitute valid repository taxonomy values before testing positive publication.
