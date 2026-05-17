# Pierre components spike — `@pierre/trees` + `@pierre/diffs`

Project: md-collab
Date: 2026-05-16
Status: Concluded
Parent: `host-platform-reevaluation-2026-05-16.md` § Reusable components discovered
Subject: Pierre Computer Company UI components, evaluated as candidates for inclusion in a hypothetical option-C native md-collab client (Tauri or SwiftUI+WKWebView, with web-tech editor pane)
Spike location: `/Users/spencer/Workspaces/pierre-spike/` (outside main repo)

## Purpose

The May 2026 host platform re-evaluation surfaced two reusable web components from the Pierre Computer Company monorepo (`pierrecomputer/pierre`) that could materially shorten the build of a native md-collab client. This spike validated both components on real md-collab data to convert "promising on paper" into a grounded engineering verdict.

Questions answered:
1. Do these components install and render cleanly without surprise dependencies?
2. Does `@pierre/trees` look and feel production-grade vs. building from scratch?
3. Does `@pierre/diffs` actually provide the accept/reject UX its marketing suggests, or just the rendering substrate?
4. What are the concrete integration frictions a future md-collab client author needs to know?
5. What time does using these save vs. building from scratch?

## Setup

- Throwaway dir: `~/Workspaces/pierre-spike/` (not touching md-collab repo)
- Stack: `bun` + `vite` + vanilla JS (not React) — minimum viable to test the components
- Real data:
  - File tree seeded with 106 `.md` paths from `find ~/Workspaces/md-collab -name "*.md" -not -path "*/node_modules/*"`
  - Diff data: synthetic `proposed_edit` derived from the actual `PRD.md` § 1 (Executive summary), shaped to match `comments-sidecar.schema.json` `suggestions[].proposed_edit`
- Versions installed: `@pierre/trees@^1.0.0-beta.3`, `@pierre/diffs@^1.1.22`, `shiki@^1.22.0`
- Install: `bun install` resolved 77 packages in 4.3s, zero warnings, zero runtime errors
- Build: 10MB unminified, **1.8MB gzipped** — almost entirely Shiki grammars

## `@pierre/trees` — production-grade ✅

Genuinely high-quality component.

**What works out of the box**
- **Virtualization**: ~37 rows in DOM at any time regardless of total path count
- **Keyboard accessibility**: `role="treeitem"`, `aria-level`, `aria-expanded` correctly set
- **Built-in icon set** with semantic file-type colors
- **Expand/collapse with chevrons** + folder flattening (`flattenEmptyDirectories: true` collapsed `.ai/research/docs/recommendations/...` cleanly)
- **Snappy search input** baked in, opens via `tree.openSearch()` or built-in input
- **Comfortable ~30px row density**
- **Shadow DOM isolation** — no global CSS conflicts
- **Mutation API** matches md-collab's data shape: `paths: string[]` constructor + `add/remove/move/resetPaths` methods
- **Git status lane** available via `tree.setGitStatus(entries)` (untested in spike but documented)
- **Row decorations** work after one footgun (see below)

**Verdict**: ship it. Building this from scratch (`react-arborist`/`react-window` + a11y + virtualization + shadow-DOM) is a multi-week project even with good libraries. Pierre Trees is production-grade today.

**Effort saved vs. building from scratch**: ~2-3 weeks.

## `@pierre/diffs` — quality renderer, not drop-in UX ⚠️✅

Rendering quality is excellent. **Accept/Reject buttons are NOT built-in despite README implication.**

**What works out of the box**
- **Split layout** with proper old/new columns
- **Syntax-highlighted markdown** preserved through diff (Shiki under the hood)
- **Line numbers** in dedicated gutter
- **Word-level diff highlighting** within changed lines
- **Change indicators** (red/green bars in gutter)
- **Hatched gaps** for missing lines on each side
- **Header** with filename + `-N/+N` metadata
- **Hooks**: `renderAnnotation`, `renderGutterUtility`, `onPostRender`

