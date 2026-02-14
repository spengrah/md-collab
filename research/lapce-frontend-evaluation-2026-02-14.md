# Lapce frontend evaluation for md-collab (2026-02-14)

## Executive summary
Recommendation: **VS Code primary + Lapce secondary (exploratory)**.

Lapce is promising architecturally (Rust frontend + proxy + SSH-first remote model), but current plugin surface appears too narrow for md-collab’s required UX (rich inline threads/suggestions/navigation panels) without core changes.

## Scope assessed
1. Lapce as a plugin target
2. Lapce as a fork target
3. Comparison to current VS Code path
4. Phased recommendation with decision gates

## Confirmed references
- Lapce site: https://lapce.dev/
- Lapce plugin development docs: https://docs.lapce.dev/development/plugin-development
- Lapce architecture docs: https://docs.lapce.dev/development/architecture
- Lapce remote development docs: https://docs.lapce.dev/get-started/remote-development
- Lapce plugin API crate source docs:
  - https://docs.rs/lapce-plugin/latest/src/lapce_plugin/lib.rs.html
  - https://github.com/lapce/psp-types/blob/master/src/lib.rs
- Lapce proxy watcher implementation:
  - https://github.com/lapce/lapce/blob/master/lapce-proxy/src/watcher.rs

VS Code comparison sources:
- API reference: https://code.visualstudio.com/api/references/vscode-api
- vscode.d.ts: https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.d.ts
- Webview guide: https://code.visualstudio.com/api/extension-guides/webview
- Remote-SSH docs: https://code.visualstudio.com/docs/remote/ssh

## Feasibility by requirement (Lapce plugin-only)
| Requirement | Feasibility |
|---|---|
| Inline comment/thread overlays | Low |
| Suggestion apply/reject UX in-editor | Low–Medium |
| Panel/thread navigation UI | Low |
| Sidecar file IO + watch/reload | Medium |
| Workspace-first + optional git/hybrid timeline semantics | Medium |
| Remote/SSH practicality | Medium–High |

Interpretation: plugin API appears closer to LSP/process orchestration than deep editor-chrome UI extension points.

## Lapce fork assessment
A fork could unlock native inline review widgets and full collaboration chrome, but with high maintenance and velocity risk.

- Maintenance burden: High
- Delivery risk: High
- Compatibility drift risk: Medium–High
- Staffing requirement (Rust/editor internals): High

## VS Code comparison
VS Code offers stronger immediate extension primitives for md-collab’s UX goals:
- first-class Comments API / thread model
- decorations/inlay/CodeLens surfaces
- tree/webview/panel primitives
- mature filesystem watcher APIs
- proven Remote-SSH workflow

Conclusion: VS Code has higher near-term execution confidence and lower platform risk.

## Recommendation
### Preferred path: VS Code primary + Lapce secondary

Phase 0 (now, 1–2 weeks):
- Continue shipping md-collab UX on VS Code.

Phase 1 (parallel, 2–4 weeks):
- Lapce discovery spike for one hard requirement:
  - inline thread widget + navigation panel behavior.
- Document blockers that require core changes.

Decision gate:
- If Lapce plugin can reach >=70% of target UX without fork, continue plugin track.
- Otherwise pause plugin path and avoid fork unless strategic priorities justify platform ownership.

## Confidence
- High: VS Code capability breadth and Lapce plugin API narrowness from cited sources.
- Medium: exact Lapce UI-extension ceiling (docs may underrepresent internal capabilities).

## Notes
This document is intended as a strategic frontend-host decision artifact and should be revisited after a concrete Lapce plugin spike.

## Lapce spike results (2026-02-14)

### Scope of this spike
Concrete plugin-capability probe for md-collab hard requirement:
- inline thread widget/overlay in editor text area,
- dedicated navigation panel/tree view,
- clickable actions tied to ranges,
- sidecar file change watching at plugin level,
with **plugin-first, no fork** constraint.

### What I did (hands-on)
1. Pulled current Lapce source (`master`) locally for direct API/path inspection:
   - local checkout: `/tmp/lapce-spike`
2. Verified plugin host request surface by inspecting plugin protocol handler:
   - `/tmp/lapce-spike/lapce-proxy/src/plugin/psp.rs:954-1085`
3. Verified plugin/LSP capability routing surface (what methods a plugin can practically ride through):
   - `/tmp/lapce-spike/lapce-proxy/src/plugin/psp.rs:739-861`
4. Verified text-change/save notifications available to plugin-hosted LSP path:
   - `/tmp/lapce-spike/lapce-proxy/src/plugin/psp.rs:1195-1285`
5. Verified filesystem watcher implementation location and routing boundaries:
   - watcher implementation: `/tmp/lapce-spike/lapce-proxy/src/watcher.rs`
   - watcher consumption is proxy/core-side (not plugin API): `/tmp/lapce-spike/lapce-proxy/src/dispatch.rs:1243-1325`
6. Cross-checked public plugin crate/API docs:
   - `lapce-plugin` crate source (docs.rs): `https://docs.rs/lapce-plugin/latest/src/lapce_plugin/lib.rs.html`
   - `psp-types` request definitions: `https://github.com/lapce/psp-types/blob/master/src/lib.rs`

### Findings by requirement

#### 1) Render inline thread UI/overlays in editor text area
**Result: FAIL (plugin-only)**

