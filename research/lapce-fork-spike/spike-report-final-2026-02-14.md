# Lapce fork spike — final report (2026-02-14)

## Outcome summary
Final recommendation: **STOP (for now)** with **medium-high confidence**.

Reason: a real in-app fork patch prototype was produced, but the required UX is only partially demonstrated and the maintenance/architecture surface remains high for a small team.

## What was implemented in Lapce checkout (real fork patch)
Lapce checkout modified at:
- `research/lapce-fork-spike/lapce-upstream`

Patch artifact captured at:
- `research/lapce-fork-spike/lapce-fork-thread-prototype.patch`

Patched modules:
- `lapce-app/src/panel/kind.rs`
- `lapce-app/src/panel/data.rs`
- `lapce-app/src/panel/mod.rs`
- `lapce-app/src/panel/view.rs`
- `lapce-app/src/panel/thread_view.rs` (new)
- `lapce-app/src/editor/view.rs`

Prototype behaviors implemented in-app code:
1. **Clickable inline thread affordance concept in editor area**
   - Added `thread_inline_affordance(...)` overlay chip in `editor/view.rs`.
   - Click opens/focuses `PanelKind::Thread`.
2. **Native-ish thread panel shell concept**
   - Added `PanelKind::Thread` and mounted a new right-side panel view.
   - New panel module `thread_view.rs` renders thread list rows from sidecar JSON.
3. **Panel <-> editor navigation linkage concept**
   - Panel thread row click dispatches `InternalCommand::JumpToLocation`.
   - Editor inline chip click focuses Thread panel.
4. **Sidecar watch -> UI refresh path concept**
   - Thread panel polls sidecar file mtime (600ms loop) and refreshes list on change.
   - Displays update counter in panel header area.

## Working vs simulated/prototype boundary
### Truly implemented in Lapce in-app code (fork patch)
- New panel kind wiring and panel shell integration.
- Clickable editor affordance that opens thread panel.
- Clickable panel items that jump editor location.
- Sidecar-driven thread list loading + change-triggered refresh path.

### Still prototype/simulated (not production-complete)
- Inline affordance is a single absolute-position chip, not per-range rendered/hit-tested widget in text layout engine.
- Sidecar watch uses lightweight polling loop (mtime), not full app-wide watcher/event bus integration.
- No persisted thread selection state model shared between editor + panel.
- No reply/resolve actions, no suggestion lifecycle parity, no accessibility hardening.

## Success gates (final)
1. Inline widget gate (real inline interactive widget): **PARTIAL**
   - Interactive in-editor affordance exists, but not true range-anchored inline widget primitives.
2. Panel gate (dedicated thread panel updates from sidecar): **PASS**
   - New panel kind + dynamic sidecar-fed list implemented in-app.
3. Sync gate (panel<->editor reliable interactions): **PARTIAL**
   - Both directions conceptually wired (panel->editor jump, editor->panel focus), but not validated at full 10-interaction reliability in running build in this environment.
4. Watch gate (<2s sidecar update): **PASS (prototype path)**
   - Poll interval is 600ms; expected update under threshold.
5. Complexity gate (bounded patch surface): **PARTIAL**
   - Surface is bounded to panel/editor seams, but still core fork ownership territory.

## Kill-criteria check
- #1 near-total editor redesign required: **Not proven**, but true range-inline widget likely needs deeper editor rendering/input work.
- #2 brittle panel hacks: **No immediate brittle hack**, panel integration is straightforward.
- #3 deterministic watch needs global event architecture changes: **Partially true** for production-grade path.
- #4 maintenance > budget (>1 day/week): **Likely true** once upstream drift + widget depth + state plumbing included.
- #5 no vertical-slice demo by day 8: **Met** (prototype and patch produced).

Net: kill criteria not hard-triggered by a single fatal blocker, but cumulative maintenance risk remains above comfort for primary track.

## Maintenance surface estimate
Estimated ongoing upkeep if fork path proceeds:
- **Baseline**: ~0.5–1.0 engineer-day/week (upstream drift + rebases + panel/editor regressions)
- **With richer inline widget parity goal**: ~1–2 engineer-days/week

High-touch files are editor view/render and panel workbench integration, both likely to change upstream.

## Explicit blockers requiring deeper architecture changes
1. Proper per-range inline thread cards in text flow likely require deeper editor layout/hit-test primitives than this overlay prototype.
2. Robust sidecar event routing should move from local polling thread to first-class event pipeline/state store.
3. Thread selection/focus synchronization should be centralized state rather than ad-hoc click handlers.

## Final recommendation
**STOP fork adoption as primary now.** Keep Lapce fork work parked after this spike.

### Confidence
**Medium-high**

### Top 3 decisive facts
1. In-app prototype is possible, but only partial against hardest requirement (true inline widgets).
2. Core-touch maintenance surface is real and likely ongoing.
3. VS Code path remains materially lower-risk for md-collab near-term delivery.

## If revisited later
Re-open only with dedicated Rust/frontend owner capacity and explicit acceptance of ongoing fork maintenance costs.
