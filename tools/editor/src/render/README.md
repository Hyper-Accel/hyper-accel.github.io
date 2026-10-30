# On-site renderer (lane R)

`createRenderer(options?).render(bundleLanguage)` implements the shared synchronous
`Renderer` contract in a browser DOM. It returns a sanitized `.post-content` wrapper
and ordered source entries. Each direct child has `data-block-id="<ID>"`; use that
attribute to locate it, since heading IDs retain Hugo's heading anchors. Entry `text`
is exactly that child's `textContent`, including UTF-16 surrogate pairs and KaTeX's
accessible text. A compound block's nested elements share the containing block.

Options:

- `resolveImage(src, language)` maps bundle paths to pending Blob URLs or hosted URLs.
- `imageSize(src)` supplies raster dimensions when available (Hugo emits dimensions
  from its image resources). SVG fixtures have no width/height attributes.
- `resolveRef(ref, language)` supplies repository-aware Hugo `ref` resolution, including
  aliases or explicit language arguments. The default resolves canonical post paths
  against this site's base URL and the current language.
- `serializedMarkdown(language)` returns C's actual serialized Markdown for exact full-file
  line numbers after metadata edits. Without it, line numbers use the language's YAML
  baseline and canonical marker/blank-line layout. Refresh this callback's source
  together with the rendered snapshot; do not pair a new document with old source.

`mountPreview(iframe, result, {cssText, cssUrls, baseUrl, language})` sets
`sandbox="allow-scripts"` (never `allow-same-origin`) and assigns `srcdoc`. Supply the
site's compiled CSS, plus KaTeX CSS, as text and/or HTTP(S) stylesheet URLs. `baseUrl`
is the absolute bundle permalink, so legacy `figure`/raw HTML relative URLs resolve
as on the site. Pending images need `resolveImage` on the renderer. No session,
token, or authorization headers belong in these options.

The frame adds its own nonce-authorized selection/tab/compare code only after
sanitizing Markdown/raw HTML. It blocks navigation on article links. The CSP denies
connections, forms, arbitrary scripts and frames; images/styles/fonts can load.

Handle a parent `message` with `readSelectionMessage(event, iframe)`. It returns
`null` unless the source is that frame, the origin is opaque (`"null"`), and the
strict extended shared schema validates. The returned message contains block IDs,
inclusive/exclusive UTF-16 offsets, a quote joined between blocks by `\n`, and
`rects: {x,y,width,height}[]` in **iframe viewport coordinates**. Add the iframe's
parent-page bounding rectangle when placing a parent overlay.

`bun test src/render` bundles the renderer into real Chromium. It tests source
mapping, sanitization, literal code, math, opaque-origin selection and message
validation, then builds shared fixtures with Hugo in a fresh OS temporary site.
It uses the repository's templates/assets/theme, never repository `content/`.
The parity comparison preserves elements/classes/attributes and meaningful text,
normalizing only attribute order, comments, inter-tag whitespace, renderer anchor
attributes and Hugo's trusted interaction script asset. Hugo's math is hydrated
with the same auto-render configuration before comparison. Missing lane D templates
produce an explicit failure listing the paths, never a skipped parity check.
The same test drives tabs and compare controls at 390/1440 widths, checks overflow,
and saves screenshots under a reported OS temporary directory.

Site math currently references KaTeX 0.16.25 in `layouts/partials/math.html`; the
installed package follows the existing `^0.16.22` range. H/D should keep the site's
CDN runtime/CSS and the editor's bundled KaTeX version aligned.
