# HyperAccel Blog Editor Design

## 0. Research Log

- The published surface is Hugo PaperMod. The editor must reuse PaperMod's content width,
  typography rhythm, heading scale, image treatment, code blocks, and theme variables.
- The interaction reference is a native web-post editor: one readable canvas, a restrained
  formatting bar, in-place title editing, paste-at-caret images, and visible save state.
- Notion informs the editor chrome only: warm neutral controls, whisper borders, and a single
  blue interaction color. It does not replace the PaperMod article surface.

## 1. Product Brief

A local-only desktop editor for contributors who want the writing and reading surfaces to feel
identical. The primary persona writes long Korean technical articles and frequently pastes
diagrams from the clipboard. The editor must get out of the way and preserve Hugo source.

Design dials: variance 4, motion 2, density 4. The product is editorial and trust-first.

## 2. Tokens

### Color

- Canvas: `#f7f7f6`
- Paper: `#ffffff`
- Primary text: `#1d1d1f`
- Secondary text: `#6b6b6b`
- Subtle text: `#9a9a97`
- Border: `#e7e7e4`
- Soft surface: `#f1f1ef`
- Accent: `#2563eb`
- Accent hover: `#1d4ed8`
- Accent soft: `#eff6ff`
- Success: `#16803a`
- Warning: `#9a6700`
- Danger: `#b42318`
- Code surface: `#272822`
- Focus ring: `#2563eb`

### Typography

- UI font: system sans, with Apple SD Gothic Neo and Noto Sans KR fallbacks.
- Article font: PaperMod system sans stack.
- UI label: 13px/1.4, weight 600.
- Article body: PaperMod 18px/1.6, weight 400.
- Post title: 40px/1.25, weight 700.
- H1/H2/H3: PaperMod 40/32/24px scale.

### Space and Shape

- Base unit: 4px.
- Editor article width: PaperMod `--main-width` of 1024px when the viewport has room. The
  persistent rail can reduce the available canvas at narrower desktop widths without changing
  typography.
- Sidebar width: 320px.
- Toolbar height: 52px.
- Controls: 6px radius; panels: 12px radius; status pills: full radius.
- Shadows are reserved for the floating toolbar and dialogs.

## 3. Layout

- Desktop: 320px post/agent rail + fluid main surface.
- Main: sticky command bar above a centered white article canvas.
- At 980px and below: the rail becomes an off-canvas drawer; article margins reduce to 24px.
- Below 640px is supported for recovery, not optimized as the primary authoring mode.
- The writing surface owns vertical scrolling. No nested content scrollbar.
- The agent tab keeps the conversation and local tool activity in the left rail. Agent work never
  replaces or directly mutates the current article surface.
- Merge review uses two PaperMod-rendered columns: the current article on the left and the agent
  proposal on the right. The center controls point toward the selected side.
- Korean paragraphs, list items, captions, summaries, and headings use `word-break: keep-all`
  with `overflow-wrap: break-word`, matching the published site.

## 4. Article Surface

- The title is editable in place and visually matches `.post-title`.
- The body is TipTap but carries PaperMod `.post-content` rules.
- Selected images show one blue outline. Shortcodes render as protected, non-editable blocks.
- The canvas remains white; editor-only controls live outside article typography.

## 5. Primitives and States

- Icon button: rest, hover, active-format, focus-visible, disabled.
- Save button: clean, dirty, saving, saved, error.
- Post row: rest, hover, selected, draft.
- Search input: rest, focus, no-results.
- Article canvas: loading skeleton, ready, dirty, save conflict, build error.
- Image block: uploading placeholder, ready, failed with retry/removal affordance.
- Toast: success or error, announced through an ARIA live region.
- Agent selector: available, unavailable, loading, and selected.
- Agent conversation: empty guidance, user request, assistant response, tool activity, running,
  cancelled, failed, and proposal-ready.
- Merge hunk: current selected, proposal selected, equal, insertion, deletion, and empty.
- Merge action: keep all current content, accept all proposed content, apply selected content,
  and close without applying.

## 6. Motion

- 120ms color and border transitions only where they communicate state.
- No decorative animation.
- Loading uses a static skeleton under `prefers-reduced-motion`.

## 7. Responsive Behavior

- 1280px: persistent rail, the widest article that remaining space allows, and toolbar labels
  where useful. At wider desktop sizes the article reaches PaperMod's 1024px main width.
- 768px: 320px drawer rail, icon-first toolbar with horizontal overflow, 24px canvas padding.
- 640px and below: merge columns stack as current content, direction controls, then proposed
  content. Each direction control includes a visible text label.
- Pasted images fill the article column like the published site's `.article-image-link`, use
  `max-width: 100%`, and preserve intrinsic ratio.

## 8. Accessibility Constraints and Accepted Debt

- Every command is a real button with an accessible label and visible focus ring.
- `Ctrl/Cmd+S` saves; undo/redo and formatting use native TipTap shortcuts.
- Toolbar uses `aria-pressed` for toggle formats.
- Save and upload status are announced through `aria-live="polite"`.
- Errors remain visible until resolved; color is never the only signal.
- Images receive editable alt text after insertion.
- Merge direction controls expose their selected state with `aria-pressed`, icon direction, text,
  and color.
- Accepted MVP debt: no screen-reader-specific drag handle and no mobile-first toolbar reflow.
