# Host platform re-evaluation — May 2026

Project: md-collab
Date: 2026-05-16
Status: Concluded
Sibling docs: `host-platform-rubric.md` (2026-02-12), `host-platform-candidates.md` (2026-02-12), `lapce-frontend-evaluation-2026-02-14.md`

## Purpose

The Feb 2026 host platform evaluation concluded: VS Code primary, Lapce secondary (later paused after spike failed). Three months later, two questions deserved re-answering:
1. Has the substrate landscape changed enough to revisit the conclusion?
2. Has the candidate field expanded to platforms that were missed in Feb?

This document records the May 2026 answer to both, plus three adjacent findings (a reusable UI component ecosystem, a kindred-spirit competing product, and an alternative anchor model) that shift the practical recommendation without changing the substrate verdict.

## Scope assessed

1. Score deltas vs Feb 2026 for all prior-evaluated candidates
2. A wider sweep of platforms missed in Feb (~25 candidates)
3. Reusable component libraries that change the build-cost calculus for a native option
4. Adjacent products in the same space that ship in 2026 (validation + competitive context)
5. Alternative anchor models in adjacent tools

## Headline finding

**Substrate verdict unchanged: VS Code remains primary.** What changed:

1. The competitive landscape is *broader* than Feb knew about. ~10 viable VS Code-fork hosts now exist (Theia, Trae, PearAI, Aide, Positron, Kiro, Cursor, Windsurf, Antigravity, VSCodium). All share the VS Code extension API surface.
2. The most actionable insight is distribution-shaped, not substrate-shaped: **publishing to OpenVSX makes md-collab installable in every fork above for ~30 min of CI work.**
3. The "native macOS feel + rich plugin API" combination remains structurally unsatisfiable in 2026 — every host with sufficient extension primitives is built on the VS Code platform.
4. Two competing extensions (`markdown-review`, `markdown-threads`) shipped on VS Code in 2026 with nearly identical sidecar architecture to md-collab. **Neither has suggested-edit accept/reject.** This is industry-wide implementation gap, not substrate gap — and md-collab's strongest differentiation lever.

## Method

- Spawned two research passes:
  - Pass 1: Score deltas + recheck of Feb candidates against May 2026 evidence
  - Pass 2: Wider sweep of platforms missed in Feb (~25 candidates explicitly outside the Feb list)