**Critical caveat**: marketing copy mentions "custom accept/reject UI support" — in practice this means **you build your own Accept/Reject buttons outside the component**. The component exposes annotation/gutter hooks; the actual decision UX (where buttons live, how state flows, per-hunk granularity) is 100% yours to write.

For md-collab specifically: thread `proposed_edit` is a single contiguous replacement, so per-hunk accept/reject can be a single button pair *outside* the diff. But if md-collab ever supports multi-hunk suggestions, the inline-per-hunk accept/reject becomes the renderer's responsibility via `renderAnnotation` returning custom buttons rendered into the gutter.

**Verdict**: ship it, with eyes open. Saves the heavy lifting (Shiki integration, split-pane layout, virtualization-friendly rendering, shadow-DOM isolation, theme system). Doesn't save the decision-UX work.

**Effort saved vs. building from scratch**: ~1-2 weeks. (Down from the initial "~1-2 weeks" estimate; would have been ~3-4 weeks if it had truly been drop-in accept/reject.)

## Concrete frictions discovered

These cost ~2 hours of fumbling during the spike; documenting so a future md-collab author doesn't repeat them.

### Trees
1. **Row decoration DOM contract is undocumented.** Real selector is `[data-item-section="decoration"]`, decoration content emits as a bare `<span title="...">`. Discovered by grep on `dist/`, not from README.
2. **All styling is shadow-DOM-only.** Use the `unsafeCSS` option to target library-internal data attributes. There's no documented "stable API vs internal" attribute boundary.
3. **`onSelectionChange` is the only click event.** No `onActivate` / `onItemClick` / double-click distinguishing. Works fine for "show diff on click" but limits richer interaction.

### Diffs
4. **README is misleading/sparse.** Says "see diffs.com" — diffs.com is also thin. Real API discoverable only from `.d.ts` files in `node_modules/@pierre/diffs/dist/`.
5. **README example pattern doesn't match real API.** `appendChild(diff.element)` shown in docs; real pattern is `diff.render({ containerWrapper })`. Don't trust the README; trust the types.
6. **`theme:` (singular) not `themes:`.** Even when supplying a `{dark, light}` object, the option is `theme: { dark, light }` + a separate `themeType: 'dark' | 'light'`.
7. **Async first paint.** Shiki has to load grammars before any content renders. Without an explicit `preloadHighlighter({langs, themes})` call before instantiating `FileDiff`, users see an empty pane for several hundred ms while Shiki loads. **Always preload.**
8. **Constructor takes display options only.** `oldFile`/`newFile` go to `render({...})`, NOT the constructor. Easy to miss.

### Other
9. **No git status fed in this spike.** Would integrate naturally for md-collab once it gains git awareness via `tree.setGitStatus()`.
10. **Bundle size is dominated by Shiki grammars (~1.5MB gzipped of the 1.8MB total).** Bundle splitting / lazy-loading grammars per-language is possible but adds complexity.

## Bundle-size implications for option C

The 1.8MB gzipped (10MB unminified) bundle is a real consideration:

| Substrate | Implication |
|---|---|
| **Tauri** | Bundle ships in the app binary; cold-start parses ~10MB of JS. Acceptable on modern Macs but not free. Can mitigate via grammar lazy-loading. |
| **SwiftUI + WKWebView** | Same bundle, hosted in WKWebView. Cold-start cost is per-WKWebView-instantiation; negligible if the editor pane is long-lived. |
| **VS Code/Cursor extension** | Bundle ships in extension; loaded on activation. Acceptable. Most extensions are this size already. |

Recommendation: **lazy-load Shiki grammars** — only load `markdown` + `json` for md-collab's primary languages. Load others on-demand if the user opens an unfamiliar file type. Reduces cold-start cost.

## Integration sketch for `md-collab-native`

Six concrete steps from this spike:

