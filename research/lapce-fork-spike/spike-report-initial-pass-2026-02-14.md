# Lapce fork spike — initial execution pass (2026-02-14)

## Scope covered in this pass
Minimal vertical-slice feasibility pass for:
1. inline thread widget behavior prototype
2. dedicated thread navigation panel prototype
3. panel <-> editor navigation sync concept
4. sidecar watch/update integration concept

## Environment + artifacts
- Branch: `research/lapce-fork-spike`
- Isolated upstream Lapce inspection clone:
  - `research/lapce-fork-spike/lapce-upstream` (depth=1)
- Runnable concept prototype:
  - `research/lapce-fork-spike/prototype/thread-vertical-slice.mjs`
  - `research/lapce-fork-spike/prototype/sample.comments.json`

## What was implemented
A runnable event-flow prototype that demonstrates the end-to-end interaction model:
- **Inline widget model**: range-anchored thread widgets represented as structured UI chrome metadata (`inline-thread-widget`, actions, focused state).
- **Thread panel model**: panel list updates from thread store.
- **Bidirectional sync**:
  - panel item click focuses/reveals editor anchor
  - editor inline widget click focuses panel item
- **Sidecar watch integration**: `fs.watch` reload path updates thread store and panel/editor render state.

## Verification commands + outcomes
1. `git checkout research/lapce-fork-spike` -> already on branch.
2. `git clone --depth 1 https://github.com/lapce/lapce.git research/lapce-fork-spike/lapce-upstream` -> success.
3. Lapce touchpoint inspection (panel/editor code paths):
   - `lapce-app/src/panel/kind.rs`
   - `lapce-app/src/panel/data.rs`
   - `lapce-app/src/panel/view.rs`
   - `lapce-app/src/doc.rs` (phantom text path)
4. `node research/lapce-fork-spike/prototype/thread-vertical-slice.mjs` -> success.
   - 10 panel<->editor focus interactions completed
   - sidecar watch refresh observed with sub-2s latency (measured ~0.27ms in local run)

## Core Lapce touchpoints (likely required for real fork implementation)
### Requires **core Lapce modification**
1. **Real inline widget (interactive, non-text-only)**
   - Existing obvious extension point is phantom/inlay text in `lapce-app/src/doc.rs`.
   - Requirement calls for clickable widget chrome, likely needing editor render/input hit-testing extensions in core view layer.
2. **Dedicated new panel type**
   - Add `PanelKind::Thread` and integrate across panel ordering/state/view switch paths:
     - `lapce-app/src/panel/kind.rs`
     - `lapce-app/src/panel/data.rs`
     - `lapce-app/src/panel/view.rs`
3. **Panel<->editor focus synchronization commands/state**
   - Needs first-class thread focus state and command dispatch hooks.
4. **Sidecar watch event bridge into UI state**
   - Deterministic routing from watcher -> model store -> panel/editor refresh likely needs app-level state plumbing.

### Potential **plugin-level** (but limited)
1. Parsing sidecar JSON and producing thread model data.
2. Possibly command triggers and basic navigation actions.

### Key blocker boundary
- Plugin path appears insufficient for a **true inline interactive widget** + **native panel contribution parity** without core fork patches.

## Success gates status (initial pass)
1. Inline widget gate (real interactive inline UI element): **PARTIAL**
   - Proven concept model + interaction flow.
   - Not yet implemented as a real Lapce-rendered interactive inline widget.
2. Panel gate (dedicated thread panel updates from sidecar source): **PARTIAL**
   - Proven with runnable prototype.
   - Not yet wired as actual Lapce panel type in fork code.
3. Sync gate (10 reliable panel<->editor interactions): **PASS (prototype)**
   - 10 interactions completed in harness.
4. Watch gate (<2s update latency): **PASS (prototype)**
   - File watch update observed quickly in local run.
5. Complexity gate (bounded patch surface): **PARTIAL**
   - Touchpoints are identifiable and bounded, but still in core panel/editor/state paths.

## Recommendation (after initial pass)
**Continue fork spike (time-boxed), not stop yet.**

Reason:
1. Vertical-slice interaction model is coherent and reproducible.
2. Required modifications look focused to known panel/editor/state seams.
3. Biggest risk is inline interactive widget implementation; this should be the next hard gate before deeper investment.

## Next concrete step (for next execution pass)
Implement a minimal real Lapce fork patch:
1. add `PanelKind::Thread` and basic panel view shell,
2. wire a temporary in-memory thread store,
3. implement one clickable inline thread chip in editor rendering path,
4. demonstrate end-to-end navigation sync in-app.
