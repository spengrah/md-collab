# spec-for-pr-review-overlay-ui-v0

Status: superseded (merged into `../../spec-for-review-interaction-model.md`)  
Scope: on-document PR-review-style overlay UX in native VS Code editor

## 1. Goal
Increase content/thread coupling by rendering thread metadata directly in document view, while keeping native editor constraints.

## 2. Overlay stack (required)
Implement three density layers that may coexist:

1. **Range highlight layer**
   - Highlight anchor ranges for open threads by relevance/status style.
2. **Inline signal layer**
   - Add end-of-line or inlay/codelens compact chips:
     - thread count
     - relevance badge (`active/outdated/orphaned`)
     - quick actions (`Reply`, `Resolve/Reopen`, `Jump`, `View referenced version`)
3. **Gutter marker layer**
   - Distinct marker for lines with threads.

## 3. Interaction contract
1. Clicking overlay signal must focus/select associated anchor range.
2. Thread action triggers must route to canonical commands (no duplicate mutation paths).
3. Hover on overlay must provide concise thread summary (author, last message, relevance).

## 4. Visual semantics
1. Open+active: strongest emphasis.
2. Open+outdated: warning style.
3. Orphaned: degraded style + explicit call to action.
4. Resolved overlays hidden by default; configurable reveal toggle.

## 5. Performance constraints
1. Overlay refresh must be incremental on file edits where feasible.
2. Avoid full-doc recompute on every cursor move.
3. Must remain responsive for >= 2k line markdown files with >= 100 threads.

## 6. Accessibility requirements
1. Overlay signals must have text or tooltip equivalents.
2. Color-only encoding is insufficient; include icon/text state tokens.
3. Keyboard-only navigation to next/previous thread anchor is required.

## 7. Acceptance criteria
1. User can discover and act on thread state without opening panel.
2. Overlay actions preserve sidecar correctness and conflict protections.
3. UX feels materially tighter than panel-only mode in remote workflow tests.