1. **Entry points**: Tauri+React → use `@pierre/trees/react` + `@pierre/diffs/react`. Vanilla embed (Obsidian webview, VS Code webview) → default vanilla entries as in this spike.
2. **Data feed**: build a single `useFileIndex()` hook that emits `{ paths: string[], commentCounts: Map<path, {open, resolved}> }` from md-collab's workspace sidecar scanner. Push `paths` into `useFileTree({ paths })`; pass `commentCounts` into the `renderRowDecoration` closure.
3. **Diff feed**: when a thread/suggestion is selected, materialize `oldFile = { name: path, contents: edit.before_text }` and `newFile = { name: path, contents: edit.replacement_text }` from the sidecar's `proposed_edit`. Re-create the `FileDiff` instance per suggestion (cheaper than mutating one). For inline-hunk accept/reject (if/when md-collab supports multi-hunk suggestions), use `renderAnnotation` returning your own `<button>` rendered into the gutter.
4. **Theming**: use `themeToTreeStyles(theme)` to convert your Shiki theme into matching tree CSS variables. Pin diff theme to `{ dark: 'github-dark', light: 'github-light' }` (or custom Shiki theme) + `themeType: 'dark' | 'light'` from a system-pref listener. Use `unsafeCSS` for one-off brand tweaks.
5. **Git status**: when md-collab gains git awareness, call `tree.setGitStatus(entries)` — free M/A/D/U status lane.
6. **Highlighter preload**: call `preloadHighlighter({langs: ['markdown', 'json'], themes: ['github-dark', 'github-light']})` once at app boot, before any `FileDiff` instantiation. Skip the empty-first-render flash.

SSR: both packages ship `/ssr` entries (`preloadFileTree`, etc.). Only relevant if md-collab goes Next.js-style. Tauri / Obsidian / WKWebView don't need it.

## Visual artifacts

- `~/Workspaces/pierre-spike/screenshot.png` — PRD.md diff before user interaction, tree + decorations visible
- `~/Workspaces/pierre-spike/screenshot-final.png` — after click + accept toast
- Live preview (was at `http://localhost:4173/`, vite server killed at end of session)

## Verdict for md-collab option C

| Component | Verdict | Effort saved |
|---|---|---|
| `@pierre/trees` | **Use confidently.** Production-grade today. | ~2-3 weeks |
| `@pierre/diffs` | **Use, with the understanding that accept/reject is still your code.** | ~1-2 weeks |
| **Combined impact on option C** | ~3-5 weeks of UI work eliminated for a Tauri or SwiftUI+WKWebView build | ~3-5 weeks |

This refines the option-C effort estimate in `host-platform-reevaluation-2026-05-16.md`:
- Was: ~3-4 months for usable v1 with Pierre components
- Refined: **~2.5-3 months for usable v1** with these components properly integrated

Native pure-SwiftUI build (no web tech in the editor pane) does not benefit from Pierre components since they're web-only.

## Open questions

1. **Does Pierre Computer Company offer ongoing maintenance commitment?** The org has 4,276 stars and active commits, but `@pierre/trees` is `1.0.0-beta.3` (pre-1.0). Worth checking before committing a project to depend on it.
2. **License**: `@pierre/diffs` shipped under MIT (verified). `@pierre/trees` license still needs verification — the parent monorepo README didn't surface a top-level license; per-package licenses live in `packages/<name>/LICENSE.md`. Spike didn't read them; future md-collab author should confirm before depending.
3. **Lazy-loading Shiki grammars** — feasible but undocumented. Worth a follow-up spike if bundle-size becomes a concern.
4. **Multi-hunk suggestion UX** — if md-collab v0.2+ supports multiple `proposed_edit`s per thread, the `renderAnnotation` path for inline-per-hunk accept/reject becomes the right pattern. Worth a small spike to validate that path works before committing.

## Sources

- Spike repo: `~/Workspaces/pierre-spike/` (local, not committed)
- Pierre monorepo: https://github.com/pierrecomputer/pierre (4,276 stars, May 2026 active)
- Pierre Trees README: https://github.com/pierrecomputer/pierre/tree/main/packages/trees
- Pierre Diffs README: https://github.com/pierrecomputer/pierre/tree/main/packages/diffs
- Pierre demo source (canonical usage example): https://github.com/pierrecomputer/pierre/blob/main/apps/demo/src/main.ts
- Diffs marketing site: https://diffs.com (thin, defers to package README)
- Trees marketing site: https://trees.software (thin)