- Direct inspection of:
  - The two newly-shipped VS Code competitors (`jinqishen0725/markdown-review`, `busadave13/markdown-threads`)
  - Pierre Computer Company monorepo (`pierrecomputer/pierre`)
  - `badlogic/jot` (kindred-spirit collaborative markdown editor with comment threads)
  - `mweidner037/articulated` (jot's anchor primitive)
- All citations dated and URL-linked

## Updated candidate scores (deltas vs Feb)

Scoring against the rubric in `host-platform-rubric.md`. Deltas in parens.

| Candidate | A–F API | Plugin maturity | SSH/remote | Maint. risk (5=low) | Time-to-MVP | Total | Tier |
|---|---:|---:|---:|---:|---:|---:|---|
| **VS Code** | 5 (=) | 5 (=) | 5 (=) | 5 (+1) | 5 (=) | **25** | Now |
| **Theia (new)** | 5 | 4 | 5 | 4 | 4 | **22** | Now |
| **VSCodium** | 5 (+1) | 4 (=) | 4 (=) | 4 (+1) | 4 (=) | **21** | Now |
| **Cursor (new)** | 5 | 4 | 4 | 3 | 5 | **21** | Now (caveat) |
| **Windsurf (new)** | 5 | 4 | 4 | 3 | 5 | **21** | Now (caveat) |
| **Trae (new)** | 5 | 3 | 4 | 2 | 4 | **18** | Maybe |
| **PearAI (new)** | 5 | 3 | 4 | 2 | 4 | **18** | Maybe |
| **Aide / CodeStory (new)** | 5 | 3 | 4 | 2 | 4 | **18** | Maybe |
| **Positron (new)** | 5 | 3 | 4 | 3 | 4 | **19** | Maybe (niche) |
| **Antigravity (new)** | 5 | 3 | 4 | 2 | 4 | **18** | Track |
| **Kiro (new)** | 4 | 2 | 4 | 2 | 3 | **15** | Track (broken) |
| **Zed** | 2 (=) | 3 (=) | 4 (+1) | 4 (+1) | 2 (=) | **15** | No |
| **Nova (Panic)** | 1 | 3 | 4 | 4 | 3 | **15** | No (no decorations) |
| **Lapce** | 1 (=) | 2 (=) | 3 (=) | 2 (=) | 1 (=) | **9** | No |
| **MarkEdit** | 3 | 3 | 0 | 4 | 4 | **14** | No (no SSH, no file tree) |
| **Fleet → Air** | n/a | n/a | n/a | n/a | n/a | **withdrawn** | Pivoted to agent orchestrator |
| **Helix** | 1 (=) | 1 (=) | 5 (=) | 1 (=) | 1 (=) | **9** | No |

### Notable deltas

- **VS Code +1 maint risk (i.e. now 5/5)**: Microsoft's continued investment + the proliferation of forks reduces concentration risk. Even if Microsoft did something hostile, the API surface lives on in Theia, Cursor, Trae et al.
- **VSCodium +1 API fit**: Confirmed 1:1 API parity with VS Code in May 2026; no longer a slight downgrade.
- **Zed +1 SSH**: v1.1.5 (May 6 2026) shipped SSH ControlMaster reuse. SSH is now genuinely workable in Zed. **However, A-F API fit remains 2/5** — issue `zed-industries/zed#49438` ("Expose Inlay/Decoration APIs to Extensions"), opened Feb 18 2026, is still untriaged as of May 2026. Zed's May 2026 roadmap has zero extension API expansion items. The decoration/panel/FS-watch gap that blocked md-collab in Feb is *unchanged*.
- **Zed +1 maint risk**: v1.0 stable shipped Apr 29 2026, reducing bus-factor risk.
- **MarkEdit added** (was not in Feb pool): 3/5 API via WKWebView+CodeMirror 6 bridge, but lacks file tree and SSH. Ruled out by `markedit-plugin-spike-2026-05-16.md` (informal, see below).
- **Fleet withdrawn**: JetBrains pivoted Fleet to **Air** (Mar 16 2026) — an agent orchestrator that runs *alongside* your editor, not replacing it. Removes Fleet from comparison entirely.

## Wider sweep — candidates missed in Feb

The Feb evaluation had a 12-platform pool. The May sweep pulled in ~25 additional candidates. Most were ruled out quickly (TUI-only, no plugin API, abandoned, no SSH). The non-trivial findings:

### Theia (Eclipse Foundation)
- Full VS Code ext API parity (1.108 as of 2026-02 release)
- OpenVSX distribution, runs desktop *and* cloud (Eclipse Che)
- **Strongest non-Microsoft path** — sidesteps Marketplace politics
- Verdict: tier-1 supported host alongside VS Code

### Aide / CodeStory
- Open-source VS Code fork explicitly positioned as "AI-native IDE for multi-file edits"
- Closest narrative fit for an agent-collab tool like md-collab
- Verdict: tier-2, listed as supported host, worth personal testing

### Trae (ByteDance)
- Highest-volume new VS Code fork entrant of 2025-26
- Full VS Code API + MCP
- Caveat: documented heavy outbound telemetry to ByteDance servers (Neowin report)
- Verdict: extension lands automatically via OpenVSX; flag the privacy posture for user-facing recommendations

### Honorable mentions (ruled out, recorded for future re-eval)

- **Kiro** (replacing Amazon Q): extension compat currently broken — extensions check Kiro's version string instead of underlying VS Code engine (issue `kirodotdev/Kiro#2351`). Re-evaluate in 6 months.
- **Void**: open-source Cursor alternative, dev paused early 2026
- **PearAI / Positron / Antigravity**: VS Code forks, all viable extension hosts, lower priority than Theia/Trae/Cursor due to narrower audiences
- **Nova (Panic)**: native macOS editor with JS extensions and sidebars, but **no general decorator API for inline ranges/popovers**. Cannot do Google-Docs-style anchored comments UX.
- **Jot (badlogic)**: self-hosted web app, NOT a substrate but a kindred-spirit competing product — see separate findings below
- **Conductor, Wrangle, Quietly, Claude Code desktop, Spark, Augment, Continue.dev**: agent orchestrators or extension-only tools, not viable extension hosts

## The OpenVSX distribution insight

Every viable host scoring 14+ in this sweep — Theia, Trae, PearAI, Aide, Positron, Cursor, Windsurf, Antigravity, Void, Kiro — implements the VS Code extension API. The platform competition has been won; the fight is now about which **fork** a developer runs.

**Practical implication for md-collab:** a single `vscode.*`-API extension, **published to OpenVSX**, lands in every fork listed above. VS Code itself stays on the MS Marketplace (separately published). One extension codebase, ten+ hosts.

This is the highest-leverage substrate-related action the project can take in 2026. Cost: ~30 min CI work (`ovsx publish` step). Benefit: 10x distribution.

## Reusable components discovered

### `@pierre/trees`
- Path-first file tree UI component (vanilla + React + Preact + Web Components + SSR entry points)
- Shadow-DOM isolated styles; canonical-path API
- Built-in: search, git status overlays, context menus, drag/drop, row decorations, theme adaptation via `themeToTreeStyles(theme)`
- License: see pierre repo (parent is OSS)
- Material to md-collab if option C (native client) is pursued: drop-in file tree, ~1 day to integrate. Saves 1-2 weeks of building from scratch.

### `@pierre/diffs`
- Diff rendering library (stacked or split layouts, Shiki-based highlighting)
- **Built-in accept/reject button affordances and annotation hooks** — the exact UX primitives md-collab needs for suggested-edit accept/reject
- Material to md-collab: drop-in suggestion-diff renderer. Saves 1-2 weeks.

### Combined impact on option C (native client) build
- Was: ~3-4 months for usable v1
- With Pierre components: **~2-3 months**
- Only helps if option C uses a web-tech editor pane (Tauri OR SwiftUI+WKWebView). Doesn't help a pure-SwiftUI build.

## Adjacent products evidence

Two VS Code extensions shipped in 2026 in the same problem space as md-collab:

### `jinqishen0725/markdown-review` (March 2026)
- Invisible HTML-comment anchors (`<!--@cXXX-->`) + `.filename.md.comments.json` sidecar
- Gutter "+" buttons, yellow border decorations, popovers, sidebar threads
- Copilot tool registration
- **No accept/reject suggested edits**

### `busadave13/markdown-threads` v1.0.4 (Apr 20 2026)
- `.comments.json` sidecars, stale-comment detection
- Sidebar with per-file comment counts
- Preview-side highlight-to-comment
- **No accept/reject suggested edits**

### `badlogic/jot` (early 2026)
- Self-hosted Node.js + Express + WebSockets web app
- "Built for humans and agents" — same mission as md-collab
- **Inverted architecture: JSON is source of truth, `.md` is derived** (md-collab is the reverse)
- Real-time multi-cursor collab via WebSockets
- Share-link-as-credential pattern for agents (no API key juggling)
- Clean `{oldText, newText}` JSON edit primitive
- 311 stars, single maintainer (Mario Zechner / libgdx fame)
- Uses `articulated` for anchor stability — see anchor models below

**Interpretation**: the product space has multiple converging solutions. The gap is consistent across all three competitors: **none has shipped suggested-edit accept/reject UX.** This is md-collab's strongest differentiation lever, and the schema already supports the full suggestion lifecycle.

## Anchor model alternatives

| Approach | Mechanism | Tradeoffs |
|---|---|---|
| **md-collab (current)** | Positional anchors + quote/context fallback + post-hoc re-anchoring engine | Keeps `.md` clean; accepts some anchor drift with confidence labels |
| **CriticMarkup (MultiMarkdown, Obsidian Commentator, MarkText)** | Inline `{++ ++}`, `{-- --}`, `{>> <<}` markers in the `.md` | Survives any editor; pollutes canonical content (md-collab non-goal §2 PRD); single-block only |
| **articulated / CRDT-style (jot)** | Every list element (char or block) gets a stable UUID; anchors reference UUIDs; no re-anchoring needed | Anchors never drift; must persist UUID-to-position mapping; either pollutes `.md` (UUIDs in markers) or requires runtime tracking layer (Y.js/Automerge complexity) |

**Decision: keep md-collab's current approach.** The hybrid positional + quote/context model is the right choice for the "canonical `.md` stays clean" constraint locked in `PRD.md` §3.1.1. The articulated model is the right tool for a future real-time collaborative variant, but not for the current local-first design.

(Detailed jot anchor logic extraction is in `jot-anchor-model-analysis-2026-05-16.md`, pending.)

## Updated recommendation stack

1. **Stay on VS Code primary.** No substrate change.
2. **Add OpenVSX as a publishing target.** ~30 min CI work; multiplies reach by 10x. Reaches Theia, Cursor, Trae, PearAI, Aide, Positron, Antigravity, Windsurf, Kiro, Void, OpenSumi-derived IDEs.
3. **List Theia + Cursor + Aide as explicitly-supported hosts in README.** Free goodwill, zero engineering cost.
4. **Diagnose the real UX gap.** The unmet need ("md-collab isn't good enough yet to use daily") is *implementation gap* (specifically the suggested-edit accept/reject UX), not substrate gap. Two competitors with similar architecture have the same gap. Closing it is md-collab's strongest differentiation lever.
5. **If option C (native client) becomes a real direction**: use Tauri + CodeMirror 6 + `@pierre/trees` + `@pierre/diffs` + md-collab TS core. Estimated v1 effort: ~2-3 months. SwiftUI-pure alternative loses Pierre components' time savings; viable but slower.
6. **Don't fork anything.** MarkEdit ruled out (no file tree, no SSH, monolithic). Lapce already ruled out (Feb). Ferrite ruled out (5-month-old solo monolith). VS Code fork has no upside if you can publish via OpenVSX.

## Confidence

- **High**: substrate verdict (VS Code primary), OpenVSX distribution insight, Pierre components viability, Zed extension API gap, MarkEdit limitations, fork ruling
- **Medium**: native-client (option C) effort estimate — depends on solo developer pace, SSH architecture choice, and whether SwiftUI vs Tauri is chosen
- **Medium**: which UX specifically feels broken in the current VS Code md-collab extension — needs user-driven diagnostic, not more research

## Open questions

1. **What specifically about the current VS Code md-collab extension feels "not good enough yet"?** Answering this drives whether option C is justified.
2. **Should we add an MCP server wrapper on top of `mdc`?** Bringing md-collab in line with Sidemark/MRSF and Changedown. Estimated 1-2 days.
3. **Should we ship to OpenVSX now or wait for v0.2?** No reason to wait; recommend doing it next release.
4. **Pierre Trees + Diffs integration spike results** — pending agent report.
5. **Jot anchor-model deep-dive** — pending agent report, will inform a small companion doc.

## Notes

This document is the May 2026 sibling to the Feb 2026 evaluation set. It is intended to be revisited again in ~Aug–Sep 2026, especially if:
- Zed ships extension decoration/panel APIs (track issue `zed-industries/zed#49438`)
- A new native macOS editor emerges with rich extension primitives
- One of the VS Code forks (Cursor, Windsurf) ships fundamentally different extension capabilities
- md-collab v0.2 ships and user feedback identifies whether the UX gap was substrate or implementation

## Sources

- [VS Code Comments API](https://code.visualstudio.com/api/references/vscode-api)
- [Zed Issue #49438 — Expose Decoration APIs to Extensions](https://github.com/zed-industries/zed/issues/49438) (opened Feb 18 2026, untriaged May 2026)
- [Zed Roadmap May 2026](https://zed.dev/roadmap)
- [Zed Release Notes (Releasebot)](https://releasebot.io/updates/zed)
- [Cursor Plugins Reference](https://cursor.com/docs/reference/plugins)
- [Windsurf Changelog](https://windsurf.com/changelog)
- [JetBrains Air launch (Mar 16 2026)](https://blog.jetbrains.com/air/2026/03/air-launches-as-public-preview-a-new-wave-of-dev-tooling-built-on-26-years-of-experience/)
- [`jinqishen0725/markdown-review`](https://github.com/jinqishen0725/markdown-review) (Mar 2026)
- [`busadave13/markdown-threads` v1.0.4](https://github.com/busadave13/markdown-threads) (Apr 20 2026)
- [Theia 2026-02 release](https://eclipsesource.com/blogs/2026/03/26/the-eclipse-theia-community-release-2026-02/)
- [Trae telemetry report (Neowin)](https://www.neowin.net/news/report-bytedances-vs-code-fork-trae-is-a-resource-hog-that-spies-on-you/)
- [Aide / CodeStory repo](https://github.com/codestoryai/aide)
- [Kiro extension compat issue #2351](https://github.com/kirodotdev/Kiro/issues/2351)
- [Q Developer EOL](https://aws.amazon.com/blogs/devops/amazon-q-developer-end-of-support-announcement/)
- [Pierre Computer Company monorepo](https://github.com/pierrecomputer/pierre) — `@pierre/trees`, `@pierre/diffs`
- [`badlogic/jot`](https://github.com/badlogic/jot) (kindred-spirit competing product)
- [`mweidner037/articulated`](https://github.com/mweidner037/articulated) (stable element IDs primitive)
- [Nova v13.4 release notes](https://nova.app/releases/) · [Nova extensions](https://extensions.panic.com/)
- [MarkEdit extensions wiki](https://github.com/MarkEdit-app/MarkEdit/wiki/Extensions)
- [OpenVSX](https://open-vsx.org/)