Evidence:
- Public plugin trait is generic RPC handling (`handle_request`, `handle_notification`) with no editor-widget/decorations/view contribution API in `lapce-plugin` surface.
- Plugin→host request handling in current proxy accepts a narrow set (work-progress/register-capability/execute-process/debugger/LSP spawn+relay only):
  - `/tmp/lapce-spike/lapce-proxy/src/plugin/psp.rs:960-1085`
- No plugin API entry points found for custom inline UI widget injection into editor layout/chrome.

Implication:
- You can leverage LSP-native surfaces (diagnostics, semantic tokens, inlay hints, code lens) but not true custom thread cards/controls anchored in text like VS Code comments widget behavior.

#### 2) Contribute dedicated navigation panel/tree view
**Result: FAIL (plugin-only)**

Evidence:
- No plugin-side panel/tree registration API in `lapce-plugin` or psp host request set.
- Existing panel implementations are app/core-side Floem views, not plugin-contributed dynamic view extensions (example panel module architecture in `lapce-app/src/panel/*`, e.g. plugin management panel).
- Plugin protocol handler does not expose "register panel/view/tree" style method:
  - `/tmp/lapce-spike/lapce-proxy/src/plugin/psp.rs:960-1085`

Implication:
- A true first-class "md-collab threads" side panel/tree likely requires core changes/fork (or severe UX compromise via command palette/document symbols abuse).

#### 3) Clickable actions tied to ranges
**Result: PARTIAL**

What appears feasible:
- Through LSP capability path Lapce supports CodeLens/CodeAction/InlayHint/etc mediation:
  - `/tmp/lapce-spike/lapce-proxy/src/plugin/psp.rs:802-854`
- This can provide clickable range-adjacent actions in LSP-native ways (e.g., CodeLens command text above lines).

Limitations:
- Not equivalent to rich inline thread widgets (avatars, reply editor, per-thread state controls).
- Interaction model constrained by LSP primitives and Lapce’s existing rendering semantics.

#### 4) Watch sidecar file changes at plugin level
**Result: PARTIAL (workaround-only)**

What exists:
- Proxy/core has filesystem watcher infra:
  - `/tmp/lapce-spike/lapce-proxy/src/watcher.rs`
  - routed in `/tmp/lapce-spike/lapce-proxy/src/dispatch.rs:1284+`
- Plugin API does expose `ExecuteProcess`, enabling ad-hoc external process execution:
  - `/tmp/lapce-spike/lapce-proxy/src/plugin/psp.rs:970-981`

Blocker:
- No direct plugin-level subscribe/watch callback API surfaced through current PSP for arbitrary sidecar files.

Workaround paths:
- Poll sidecar via periodic `execute_process` (inefficient/fragile).
- Spawn custom LSP/external daemon and push state via LSP channels (complex; still no native panel/widget APIs).

### Exact blockers (plugin-first, no fork)
1. **No custom editor inline-widget extension point** in plugin API.
2. **No contributed panel/tree view extension point** in plugin API.
3. **No plugin-level filesystem watch subscription API** for sidecar files.
4. Available extensibility is predominantly **LSP protocol plumbing + process execution**, not editor-chrome UI composition.

### Practical verdict for hard requirement
**Verdict: FAIL** (for the stated hard requirement as-is, plugin-only/no-fork).

Rationale:
- Requirement requires both inline thread widget behavior and dedicated navigation panel behavior.
- Current plugin surface supports neither as first-class extension points.
- Range-click actions are only partial via LSP primitives and do not close the gap.

### Confidence + evidence
**Confidence: Medium-High**
- High confidence in current plugin host-request surface and missing UI extension hooks (direct source inspection).
- Medium confidence on "no hidden internal hook" risk (always possible in fast-moving upstream), but no evidence found in current master paths.

Key evidence paths/URLs:
- `/tmp/lapce-spike/lapce-proxy/src/plugin/psp.rs:739-861, 954-1085, 1195-1285`
- `/tmp/lapce-spike/lapce-proxy/src/watcher.rs`
- `/tmp/lapce-spike/lapce-proxy/src/dispatch.rs:1243-1325`
- `https://docs.rs/lapce-plugin/latest/src/lapce_plugin/lib.rs.html`
- `https://github.com/lapce/psp-types/blob/master/src/lib.rs`

### Recommended next decision
**Recommendation: pause plugin-only Lapce path for this hard requirement; start a focused fork-spike only if Lapce strategic priority remains high.**

Suggested gate:
- If we need true inline discussion widgets + dedicated thread panel in Lapce, run a timeboxed fork-spike to estimate core touchpoints and maintenance cost.
- Otherwise keep md-collab primary on VS Code extension path.

## Fork spike final conclusion (2026-02-14)
A fork-level in-app prototype was completed (panel kind + panel shell + editor affordance + panel/editor jump wiring + sidecar refresh concept). See:
- `research/lapce-fork-spike/spike-report-final-2026-02-14.md`
- `research/lapce-fork-spike/lapce-fork-thread-prototype.patch`

Final decision after fork spike: **STOP Lapce fork as primary near-term path**; keep **VS Code primary**.

Why:
1. Required inline thread UX is still only partial in fork prototype (not true range-inline widget parity).
2. Core maintenance surface remains high for small-team ownership.
3. VS Code still offers materially higher delivery confidence for md-collab timelines.

Confidence: **Medium-High**.
